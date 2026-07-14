import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, conflict, notFound } from '../../shared/errors.js'
import { ENROLLMENT_STATUSES, PARTICIPANT_TYPES } from '../../shared/enums.js'
import { requireRole } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, enrollments, guardians, organizationSettings, participantGuardians, participants } from '../db/schema.js'
import { ageOnDate, parseWith, uuidSchema } from '../utils.js'

const guardianSchema = z.object({ fullName: z.string().trim().min(2).max(160), relationship: z.string().max(80).optional(), phone: z.string().trim().min(7).max(40), email: z.string().email().max(254).optional() }).strict()
const participantSchema = z.object({
  participantType: z.enum(PARTICIPANT_TYPES).default('external'), firstName: z.string().trim().min(2).max(100), lastName: z.string().trim().min(2).max(100),
  birthDate: z.string().date().nullable().optional(), email: z.string().email().max(254).nullable().optional(), phone: z.string().max(40).nullable().optional(),
  emergencyContactName: z.string().max(160).nullable().optional(), emergencyContactPhone: z.string().max(40).nullable().optional(),
  swimmingLevel: z.string().max(80).nullable().optional(), safetyNotes: z.string().max(1000).nullable().optional(), guardian: guardianSchema.optional(),
}).strict()
const enrollSchema = z.object({
  participantId: uuidSchema.optional(), participant: participantSchema.optional(), agreedFeeAmountCents: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.participantId) === Boolean(value.participant)) context.addIssue({ code: 'custom', path: ['participantId'], message: 'Mevcut veya yeni kursiyerden yalnizca biri secilmelidir.' })
})

async function createParticipant(executor: any, organizationId: string, actorId: string, input: z.infer<typeof participantSchema>) {
  const [setting] = await executor.select().from(organizationSettings).where(eq(organizationSettings.organizationId, organizationId)).limit(1)
  const threshold = setting?.childAgeThreshold ?? 18
  if (input.birthDate && ageOnDate(input.birthDate) < threshold && !input.guardian) {
    throw new AppError(400, 'GUARDIAN_REQUIRED', 'Cocuk kursiyer icin veli iletisim bilgisi zorunludur.', { guardian: 'Veli bilgisi ekleyin.' })
  }
  const { guardian, ...participantInput } = input
  const [participant] = await executor.insert(participants).values({
    organizationId, createdBy: actorId, ...participantInput,
    email: participantInput.email?.toLowerCase() ?? null,
  }).returning()
  let guardianRow = null
  if (guardian) {
    [guardianRow] = await executor.insert(guardians).values({ organizationId, ...guardian, email: guardian.email?.toLowerCase() }).returning()
    await executor.insert(participantGuardians).values({ participantId: participant.id, guardianId: guardianRow.id, isPrimaryContact: true })
  }
  return { participant, guardian: guardianRow }
}

