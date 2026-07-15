import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PAYMENT_METHODS } from '../../shared/enums.js'
import { AppError, conflict, notFound } from '../../shared/errors.js'
import { isManager, requireRole } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, paymentRecords } from '../db/schema.js'
import { nextReceiptNumber } from '../domain/receiptNumbers.js'
import { parseWith, uuidSchema } from '../utils.js'

const paymentSchema = z.object({
  amountCents: z.number().int().positive(), method: z.enum(PAYMENT_METHODS), paidAt: z.string().datetime({ offset: true }).optional(),
  reference: z.string().max(120).nullable().optional(), note: z.string().max(500).nullable().optional(), allowOverpayment: z.boolean().default(false),
}).strict()

export async function paymentRoutes(app: FastifyInstance) {
  app.get('/api/payments', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const query = parseWith(z.object({
      query: z.string().max(120).optional(),
      type: z.enum(['all', 'payments', 'charges']).default('all'),
      status: z.enum(['recorded', 'voided']).optional(),
      dateFrom: z.string().date().optional(),
      dateTo: z.string().date().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }), request.query)
    const search = query.query?.trim()
    const offset = (query.page - 1) * query.pageSize
    const rows = await db.execute(sql`
      with ledger as (
        select mpay.id,'membership_payment' kind,'payment' direction,p.id participant_id,concat(p.first_name,' ',p.last_name) participant_name,
          plan.name context_name,m.id account_id,mpay.amount_cents,mpay.method::text,mpay.status::text,mpay.paid_at occurred_at,
          mpay.receipt_number,mpay.reference,mpay.note,recorder.full_name recorded_by,voider.full_name voided_by,mpay.void_reason
        from membership_payments mpay
        join gym_memberships m on m.id=mpay.membership_id join membership_plans plan on plan.id=m.plan_id join participants p on p.id=m.participant_id
        join staff_users recorder on recorder.id=mpay.recorded_by left join staff_users voider on voider.id=mpay.voided_by
        where mpay.organization_id=${user.organizationId}
        union all
        select pr.id,'course_payment','payment',p.id,concat(p.first_name,' ',p.last_name),c.title,e.id,pr.amount_cents,pr.method::text,pr.status::text,pr.paid_at,
          pr.receipt_number,pr.reference,pr.note,recorder.full_name,voider.full_name,pr.void_reason
        from payment_records pr
        join enrollments e on e.id=pr.enrollment_id join courses c on c.id=e.course_id join participants p on p.id=e.participant_id
        join staff_users recorder on recorder.id=pr.recorded_by left join staff_users voider on voider.id=pr.voided_by
        where pr.organization_id=${user.organizationId}
        union all
        select debt.id,'additional_charge','charge',p.id,concat(p.first_name,' ',p.last_name),plan.name,m.id,debt.amount_cents,null::text,debt.status::text,debt.created_at,
          null::text,null::text,debt.reason,recorder.full_name,voider.full_name,debt.void_reason
        from membership_debts debt
        join gym_memberships m on m.id=debt.membership_id join membership_plans plan on plan.id=m.plan_id join participants p on p.id=m.participant_id
        join staff_users recorder on recorder.id=debt.created_by left join staff_users voider on voider.id=debt.voided_by
        where debt.organization_id=${user.organizationId}
        union all
        select m.id,'membership_charge','charge',p.id,concat(p.first_name,' ',p.last_name),plan.name,m.id,m.sale_amount_cents,null::text,'recorded',m.created_at,
          null::text,null::text,m.notes,recorder.full_name,null::text,null::text
        from gym_memberships m join membership_plans plan on plan.id=m.plan_id join participants p on p.id=m.participant_id join staff_users recorder on recorder.id=m.created_by
        where m.organization_id=${user.organizationId}
        union all
        select e.id,'course_charge','charge',p.id,concat(p.first_name,' ',p.last_name),c.title,e.id,e.agreed_fee_amount_cents,null::text,'recorded',e.registered_at,
          null::text,null::text,null::text,recorder.full_name,null::text,null::text
        from enrollments e join courses c on c.id=e.course_id join participants p on p.id=e.participant_id join staff_users recorder on recorder.id=e.registered_by
        where e.organization_id=${user.organizationId}
      )
      select ledger.*,count(*) over() total
      from ledger
      where true
      ${query.type === 'payments' ? sql`and direction='payment'` : query.type === 'charges' ? sql`and direction='charge'` : sql``}
      ${query.status ? sql`and status=${query.status}` : sql``}
      ${query.dateFrom ? sql`and occurred_at >= ${`${query.dateFrom}T00:00:00+03:00`}::timestamptz` : sql``}
      ${query.dateTo ? sql`and occurred_at < (${`${query.dateTo}T00:00:00+03:00`}::timestamptz + interval '1 day')` : sql``}
      ${search ? sql`and (participant_name ilike ${`%${search}%`} or context_name ilike ${`%${search}%`} or coalesce(receipt_number,'') ilike ${`%${search}%`} or coalesce(reference,'') ilike ${`%${search}%`})` : sql``}
      order by occurred_at desc,id desc limit ${query.pageSize} offset ${offset}
    `)
    const cash = await db.execute(sql`
      with today_payments as (
        select amount_cents,method::text,status::text from membership_payments where organization_id=${user.organizationId} and (paid_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date
        union all
        select amount_cents,method::text,status::text from payment_records where organization_id=${user.organizationId} and (paid_at at time zone 'Europe/Istanbul')::date=(now() at time zone 'Europe/Istanbul')::date
      ) select
        coalesce(sum(amount_cents) filter (where status='recorded'),0) total,
        coalesce(sum(amount_cents) filter (where status='recorded' and method='cash'),0) cash,
        coalesce(sum(amount_cents) filter (where status='recorded' and method='card_terminal'),0) card,
        coalesce(sum(amount_cents) filter (where status='recorded' and method='bank_transfer'),0) transfer,
        coalesce(sum(amount_cents) filter (where status='recorded' and method='other'),0) other,
        count(*) filter (where status='recorded') record_count,
        coalesce(sum(amount_cents) filter (where status='voided'),0) voided
      from today_payments
    `)
    const total = rows.rows.length ? Number((rows.rows[0] as any).total) : 0
    const cashRow = cash.rows[0] as any
    return {
      items: rows.rows.map((item: any) => ({ id: item.id, kind: item.kind, direction: item.direction, participantId: item.participant_id, participantName: item.participant_name, contextName: item.context_name, accountId: item.account_id, amountCents: Number(item.amount_cents), method: item.method, status: item.status, occurredAt: item.occurred_at, receiptNumber: item.receipt_number, reference: item.reference, note: item.note, recordedBy: item.recorded_by, voidedBy: item.voided_by, voidReason: item.void_reason })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
      todayCash: { totalCents: Number(cashRow.total), cashCents: Number(cashRow.cash), cardCents: Number(cashRow.card), transferCents: Number(cashRow.transfer), otherCents: Number(cashRow.other), voidedCents: Number(cashRow.voided), recordCount: Number(cashRow.record_count) },
    }
  })

  app.get('/api/finance/accounts', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { query } = parseWith(z.object({ query: z.string().max(120).optional() }), request.query)
    const search = query?.trim()
    const rows = await db.execute(sql`
      with accounts as (
        select 'membership' account_type,m.id account_id,p.id participant_id,concat(p.first_name,' ',p.last_name) participant_name,plan.name context_name,
          greatest(0,m.sale_amount_cents+coalesce(debt.total,0)-coalesce(paid.total,0)) balance_cents
        from gym_memberships m join participants p on p.id=m.participant_id join membership_plans plan on plan.id=m.plan_id
        left join (select membership_id,sum(amount_cents) total from membership_payments where status='recorded' group by membership_id) paid on paid.membership_id=m.id
        left join (select membership_id,sum(amount_cents) total from membership_debts where status='recorded' group by membership_id) debt on debt.membership_id=m.id
        where m.organization_id=${user.organizationId}
        union all
        select 'course',e.id,p.id,concat(p.first_name,' ',p.last_name),c.title,greatest(0,e.agreed_fee_amount_cents-coalesce(paid.total,0))
        from enrollments e join participants p on p.id=e.participant_id join courses c on c.id=e.course_id
        left join (select enrollment_id,sum(amount_cents) total from payment_records where status='recorded' group by enrollment_id) paid on paid.enrollment_id=e.id
        where e.organization_id=${user.organizationId}
      ) select * from accounts where balance_cents>0
      ${search ? sql`and (participant_name ilike ${`%${search}%`} or context_name ilike ${`%${search}%`})` : sql``}
      order by participant_name,context_name limit 100
    `)
    return { items: rows.rows.map((item: any) => ({ accountType: item.account_type, accountId: item.account_id, participantId: item.participant_id, participantName: item.participant_name, contextName: item.context_name, balanceCents: Number(item.balance_cents) })) }
  })

  app.post('/api/enrollments/:enrollmentId/payments', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { enrollmentId } = parseWith(z.object({ enrollmentId: uuidSchema }), request.params)
    const body = parseWith(paymentSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select e.*,c.title course_name from enrollments e join courses c on c.id=e.course_id where e.id=${enrollmentId} and e.organization_id=${user.organizationId} for update of e`)
      const enrollment = locked.rows[0] as any
      if (!enrollment) throw notFound('Kurs kaydı bulunamadı.')
      const paidResult = await tx.execute(sql`select coalesce(sum(amount_cents),0) paid from payment_records where enrollment_id=${enrollmentId} and status='recorded'`)
      const paid = Number((paidResult.rows[0] as any).paid)
      const balanceBefore = Math.max(0, Number(enrollment.agreed_fee_amount_cents) - paid)
      if (body.amountCents > balanceBefore) {
        if (!body.allowOverpayment) throw new AppError(409, 'PAYMENT_OVERPAYMENT', 'Tutar kalan bakiyeyi aşıyor. Açık onay gereklidir.')
        if (!isManager(user.role)) throw new AppError(403, 'OVERPAYMENT_FORBIDDEN', 'Fazla tahsilat yalnızca yönetici onayı ile kaydedilebilir.')
      }
      const paidAt = body.paidAt ? new Date(body.paidAt) : new Date()
      const receiptNumber = await nextReceiptNumber(tx, user.organizationId, paidAt)
      const [payment] = await tx.insert(paymentRecords).values({ organizationId: user.organizationId, enrollmentId, amountCents: body.amountCents, method: body.method, paidAt, receiptNumber, reference: body.reference, note: body.note, recordedBy: user.id }).returning()
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'payment.record', entityType: 'payment_record', entityId: payment.id, summary: 'Manuel kurs tahsilatı kaydedildi.', metadata: { enrollmentId, amountCents: body.amountCents, method: body.method, receiptNumber, overpaymentApproved: body.amountCents > balanceBefore } })
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
        const [exists] = await tx.select({ id: paymentRecords.id }).from(paymentRecords).where(and(eq(paymentRecords.id, paymentId), eq(paymentRecords.organizationId, user.organizationId))).limit(1)
        if (!exists) throw notFound('Tahsilat bulunamadı.')
        throw conflict('PAYMENT_ALREADY_VOIDED', 'Tahsilat daha önce geçersiz kılınmış.')
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'payment.void', entityType: 'payment_record', entityId: payment.id, summary: 'Manuel kurs tahsilatı geçersiz kılındı.', metadata: { enrollmentId: payment.enrollmentId, receiptNumber: payment.receiptNumber, reasonCategory: 'staff_provided' } })
      return { payment }
    })
  })
}
