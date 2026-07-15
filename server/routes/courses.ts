import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { conflict, notFound } from '../../shared/errors.js'
import { COURSE_STATUSES } from '../../shared/enums.js'
import { requireRole, requireUser } from '../auth/authorize.js'
import { db } from '../db/client.js'
import {
  auditEvents, branches, courseScheduleRules, courseSessions, courseTerms, courses, instructors, poolLanes,
} from '../db/schema.js'
import { parseWith, sessionDates, uuidSchema } from '../utils.js'

const listSchema = z.object({
  termId: uuidSchema.optional(), ageGroup: z.enum(['child', 'adult', 'mixed']).optional(), level: z.string().max(80).optional(),
  instructorId: uuidSchema.optional(), dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
  status: z.enum(COURSE_STATUSES).optional(), occupancy: z.enum(['available', 'full', 'waitlist']).optional(),
  query: z.string().max(120).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
const ruleSchema = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startsAtLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAtLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  poolLaneId: uuidSchema,
}).refine((value) => value.endsAtLocal > value.startsAtLocal, { message: 'Bitis saati baslangictan sonra olmalidir.', path: ['endsAtLocal'] })
const createSchema = z.object({
  branchId: uuidSchema, termId: uuidSchema, instructorId: uuidSchema,
  title: z.string().trim().min(2).max(160).optional(), name: z.string().trim().min(2).max(160).optional(),
  category: z.string().trim().min(1).max(80), level: z.string().trim().min(1).max(80),
  ageMin: z.number().int().min(0).max(120).nullable().optional(), ageMax: z.number().int().min(0).max(120).nullable().optional(),
  capacity: z.number().int().positive().max(500), minimumParticipants: z.number().int().positive().optional(),
  feeAmountCents: z.number().int().nonnegative(), memberDiscountPercent: z.number().int().min(0).max(100).optional(),
  status: z.enum(COURSE_STATUSES).default('upcoming'), description: z.string().max(3000).nullable().optional(), registrationNotes: z.string().max(2000).nullable().optional(),
  scheduleRules: z.array(ruleSchema).min(1).max(14),
}).superRefine((value, context) => {
  if (!value.title && !value.name) context.addIssue({ code: 'custom', path: ['title'], message: 'Kurs adi zorunludur.' })
  if (value.ageMin != null && value.ageMax != null && value.ageMax < value.ageMin) context.addIssue({ code: 'custom', path: ['ageMax'], message: 'Ust yas alt yastan kucuk olamaz.' })
  if ((value.minimumParticipants ?? 1) > value.capacity) context.addIssue({ code: 'custom', path: ['minimumParticipants'], message: 'Minimum katilim kapasiteyi asamaz.' })
})
const patchSchema = z.object({
  version: z.number().int().positive(), title: z.string().trim().min(2).max(160).optional(), name: z.string().trim().min(2).max(160).optional(),
  category: z.string().trim().min(1).max(80).optional(), level: z.string().trim().min(1).max(80).optional(),
  capacity: z.number().int().positive().max(500).optional(), minimumParticipants: z.number().int().positive().optional(),
  feeAmountCents: z.number().int().nonnegative().optional(), description: z.string().max(3000).nullable().optional(), registrationNotes: z.string().max(2000).nullable().optional(),
  instructorId: uuidSchema.optional(), status: z.enum(COURSE_STATUSES).optional(),
}).strict()

const formatSchedule = (rules: any[]) => rules.map((rule) => `${rule.day_of_week}. gun ${String(rule.starts_at_local).slice(0, 5)}-${String(rule.ends_at_local).slice(0, 5)}`).join(', ')

