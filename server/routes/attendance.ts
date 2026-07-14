import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ATTENDANCE_STATUSES } from '../../shared/enums.js'
import { AppError, notFound } from '../../shared/errors.js'
import { requireUser } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { attendanceRecords, auditEvents } from '../db/schema.js'
import { parseWith, uuidSchema } from '../utils.js'

const paramsSchema = z.object({ sessionId: uuidSchema })
const saveSchema = z.object({
  records: z.array(z.object({ enrollmentId: uuidSchema, status: z.enum(ATTENDANCE_STATUSES), note: z.string().max(500).nullable().optional() }).strict()).min(1).max(500),
}).superRefine((value, context) => {
  if (new Set(value.records.map((item) => item.enrollmentId)).size !== value.records.length) context.addIssue({ code: 'custom', path: ['records'], message: 'Ayni kursiyer birden fazla kez gonderilemez.' })
})

async function sessionForUser(sessionId: string, user: ReturnType<typeof requireUser>) {
  const result = await db.execute(sql`
    select s.*,c.title course_name,l.name lane_name
    from course_sessions s join courses c on c.id=s.course_id join pool_lanes l on l.id=s.pool_lane_id
    where s.id=${sessionId} and s.organization_id=${user.organizationId}
    ${user.role === 'trainer' ? sql`and s.instructor_id=${user.instructorId}` : sql``} limit 1
  `)
  return result.rows[0] as any
}

export async function attendanceRoutes(app: FastifyInstance) {
  app.get('/api/sessions/:sessionId/attendance', async (request) => {
    const user = requireUser(request)
    const { sessionId } = parseWith(paramsSchema, request.params)
    const session = await sessionForUser(sessionId, user)
    if (!session) throw notFound('Ders oturumu bulunamadi.')
    const roster = await db.execute(sql`
      select e.id enrollment_id,p.id participant_id,concat(p.first_name,' ',p.last_name) participant_name,g.full_name guardian_name,
        a.status,a.note,
        (e.agreed_fee_amount_cents - coalesce((select sum(pr.amount_cents) from payment_records pr where pr.enrollment_id=e.id and pr.status='recorded'),0)) > 0 payment_attention
      from enrollments e join participants p on p.id=e.participant_id
      left join participant_guardians pg on pg.participant_id=p.id and pg.is_primary_contact=true left join guardians g on g.id=pg.guardian_id
      left join attendance_records a on a.enrollment_id=e.id and a.course_session_id=${sessionId}
      where e.organization_id=${user.organizationId} and e.course_id=${session.course_id} and e.status='active'
      order by p.first_name,p.last_name
    `)
    return {
      session: { id: session.id, courseId: session.course_id, courseName: session.course_name, startsAt: session.starts_at, endsAt: session.ends_at, laneName: session.lane_name },
      roster: roster.rows.map((item: any) => ({ enrollmentId: item.enrollment_id, participantId: item.participant_id, participantName: item.participant_name, guardianName: item.guardian_name, paymentAttention: item.payment_attention, status: item.status, note: item.note })),
    }
  })

  app.put('/api/sessions/:sessionId/attendance', async (request) => {
    const user = requireUser(request)
    const { sessionId } = parseWith(paramsSchema, request.params)
    const body = parseWith(saveSchema, request.body)
    const session = await sessionForUser(sessionId, user)
    if (!session) throw notFound('Ders oturumu bulunamadi.')
    if (session.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'Iptal edilen oturum icin yoklama kaydedilemez.')
    const ids = body.records.map((item) => item.enrollmentId)
    const valid = await db.execute(sql`select id from enrollments where organization_id=${user.organizationId} and course_id=${session.course_id} and status='active' and id in (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`)
    if (valid.rows.length !== ids.length) throw new AppError(400, 'ATTENDANCE_ENROLLMENT_MISMATCH', 'Bir veya daha fazla kurs kaydi bu derse ait degil.')
    const saved = await db.transaction(async (tx) => {
      const rows = []
      for (const record of body.records) {
        const [row] = await tx.insert(attendanceRecords).values({
          organizationId: user.organizationId, courseSessionId: sessionId, enrollmentId: record.enrollmentId,
          status: record.status, note: record.note, recordedBy: user.id, recordedAt: new Date(), updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: [attendanceRecords.courseSessionId, attendanceRecords.enrollmentId],
          set: { status: record.status, note: record.note, recordedBy: user.id, recordedAt: new Date(), updatedAt: new Date() },
        }).returning()
        rows.push(row)
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'attendance.save', entityType: 'course_session', entityId: sessionId, summary: `${rows.length} kursiyer icin yoklama kaydedildi.`, metadata: { recordCount: rows.length } })
      return rows
    })
    const summary = Object.fromEntries(ATTENDANCE_STATUSES.map((status) => [status, saved.filter((item) => item.status === status).length]))
    return { records: saved, summary }
  })
}
