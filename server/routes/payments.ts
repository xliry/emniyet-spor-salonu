import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PAYMENT_METHODS } from '../../shared/enums.js'
import { AppError, conflict, notFound } from '../../shared/errors.js'
import { isManager, requireRole } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, paymentRecords } from '../db/schema.js'
import { parseWith, uuidSchema } from '../utils.js'

const paymentSchema = z.object({
  amountCents: z.number().int().positive(), method: z.enum(PAYMENT_METHODS), paidAt: z.string().datetime({ offset: true }).optional(),
  reference: z.string().max(120).nullable().optional(), note: z.string().max(500).nullable().optional(), allowOverpayment: z.boolean().default(false),
}).strict()

export async function paymentRoutes(app: FastifyInstance) {
  app.get('/api/payments', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const query = parseWith(z.object({ query: z.string().max(120).optional(), courseId: uuidSchema.optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30) }), request.query)
    const search = query.query?.trim()
    const offset = (query.page - 1) * query.pageSize
    const rows = await db.execute(sql`
      select pr.id,pr.enrollment_id,pr.amount_cents,pr.method,pr.status,pr.paid_at,pr.created_at,concat(p.first_name,' ',p.last_name) participant_name,c.title course_name,u.full_name recorded_by
      from payment_records pr join enrollments e on e.id=pr.enrollment_id join participants p on p.id=e.participant_id join courses c on c.id=e.course_id join staff_users u on u.id=pr.recorded_by
      where pr.organization_id=${user.organizationId} ${query.courseId ? sql`and c.id=${query.courseId}` : sql``} ${search ? sql`and (concat(p.first_name,' ',p.last_name) ilike ${`%${search}%`} or c.title ilike ${`%${search}%`} or pr.reference ilike ${`%${search}%`})` : sql``}
      order by pr.paid_at desc limit ${query.pageSize} offset ${offset}
    `)
    const count = await db.execute(sql`select count(*) total from payment_records pr join enrollments e on e.id=pr.enrollment_id join participants p on p.id=e.participant_id join courses c on c.id=e.course_id where pr.organization_id=${user.organizationId} ${query.courseId ? sql`and c.id=${query.courseId}` : sql``} ${search ? sql`and (concat(p.first_name,' ',p.last_name) ilike ${`%${search}%`} or c.title ilike ${`%${search}%`} or pr.reference ilike ${`%${search}%`})` : sql``}`)
    const summary = await db.execute(sql`select
      coalesce(sum(case when pr.status='recorded' then pr.amount_cents else 0 end),0) recorded_total,
      coalesce(sum(case when pr.status='voided' then pr.amount_cents else 0 end),0) voided_total,
      (select coalesce(sum(e.agreed_fee_amount_cents-coalesce(x.paid,0)),0) from enrollments e join courses c on c.id=e.course_id left join (select enrollment_id,sum(amount_cents) paid from payment_records where status='recorded' group by enrollment_id) x on x.enrollment_id=e.id where e.organization_id=${user.organizationId} and e.status in ('active','completed') ${query.courseId ? sql`and c.id=${query.courseId}` : sql``}) outstanding
      from payment_records pr join enrollments e on e.id=pr.enrollment_id join courses c on c.id=e.course_id where pr.organization_id=${user.organizationId} ${query.courseId ? sql`and c.id=${query.courseId}` : sql``}`)
    const total = Number((count.rows[0] as any).total)
    const totals = summary.rows[0] as any
    return { items: rows.rows.map((item: any) => ({ id: item.id, participantName: item.participant_name, courseName: item.course_name, enrollmentId: item.enrollment_id, amountCents: item.amount_cents, method: item.method, status: item.status, recordedAt: item.paid_at, recordedBy: item.recorded_by })), meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) }, summary: { recordedTotalCents: Number(totals.recorded_total), voidedTotalCents: Number(totals.voided_total), outstandingBalanceCents: Number(totals.outstanding) } }
  })

  app.post('/api/enrollments/:enrollmentId/payments', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { enrollmentId } = parseWith(z.object({ enrollmentId: uuidSchema }), request.params)
    const body = parseWith(paymentSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select e.*,c.title course_name from enrollments e join courses c on c.id=e.course_id where e.id=${enrollmentId} and e.organization_id=${user.organizationId} for update of e`)
      const enrollment = locked.rows[0] as any
      if (!enrollment) throw notFound('Kurs kaydi bulunamadi.')
      const paidResult = await tx.execute(sql`select coalesce(sum(amount_cents),0) paid from payment_records where enrollment_id=${enrollmentId} and status='recorded'`)
      const paid = Number((paidResult.rows[0] as any).paid)
      const balanceBefore = Math.max(0, Number(enrollment.agreed_fee_amount_cents) - paid)
      if (body.amountCents > balanceBefore) {
        if (!body.allowOverpayment) throw new AppError(409, 'PAYMENT_OVERPAYMENT', 'Tutar kalan bakiyeyi asiyor. Acik onay gereklidir.')
        if (!isManager(user.role)) throw new AppError(403, 'OVERPAYMENT_FORBIDDEN', 'Fazla tahsilat yalnizca yonetici onayi ile kaydedilebilir.')
      }
      const [payment] = await tx.insert(paymentRecords).values({
        organizationId: user.organizationId, enrollmentId, amountCents: body.amountCents, method: body.method,
        paidAt: body.paidAt ? new Date(body.paidAt) : new Date(), reference: body.reference, note: body.note, recordedBy: user.id,
      }).returning()
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'payment.record', entityType: 'payment_record', entityId: payment.id, summary: 'Manuel kurs tahsilati kaydedildi.', metadata: { enrollmentId, amountCents: body.amountCents, method: body.method, overpaymentApproved: body.amountCents > balanceBefore } })
      return { payment, balanceBefore, balanceAfter: Number(enrollment.agreed_fee_amount_cents) - paid - body.amountCents }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/payments/:paymentId/void', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { paymentId } = parseWith(z.object({ paymentId: uuidSchema }), request.params)
    const { reason } = parseWith(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), request.body)
    return db.transaction(async (tx) => {
      const [payment] = await tx.update(paymentRecords).set({ status: 'voided', voidedAt: new Date(), voidedBy: user.id, voidReason: reason, updatedAt: new Date() }).where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.organizationId, user.organizationId), eq(paymentRecords.status, 'recorded'))).returning()
      if (!payment) {
        const [exists] = await tx.select({ id: paymentRecords.id, status: paymentRecords.status }).from(paymentRecords).where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.organizationId, user.organizationId))).limit(1)
        if (!exists) throw notFound('Tahsilat bulunamadi.')
        throw conflict('PAYMENT_ALREADY_VOIDED', 'Tahsilat daha once iptal edilmis.')
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'payment.void', entityType: 'payment_record', entityId: payment.id, summary: 'Manuel kurs tahsilati iptal edildi.', metadata: { enrollmentId: payment.enrollmentId, reasonCategory: 'staff_provided' } })
      return { payment }
    })
  })
}
