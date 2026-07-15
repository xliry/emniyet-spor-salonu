import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError, conflict, notFound } from '../../shared/errors.js'
import { ENROLLMENT_STATUSES, PARTICIPANT_TYPES } from '../../shared/enums.js'
import { requireRole } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, enrollments, guardians, organizationSettings, participantGuardians, participants } from '../db/schema.js'
import { membershipBalanceCents } from '../domain/membershipFinance.js'
import { ageOnDate, parseWith, uuidSchema } from '../utils.js'

const guardianSchema = z.object({ fullName: z.string().trim().min(2).max(160), relationship: z.string().max(80).optional(), phone: z.string().trim().min(7).max(40), email: z.string().email().max(254).optional() }).strict()
const participantSchema = z.object({
  participantType: z.enum(PARTICIPANT_TYPES).default('external'), firstName: z.string().trim().min(2).max(100), lastName: z.string().trim().min(2).max(100),
  birthDate: z.string().date().nullable().optional(), email: z.string().email().max(254).nullable().optional(), phone: z.string().max(40).nullable().optional(),
  emergencyContactName: z.string().max(160).nullable().optional(), emergencyContactPhone: z.string().max(40).nullable().optional(),
  swimmingLevel: z.string().max(80).nullable().optional(), safetyNotes: z.string().max(1000).nullable().optional(), guardian: guardianSchema.optional(),
}).strict()
const participantUpdateSchema = participantSchema.omit({ participantType: true, guardian: true }).partial().refine((value) => Object.keys(value).length > 0, 'Güncellenecek en az bir alan gönderin.')
const enrollSchema = z.object({
  participantId: uuidSchema.optional(), participant: participantSchema.optional(), agreedFeeAmountCents: z.number().int().nonnegative().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.participantId) === Boolean(value.participant)) context.addIssue({ code: 'custom', path: ['participantId'], message: 'Mevcut veya yeni kursiyerden yalnızca biri seçilmelidir.' })
})