export async function participantRoutes(app: FastifyInstance) {
  app.get('/api/participants', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const query = parseWith(z.object({ query: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }), request.query)
    const search = query.query?.trim()
    const result = await db.execute(sql`
      select p.id,p.participant_type,p.first_name,p.last_name,p.email,p.phone,
        g.full_name guardian_name,
        (select count(*) from enrollments e where e.participant_id=p.id and e.status='active') active_enrollment_count,
        (select c.title from enrollments e join courses c on c.id=e.course_id where e.participant_id=p.id and e.status='active' order by e.registered_at desc limit 1) current_course_name
      from participants p
      left join participant_guardians pg on pg.participant_id=p.id and pg.is_primary_contact=true
      left join guardians g on g.id=pg.guardian_id
      where p.organization_id=${user.organizationId} and p.is_active=true
      ${search ? sql`and (concat(p.first_name,' ',p.last_name) ilike ${`%${search}%`} or p.phone ilike ${`%${search}%`} or p.email ilike ${`%${search}%`})` : sql``}
      order by p.first_name,p.last_name limit ${query.limit}
    `)
    return { items: result.rows.map((item: any) => ({ id: item.id, fullName: `${item.first_name} ${item.last_name}`, phone: item.phone, email: item.email, participantType: item.participant_type, guardianName: item.guardian_name, activeEnrollmentCount: Number(item.active_enrollment_count), currentCourseName: item.current_course_name })) }
  })

  app.post('/api/participants', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const input = parseWith(participantSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const created = await createParticipant(tx, user.organizationId, user.id, input)
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'participant.create', entityType: 'participant', entityId: created.participant.id, summary: 'Yeni kursiyer kaydi olusturuldu.', metadata: { participantType: created.participant.participantType, hasGuardian: Boolean(created.guardian) } })
      return created
    })
    return reply.code(201).send({ participant: { ...result.participant, fullName: `${result.participant.firstName} ${result.participant.lastName}` }, guardian: result.guardian })
  })

  app.post('/api/courses/:courseId/enrollments', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { courseId } = parseWith(z.object({ courseId: uuidSchema }), request.params)
    const input = parseWith(enrollSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select id,capacity,fee_amount_cents,status from courses where id=${courseId} and organization_id=${user.organizationId} for update`)
      const course = locked.rows[0] as any
      if (!course) throw notFound('Kurs bulunamadi.')
      if (course.status === 'cancelled' || course.status === 'completed') throw conflict('COURSE_NOT_ENROLLABLE', 'Bu kurs yeni kayit kabul etmiyor.')
      let participantId = input.participantId
      if (input.participant) participantId = (await createParticipant(tx, user.organizationId, user.id, input.participant)).participant.id
      const [participant] = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, participantId!), eq(participants.organizationId, user.organizationId), eq(participants.isActive, true))).limit(1)
      if (!participant) throw notFound('Kursiyer bulunamadi.')
      const [existing] = await tx.select({ id: enrollments.id }).from(enrollments).where(and(eq(enrollments.courseId, courseId), eq(enrollments.participantId, participant.id))).limit(1)
      if (existing) throw conflict('ENROLLMENT_EXISTS', 'Kursiyer bu kursa daha once kaydedilmis.')
      const activeResult = await tx.execute(sql`select count(*) count from enrollments where course_id=${courseId} and status='active'`)
      const activeCount = Number((activeResult.rows[0] as any).count)
      const status = activeCount < Number(course.capacity) ? 'active' as const : 'waitlisted' as const
      let waitlistPosition: number | null = null
      if (status === 'waitlisted') {
        const waitResult = await tx.execute(sql`select coalesce(max(waitlist_position),0)+1 position from enrollments where course_id=${courseId} and status='waitlisted'`)
        waitlistPosition = Number((waitResult.rows[0] as any).position)
      }
      const [enrollment] = await tx.insert(enrollments).values({
        organizationId: user.organizationId, courseId, participantId: participant.id, status, waitlistPosition,
        agreedFeeAmountCents: input.agreedFeeAmountCents ?? Number(course.fee_amount_cents), registeredBy: user.id,
      }).returning()
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'enrollment.create', entityType: 'enrollment', entityId: enrollment.id, summary: `Kurs kaydi ${status === 'active' ? 'aktif' : 'bekleme listesinde'} olusturuldu.`, metadata: { courseId, status, waitlistPosition } })
      return enrollment
    })
    return reply.code(201).send({ enrollmentId: result.id, status: result.status, waitlistPosition: result.waitlistPosition, agreedFeeAmountCents: result.agreedFeeAmountCents })
  })

  app.patch('/api/enrollments/:enrollmentId/status', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { enrollmentId } = parseWith(z.object({ enrollmentId: uuidSchema }), request.params)
    const body = parseWith(z.object({ status: z.enum(ENROLLMENT_STATUSES), promoteFirstWaitlisted: z.boolean().default(false) }).strict(), request.body)
    return db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select * from enrollments where id=${enrollmentId} and organization_id=${user.organizationId} for update`)
      const enrollment = locked.rows[0] as any
      if (!enrollment) throw notFound('Kurs kaydi bulunamadi.')
      const allowed: Record<string, string[]> = { active: ['cancelled', 'completed'], waitlisted: ['active', 'cancelled'], cancelled: [], completed: [] }
      if (!allowed[enrollment.status]?.includes(body.status)) throw conflict('INVALID_ENROLLMENT_TRANSITION', 'Kurs kaydi bu duruma gecirilemez.')
      const [updated] = await tx.update(enrollments).set({ status: body.status, waitlistPosition: body.status === 'waitlisted' ? enrollment.waitlist_position : null, cancelledAt: body.status === 'cancelled' ? new Date() : null, updatedAt: new Date() }).where(eq(enrollments.id, enrollmentId)).returning()
      let promotedEnrollmentId: string | null = null
      let promotionAvailable = false
      if (enrollment.status === 'active' && body.status === 'cancelled') {
        const waiting = await tx.execute(sql`select id from enrollments where course_id=${enrollment.course_id} and status='waitlisted' order by waitlist_position for update limit 1`)
        const first = waiting.rows[0] as any
        promotionAvailable = Boolean(first)
        if (first && body.promoteFirstWaitlisted) {
          await tx.update(enrollments).set({ status: 'active', waitlistPosition: null, updatedAt: new Date() }).where(eq(enrollments.id, first.id))
          await tx.execute(sql`update enrollments set waitlist_position=waitlist_position-1,updated_at=now() where course_id=${enrollment.course_id} and status='waitlisted' and waitlist_position > 1`)
          promotedEnrollmentId = first.id
        }
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'enrollment.status_change', entityType: 'enrollment', entityId: enrollmentId, summary: `Kurs kaydi durumu ${body.status} olarak degistirildi.`, metadata: { from: enrollment.status, to: body.status, promotedEnrollmentId } })
      return { enrollment: updated, promotionAvailable, promotedEnrollmentId }
    })
  })
}