export async function courseRoutes(app: FastifyInstance) {
  app.get('/api/courses', async (request) => {
    const user = requireUser(request)
    const query = parseWith(listSchema, request.query)
    const conditions: SQL[] = [sql`c.organization_id = ${user.organizationId}`]
    if (user.role === 'trainer') {
      if (!user.instructorId) return { items: [], meta: { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 }, filters: { terms: [], instructors: [] } }
      conditions.push(sql`c.instructor_id = ${user.instructorId}`)
    }
    if (query.termId) conditions.push(sql`c.term_id = ${query.termId}`)
    if (query.instructorId) conditions.push(sql`c.instructor_id = ${query.instructorId}`)
    if (query.level) conditions.push(sql`c.level = ${query.level}`)
    if (query.status) conditions.push(sql`c.status = ${query.status}`)
    if (query.query) conditions.push(sql`(c.title ilike ${`%${query.query}%`} or c.category ilike ${`%${query.query}%`})`)
    if (query.dayOfWeek) conditions.push(sql`exists (select 1 from course_schedule_rules r where r.course_id=c.id and r.day_of_week=${query.dayOfWeek})`)
    if (query.ageGroup === 'child') conditions.push(sql`coalesce(c.age_max,17) < 18`)
    if (query.ageGroup === 'adult') conditions.push(sql`coalesce(c.age_min,18) >= 18`)
    if (query.ageGroup === 'mixed') conditions.push(sql`coalesce(c.age_min,0) < 18 and coalesce(c.age_max,120) >= 18`)
    if (query.occupancy === 'available') conditions.push(sql`(select count(*) from enrollments e where e.course_id=c.id and e.status='active') < c.capacity`)
    if (query.occupancy === 'full') conditions.push(sql`(select count(*) from enrollments e where e.course_id=c.id and e.status='active') >= c.capacity`)
    if (query.occupancy === 'waitlist') conditions.push(sql`exists (select 1 from enrollments e where e.course_id=c.id and e.status='waitlisted')`)
    const where = sql.join(conditions, sql` and `)
    const offset = (query.page - 1) * query.pageSize
    const [itemsResult, countResult, termRows, instructorRows, branchRows, laneRows] = await Promise.all([
      db.execute(sql`
        select c.*, t.name term_name, i.full_name instructor_name,
          (select count(*) from enrollments e where e.course_id=c.id and e.status='active') active_count,
          (select count(*) from enrollments e where e.course_id=c.id and e.status='waitlisted') waitlist_count,
          (select json_agg(json_build_object('day_of_week',r.day_of_week,'starts_at_local',r.starts_at_local,'ends_at_local',r.ends_at_local,'lane_name',l.name) order by r.day_of_week,r.starts_at_local)
             from course_schedule_rules r join pool_lanes l on l.id=r.pool_lane_id where r.course_id=c.id) rules
        from courses c join course_terms t on t.id=c.term_id join instructors i on i.id=c.instructor_id
        where ${where} order by c.created_at desc limit ${query.pageSize} offset ${offset}
      `),
      db.execute(sql`select count(*) total from courses c where ${where}`),
      db.select({ id: courseTerms.id, name: courseTerms.name }).from(courseTerms).where(eq(courseTerms.organizationId, user.organizationId)),
      db.select({ id: instructors.id, name: instructors.fullName }).from(instructors).where(and(eq(instructors.organizationId, user.organizationId), eq(instructors.isActive, true))),
      db.select({ id: branches.id, name: branches.name }).from(branches).where(and(eq(branches.organizationId, user.organizationId), eq(branches.isActive, true))),
      db.execute(sql`select l.id,l.name,p.name pool_name from pool_lanes l join pools p on p.id=l.pool_id where l.organization_id=${user.organizationId} and l.is_active=true order by p.name,l.sort_order`),
    ])
    const total = Number((countResult.rows[0] as any)?.total ?? 0)
    return {
      items: itemsResult.rows.map((item: any) => ({
        id: item.id, name: item.title, category: item.category, termName: item.term_name,
        ageGroup: item.age_min == null && item.age_max == null ? 'Tum yaslar' : `${item.age_min ?? 0}-${item.age_max ?? '+'}`,
        level: item.level, instructorName: item.instructor_name, scheduleLabel: formatSchedule(item.rules ?? []),
        laneLabel: (item.rules ?? []).map((rule: any) => rule.lane_name).filter((value: string, index: number, array: string[]) => array.indexOf(value) === index).join(', '),
        capacity: item.capacity, activeEnrollmentCount: Number(item.active_count), waitlistCount: Number(item.waitlist_count), feeAmountCents: item.fee_amount_cents, status: item.status,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
      filters: { terms: termRows, instructors: instructorRows, branches: branchRows, lanes: laneRows.rows.map((row: any) => ({ id: row.id, name: `${row.pool_name} / ${row.name}` })) },
    }
  })

  app.post('/api/courses', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager'])
    const body = parseWith(createSchema, request.body)
    const title = body.title ?? body.name!
    const result = await db.transaction(async (tx) => {
      const [term] = await tx.select().from(courseTerms).where(and(eq(courseTerms.id, body.termId), eq(courseTerms.organizationId, user.organizationId))).limit(1)
      if (!term) throw notFound('Donem bulunamadi.')
      const [branch] = await tx.select({ id: branches.id }).from(branches).where(and(eq(branches.id, body.branchId), eq(branches.organizationId, user.organizationId), eq(branches.isActive, true))).limit(1)
      if (!branch) throw notFound('Sube bulunamadi.')
      const [instructor] = await tx.select().from(instructors).where(and(eq(instructors.id, body.instructorId), eq(instructors.organizationId, user.organizationId), eq(instructors.isActive, true))).limit(1)
      if (!instructor) throw notFound('Egitmen bulunamadi.')
      const lanes = await tx.select({ id: poolLanes.id }).from(poolLanes).where(and(eq(poolLanes.organizationId, user.organizationId), inArray(poolLanes.id, body.scheduleRules.map((rule) => rule.poolLaneId))))
      if (lanes.length !== new Set(body.scheduleRules.map((rule) => rule.poolLaneId)).size) throw notFound('Kulvar bulunamadi.')
      const [course] = await tx.insert(courses).values({
        organizationId: user.organizationId, branchId: body.branchId, termId: body.termId, instructorId: body.instructorId,
        title, category: body.category, level: body.level, ageMin: body.ageMin, ageMax: body.ageMax,
        capacity: body.capacity, minimumParticipants: body.minimumParticipants ?? 1, feeAmountCents: body.feeAmountCents,
        memberDiscountPercent: body.memberDiscountPercent ?? 0, status: body.status, description: body.description, registrationNotes: body.registrationNotes,
      }).returning()
      let sessionCount = 0
      for (const ruleInput of body.scheduleRules) {
        const [rule] = await tx.insert(courseScheduleRules).values({ organizationId: user.organizationId, courseId: course.id, ...ruleInput }).returning()
        const generated = sessionDates(term.startsOn, term.endsOn, ruleInput.dayOfWeek, ruleInput.startsAtLocal, ruleInput.endsAtLocal)
        if (generated.length) {
          await tx.insert(courseSessions).values(generated.map((slot) => ({
            organizationId: user.organizationId, courseId: course.id, instructorId: body.instructorId,
            poolLaneId: ruleInput.poolLaneId, startsAt: slot.startsAt, endsAt: slot.endsAt, status: 'scheduled' as const, sourceRuleId: rule.id,
          })))
          sessionCount += generated.length
        }
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'course.create', entityType: 'course', entityId: course.id, summary: `${title} kursu olusturuldu.`, metadata: { sessionCount } })
      return { course, sessionCount }
    })
    return reply.code(201).send({ course: { ...result.course, name: result.course.title }, sessionCount: result.sessionCount })
  })

  app.get('/api/courses/:courseId', async (request) => {
    const user = requireUser(request)
    const { courseId } = parseWith(z.object({ courseId: uuidSchema }), request.params)
    const result = await db.execute(sql`
      select c.*,t.name term_name,i.full_name instructor_name,b.name branch_name
      from courses c join course_terms t on t.id=c.term_id join instructors i on i.id=c.instructor_id join branches b on b.id=c.branch_id
      where c.id=${courseId} and c.organization_id=${user.organizationId} ${user.role === 'trainer' ? sql`and c.instructor_id=${user.instructorId}` : sql``} limit 1
    `)
    const course = result.rows[0] as any
    if (!course) throw notFound('Kurs bulunamadi.')
    const [rules, sessions, roster, waitlist, summary] = await Promise.all([
      db.execute(sql`select r.*,l.name lane_name,p.name pool_name from course_schedule_rules r join pool_lanes l on l.id=r.pool_lane_id join pools p on p.id=l.pool_id where r.course_id=${courseId} order by r.day_of_week,r.starts_at_local`),
      db.execute(sql`select s.*,l.name lane_name from course_sessions s join pool_lanes l on l.id=s.pool_lane_id where s.course_id=${courseId} and s.organization_id=${user.organizationId} order by s.starts_at`),
      db.execute(sql`select e.*,p.id participant_id,concat(p.first_name,' ',p.last_name) participant_name,p.participant_type,g.full_name guardian_name,
        coalesce((select sum(pr.amount_cents) from payment_records pr where pr.enrollment_id=e.id and pr.status='recorded'),0) paid_amount_cents,
        e.agreed_fee_amount_cents-coalesce((select sum(pr.amount_cents) from payment_records pr where pr.enrollment_id=e.id and pr.status='recorded'),0) balance_cents,
        coalesce(round(100.0*(select count(*) from attendance_records a join course_sessions s on s.id=a.course_session_id where a.enrollment_id=e.id and a.status in ('present','late'))/nullif((select count(*) from attendance_records a where a.enrollment_id=e.id),0)),0) attendance_percent
        from enrollments e join participants p on p.id=e.participant_id left join participant_guardians pg on pg.participant_id=p.id and pg.is_primary_contact=true left join guardians g on g.id=pg.guardian_id where e.course_id=${courseId} and e.status='active' order by p.first_name,p.last_name`),
      db.execute(sql`select e.*,concat(p.first_name,' ',p.last_name) participant_name from enrollments e join participants p on p.id=e.participant_id where e.course_id=${courseId} and e.status='waitlisted' order by e.waitlist_position`),
      db.execute(sql`select coalesce(sum(e.agreed_fee_amount_cents),0) agreed,coalesce(sum(x.paid),0) paid,(select count(*) from attendance_records a join course_sessions s on s.id=a.course_session_id where s.course_id=${courseId}) attendance_count from enrollments e left join (select enrollment_id,sum(amount_cents) paid from payment_records where status='recorded' group by enrollment_id) x on x.enrollment_id=e.id where e.course_id=${courseId}`),
    ])
    const payment = summary.rows[0] as any
    const mappedRules = rules.rows.map((item: any) => ({ id: item.id, dayOfWeek: item.day_of_week, startTime: String(item.starts_at_local).slice(0, 5), endTime: String(item.ends_at_local).slice(0, 5), laneName: item.lane_name, poolName: item.pool_name }))
    const mappedSessions = sessions.rows.map((item: any) => ({ id: item.id, startsAt: item.starts_at, endsAt: item.ends_at, laneName: item.lane_name, status: item.status, version: item.version }))
    const mappedRoster = roster.rows.map((item: any) => ({ enrollmentId: item.id, participantId: item.participant_id, participantName: item.participant_name, participantType: item.participant_type, guardianName: item.guardian_name, status: item.status, agreedFeeAmountCents: Number(item.agreed_fee_amount_cents), attendancePercent: Number(item.attendance_percent), paymentAttention: Number(item.balance_cents) > 0, ...(user.role === 'trainer' ? {} : { paidAmountCents: Number(item.paid_amount_cents), balanceCents: Number(item.balance_cents) }) }))
    const mappedWaitlist = waitlist.rows.map((item: any) => ({ enrollmentId: item.id, participantId: item.participant_id, participantName: item.participant_name, status: item.status, position: item.waitlist_position }))
    return {
      course: { id: course.id, name: course.title, category: course.category, level: course.level, termName: course.term_name, status: course.status, instructorName: course.instructor_name, branchName: course.branch_name, scheduleLabel: formatSchedule(rules.rows), capacity: course.capacity, version: course.version, feeAmountCents: course.fee_amount_cents, description: course.description },
      scheduleRules: mappedRules, upcomingSessions: mappedSessions, roster: mappedRoster, activeRoster: mappedRoster, waitlist: mappedWaitlist,
      summary: { activeCount: mappedRoster.length, waitlistCount: mappedWaitlist.length, ...(user.role === 'trainer' ? {} : { outstandingBalanceCents: Number(payment.agreed) - Number(payment.paid) }), attendancePercent: payment.attendance_count ? Math.round(Number(payment.attendance_count) / Math.max(mappedRoster.length * mappedSessions.length, 1) * 100) : 0 },
      participantCounts: { active: mappedRoster.length, waitlisted: mappedWaitlist.length }, paymentSummary: user.role === 'trainer' ? undefined : payment,
      attendanceSummary: { recorded: Number(payment.attendance_count ?? 0) }, instructorNotesSummary: course.registration_notes ?? null, laneInformation: mappedRules, notes: [],
    }
  })

  app.patch('/api/courses/:courseId', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { courseId } = parseWith(z.object({ courseId: uuidSchema }), request.params)
    const body = parseWith(patchSchema, request.body)
    if (body.instructorId) {
      const [instructor] = await db.select({ id: instructors.id }).from(instructors).where(and(eq(instructors.id, body.instructorId), eq(instructors.organizationId, user.organizationId), eq(instructors.isActive, true))).limit(1)
      if (!instructor) throw notFound('Egitmen bulunamadi.')
    }
    const { version, name, ...fields } = body
    const values: Record<string, unknown> = { ...fields, updatedAt: new Date(), version: version + 1 }
    if (name && !fields.title) values.title = name
    const [updated] = await db.update(courses).set(values).where(and(eq(courses.id, courseId), eq(courses.organizationId, user.organizationId), eq(courses.version, version))).returning()
    if (!updated) {
      const [exists] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), eq(courses.organizationId, user.organizationId))).limit(1)
      if (!exists) throw notFound('Kurs bulunamadi.')
      throw conflict('COURSE_VERSION_CONFLICT', 'Kurs baska bir kullanici tarafindan guncellendi. Sayfayi yenileyin.')
    }
    await db.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'course.update', entityType: 'course', entityId: courseId, summary: `${updated.title} kursu guncellendi.`, metadata: { version: updated.version } })
    return { course: { ...updated, name: updated.title } }
  })

  app.post('/api/courses/:courseId/cancel', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { courseId } = parseWith(z.object({ courseId: uuidSchema }), request.params)
    const { reason } = parseWith(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), request.body)
    return db.transaction(async (tx) => {
      const [course] = await tx.update(courses).set({ status: 'cancelled', version: sql`${courses.version} + 1`, updatedAt: new Date() }).where(and(eq(courses.id, courseId), eq(courses.organizationId, user.organizationId))).returning()
      if (!course) throw notFound('Kurs bulunamadi.')
      await tx.update(courseSessions).set({ status: 'cancelled', cancellationReason: reason, updatedAt: new Date() }).where(and(eq(courseSessions.courseId, courseId), eq(courseSessions.organizationId, user.organizationId), inArray(courseSessions.status, ['scheduled', 'rescheduled'])))
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'course.cancel', entityType: 'course', entityId: courseId, summary: `${course.title} kursu iptal edildi.`, metadata: { reasonCategory: 'staff_provided' } })
      return { course: { ...course, name: course.title } }
    })
  })
}