async function createParticipant(executor: any, organizationId: string, actorId: string, input: z.infer<typeof participantSchema>) {
  const [setting] = await executor.select().from(organizationSettings).where(eq(organizationSettings.organizationId, organizationId)).limit(1)
  const threshold = setting?.childAgeThreshold ?? 18
  if (input.birthDate && ageOnDate(input.birthDate) < threshold && !input.guardian) {
    throw new AppError(400, 'GUARDIAN_REQUIRED', 'Çocuk kursiyer için veli iletişim bilgisi zorunludur.', { guardian: 'Veli bilgisi ekleyin.' })
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

  app.get('/api/participants/:participantId', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { participantId } = parseWith(z.object({ participantId: uuidSchema }), request.params)
    const [personResult, membershipsResult, membershipPaymentsResult, membershipDebtsResult, enrollmentsResult, coursePaymentsResult] = await Promise.all([
      db.execute(sql`
        select p.*,g.full_name guardian_name,g.relationship guardian_relationship,g.phone guardian_phone,g.email guardian_email
        from participants p
        left join participant_guardians pg on pg.participant_id=p.id and pg.is_primary_contact=true
        left join guardians g on g.id=pg.guardian_id
        where p.id=${participantId} and p.organization_id=${user.organizationId} and p.is_active=true
        limit 1
      `),
      db.execute(sql`
        select m.id,m.status,m.starts_on,m.ends_on,m.sale_amount_cents,m.notes,m.cancelled_at,
          mp.id plan_id,mp.name plan_name,mp.duration_days,mp.pool_access,mp.gym_access,
          coalesce(payments.paid_total,0) paid_total,coalesce(debts.debt_total,0) debt_total,payments.last_paid_at
        from gym_memberships m
        join membership_plans mp on mp.id=m.plan_id
        left join (select membership_id,sum(amount_cents) paid_total,max(paid_at) last_paid_at from membership_payments where status='recorded' group by membership_id) payments on payments.membership_id=m.id
        left join (select membership_id,sum(amount_cents) debt_total from membership_debts where status='recorded' group by membership_id) debts on debts.membership_id=m.id
        where m.participant_id=${participantId} and m.organization_id=${user.organizationId}
        order by case when m.status='active' then 0 when m.status='frozen' then 1 else 2 end,m.ends_on desc,m.created_at desc
      `),
      db.execute(sql`
        select mpay.id,mpay.membership_id,mpay.amount_cents,mpay.method,mpay.status,mpay.paid_at,mpay.reference,mpay.note,mpay.receipt_number,mpay.voided_at,mpay.void_reason,plan.name plan_name,u.full_name recorded_by,vu.full_name voided_by
        from membership_payments mpay
        join gym_memberships m on m.id=mpay.membership_id
        join membership_plans plan on plan.id=m.plan_id
        join staff_users u on u.id=mpay.recorded_by
        left join staff_users vu on vu.id=mpay.voided_by
        where m.participant_id=${participantId} and mpay.organization_id=${user.organizationId}
        order by mpay.paid_at desc,mpay.created_at desc
      `),
      db.execute(sql`
        select debt.id,debt.membership_id,debt.amount_cents,debt.reason,debt.due_on,debt.status,debt.created_at,debt.voided_at,debt.void_reason,plan.name plan_name,u.full_name recorded_by,vu.full_name voided_by
        from membership_debts debt
        join gym_memberships m on m.id=debt.membership_id
        join membership_plans plan on plan.id=m.plan_id
        join staff_users u on u.id=debt.created_by
        left join staff_users vu on vu.id=debt.voided_by
        where m.participant_id=${participantId} and debt.organization_id=${user.organizationId}
        order by debt.created_at desc
      `),
      db.execute(sql`
        select e.id,e.status,e.agreed_fee_amount_cents,e.registered_at,e.cancelled_at,c.id course_id,c.title course_name,
          coalesce(payments.paid_total,0) paid_total
        from enrollments e
        join courses c on c.id=e.course_id
        left join (select enrollment_id,sum(amount_cents) paid_total from payment_records where status='recorded' group by enrollment_id) payments on payments.enrollment_id=e.id
        where e.participant_id=${participantId} and e.organization_id=${user.organizationId}
        order by e.registered_at desc
      `),
      db.execute(sql`
        select pr.id,pr.enrollment_id,pr.amount_cents,pr.method,pr.status,pr.paid_at,pr.reference,pr.note,pr.receipt_number,pr.voided_at,pr.void_reason,c.title course_name,u.full_name recorded_by,vu.full_name voided_by
        from payment_records pr
        join enrollments e on e.id=pr.enrollment_id
        join courses c on c.id=e.course_id
        join staff_users u on u.id=pr.recorded_by
        left join staff_users vu on vu.id=pr.voided_by
        where e.participant_id=${participantId} and pr.organization_id=${user.organizationId}
        order by pr.paid_at desc,pr.created_at desc
      `),
    ])
    const person = personResult.rows[0] as any
    if (!person) throw notFound('Üye bulunamadı.')
    const memberships = membershipsResult.rows.map((item: any) => ({
      id: item.id, planId: item.plan_id, planName: item.plan_name, durationDays: Number(item.duration_days), poolAccess: Boolean(item.pool_access), gymAccess: Boolean(item.gym_access), status: item.status,
      startsOn: item.starts_on, endsOn: item.ends_on, saleAmountCents: Number(item.sale_amount_cents), debtTotalCents: Number(item.debt_total), paidTotalCents: Number(item.paid_total), balanceCents: membershipBalanceCents(Number(item.sale_amount_cents), Number(item.debt_total), Number(item.paid_total)), lastPaidAt: item.last_paid_at, notes: item.notes, cancelledAt: item.cancelled_at,
    }))
    const enrollments = enrollmentsResult.rows.map((item: any) => ({
      id: item.id, courseId: item.course_id, courseName: item.course_name, status: item.status, agreedFeeAmountCents: Number(item.agreed_fee_amount_cents), paidTotalCents: Number(item.paid_total), balanceCents: Math.max(0, Number(item.agreed_fee_amount_cents) - Number(item.paid_total)), registeredAt: item.registered_at, cancelledAt: item.cancelled_at,
    }))
    const membershipPayments = membershipPaymentsResult.rows.map((item: any) => ({ id: item.id, membershipId: item.membership_id, planName: item.plan_name, amountCents: Number(item.amount_cents), method: item.method, status: item.status, paidAt: item.paid_at, reference: item.reference, note: item.note, receiptNumber: item.receipt_number, recordedBy: item.recorded_by, voidedAt: item.voided_at, voidedBy: item.voided_by, voidReason: item.void_reason }))
    const membershipCharges = membershipDebtsResult.rows.map((item: any) => ({ id: item.id, membershipId: item.membership_id, planName: item.plan_name, amountCents: Number(item.amount_cents), reason: item.reason, dueOn: item.due_on, status: item.status, createdAt: item.created_at, recordedBy: item.recorded_by, voidedAt: item.voided_at, voidedBy: item.voided_by, voidReason: item.void_reason }))
    const coursePayments = coursePaymentsResult.rows.map((item: any) => ({ id: item.id, enrollmentId: item.enrollment_id, courseName: item.course_name, amountCents: Number(item.amount_cents), method: item.method, status: item.status, paidAt: item.paid_at, reference: item.reference, note: item.note, receiptNumber: item.receipt_number, recordedBy: item.recorded_by, voidedAt: item.voided_at, voidedBy: item.voided_by, voidReason: item.void_reason }))
    const financeStatement = [
      ...memberships.map((item) => ({ id: item.id, kind: 'membership_charge', source: 'membership', description: `${item.planName} paket bedeli`, amountCents: item.saleAmountCents, direction: 'charge', status: 'recorded', occurredAt: item.startsOn, subjectId: item.id })),
      ...membershipCharges.map((item) => ({ id: item.id, kind: 'additional_charge', source: 'membership', description: item.reason, amountCents: item.amountCents, direction: 'charge', status: item.status, occurredAt: item.createdAt, subjectId: item.membershipId, dueOn: item.dueOn, recordedBy: item.recordedBy, voidedBy: item.voidedBy, voidReason: item.voidReason })),
      ...membershipPayments.map((item) => ({ id: item.id, kind: 'membership_payment', source: 'membership', description: `${item.planName} tahsilatı`, amountCents: item.amountCents, direction: 'payment', status: item.status, occurredAt: item.paidAt, subjectId: item.membershipId, method: item.method, receiptNumber: item.receiptNumber, reference: item.reference, recordedBy: item.recordedBy, voidedBy: item.voidedBy, voidReason: item.voidReason })),
      ...enrollments.map((item) => ({ id: item.id, kind: 'course_charge', source: 'course', description: `${item.courseName} kurs ücreti`, amountCents: item.agreedFeeAmountCents, direction: 'charge', status: 'recorded', occurredAt: item.registeredAt, subjectId: item.id })),
      ...coursePayments.map((item) => ({ id: item.id, kind: 'course_payment', source: 'course', description: `${item.courseName} tahsilatı`, amountCents: item.amountCents, direction: 'payment', status: item.status, occurredAt: item.paidAt, subjectId: item.enrollmentId, method: item.method, receiptNumber: item.receiptNumber, reference: item.reference, recordedBy: item.recordedBy, voidedBy: item.voidedBy, voidReason: item.voidReason })),
    ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    return {
      participant: {
        id: person.id, participantType: person.participant_type, firstName: person.first_name, lastName: person.last_name, fullName: `${person.first_name} ${person.last_name}`,
        birthDate: person.birth_date, email: person.email, phone: person.phone, emergencyContactName: person.emergency_contact_name, emergencyContactPhone: person.emergency_contact_phone,
        swimmingLevel: person.swimming_level, safetyNotes: person.safety_notes, guardian: person.guardian_name ? { fullName: person.guardian_name, relationship: person.guardian_relationship, phone: person.guardian_phone, email: person.guardian_email } : null,
      },
      memberships,
      membershipPayments,
      membershipDebts: membershipCharges,
      enrollments,
      coursePayments,
      financeStatement,
      summary: {
        membershipPaidTotalCents: memberships.reduce((total, item) => total + item.paidTotalCents, 0), membershipBalanceCents: memberships.reduce((total, item) => total + item.balanceCents, 0),
        courseBalanceCents: enrollments.filter((item) => ['active', 'completed'].includes(item.status)).reduce((total, item) => total + item.balanceCents, 0),
      },
    }
  })

  app.patch('/api/participants/:participantId', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { participantId } = parseWith(z.object({ participantId: uuidSchema }), request.params)
    const body = parseWith(participantUpdateSchema, request.body)
    const values = {
      ...body,
      email: body.email === undefined ? undefined : body.email?.toLowerCase() ?? null,
      updatedAt: new Date(),
    }
    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(participants).set(values).where(and(eq(participants.id, participantId), eq(participants.organizationId, user.organizationId), eq(participants.isActive, true))).returning()
      if (!updated) throw notFound('Üye bulunamadı.')
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'participant.update', entityType: 'participant', entityId: updated.id, summary: 'Üye iletişim ve profil bilgileri güncellendi.', metadata: { changedFields: Object.keys(body) } })
      return updated
    })
    return { participant: { ...result, fullName: `${result.firstName} ${result.lastName}` } }
  })

  app.post('/api/participants', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const input = parseWith(participantSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const created = await createParticipant(tx, user.organizationId, user.id, input)
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'participant.create', entityType: 'participant', entityId: created.participant.id, summary: 'Yeni kursiyer kaydı oluşturuldu.', metadata: { participantType: created.participant.participantType, hasGuardian: Boolean(created.guardian) } })
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
      if (!course) throw notFound('Kurs bulunamadı.')
      if (course.status === 'cancelled' || course.status === 'completed') throw conflict('COURSE_NOT_ENROLLABLE', 'Bu kurs yeni kayıt kabul etmiyor.')
      let participantId = input.participantId
      if (input.participant) participantId = (await createParticipant(tx, user.organizationId, user.id, input.participant)).participant.id
      const [participant] = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, participantId!), eq(participants.organizationId, user.organizationId), eq(participants.isActive, true))).limit(1)
      if (!participant) throw notFound('Kursiyer bulunamadı.')
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
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'enrollment.create', entityType: 'enrollment', entityId: enrollment.id, summary: `Kurs kaydı ${status === 'active' ? 'aktif' : 'bekleme listesinde'} oluşturuldu.`, metadata: { courseId, status, waitlistPosition } })
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
      if (!enrollment) throw notFound('Kurs kaydı bulunamadı.')
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
