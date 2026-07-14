import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireUser } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { localDateInIstanbul, parseWith } from '../utils.js'

const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
const number = (value: unknown) => Number(value ?? 0)

export async function dashboardRoutes(app: FastifyInstance) {
  app.get('/api/dashboard', async (request) => {
    const user = requireUser(request)
    const { date = localDateInIstanbul() } = parseWith(querySchema, request.query)
    const start = new Date(`${date}T00:00:00+03:00`)
    const end = new Date(start.getTime() + 86_400_000)
    const trainerId = user.role === 'trainer' ? user.instructorId : null

    const metrics = await db.execute(sql`
      select
        (select count(*) from courses c where c.organization_id = ${user.organizationId} and c.status in ('active','upcoming') ${trainerId ? sql`and c.instructor_id = ${trainerId}` : sql``}) as active_course_count,
        (select count(distinct e.participant_id) from enrollments e join courses c on c.id=e.course_id where e.organization_id=${user.organizationId} and e.status='active' ${trainerId ? sql`and c.instructor_id = ${trainerId}` : sql``}) as active_participants,
        (select count(*) from course_sessions s join enrollments e on e.course_id=s.course_id and e.status='active' where s.organization_id=${user.organizationId} and s.status <> 'cancelled' and s.starts_at >= ${start} and s.starts_at < ${end} ${trainerId ? sql`and s.instructor_id = ${trainerId}` : sql``}) as expected_attendance,
        (select count(*) from attendance_records a join course_sessions s on s.id=a.course_session_id where a.organization_id=${user.organizationId} and s.starts_at >= ${start} and s.starts_at < ${end} ${trainerId ? sql`and s.instructor_id = ${trainerId}` : sql``}) as recorded_attendance,
        (select coalesce(sum(e.agreed_fee_amount_cents - coalesce(p.paid,0)),0) from enrollments e join courses c on c.id=e.course_id left join (select enrollment_id, sum(amount_cents) paid from payment_records where status='recorded' group by enrollment_id) p on p.enrollment_id=e.id where e.organization_id=${user.organizationId} and e.status in ('active','completed') ${trainerId ? sql`and c.instructor_id = ${trainerId}` : sql``}) as outstanding_balance,
        (select count(*) from enrollments e join courses c on c.id=e.course_id where e.organization_id=${user.organizationId} and e.status='waitlisted' ${trainerId ? sql`and c.instructor_id = ${trainerId}` : sql``}) as waitlist_count,
        (select count(*) from instructors i where i.organization_id=${user.organizationId} and i.is_active=true) as active_instructors,
        (select count(distinct s.pool_lane_id) from course_sessions s where s.organization_id=${user.organizationId} and s.status <> 'cancelled' and s.starts_at < ${end} and s.ends_at > ${start}) as used_lanes,
        (select count(*) from pool_lanes l where l.organization_id=${user.organizationId} and l.is_active=true) as total_lanes
    `)
    const row = metrics.rows[0] as Record<string, unknown>
    const sessionsResult = await db.execute(sql`
      select s.id, s.course_id, c.title course_name, s.starts_at, s.ends_at, l.name lane_name,
        i.full_name instructor_name,
        (select count(*) from enrollments e where e.course_id=c.id and e.status='active') expected_count,
        (select count(*) from attendance_records a where a.course_session_id=s.id) recorded_count
      from course_sessions s
      join courses c on c.id=s.course_id
      join instructors i on i.id=s.instructor_id
      join pool_lanes l on l.id=s.pool_lane_id
      where s.organization_id=${user.organizationId} and s.starts_at >= ${start} and s.starts_at < ${end} and s.status <> 'cancelled'
      ${trainerId ? sql`and s.instructor_id=${trainerId}` : sql``}
      order by s.starts_at
    `)
    const latestCheckResult = await db.execute(sql`
      select r.id, r.status, r.performed_at, p.name pool_name,
        max(case when d.key='temperature' then v.numeric_value end) temperature,
        max(case when d.key='ph' then v.numeric_value end) ph
      from pool_check_runs r join pools p on p.id=r.pool_id
      left join pool_check_values v on v.run_id=r.id left join pool_check_definitions d on d.id=v.definition_id
      where r.organization_id=${user.organizationId}
      group by r.id,p.name order by r.performed_at desc limit 1
    `)
    const recentResult = user.role === 'owner' || user.role === 'manager'
      ? await db.execute(sql`select id, action, summary, created_at from audit_events where organization_id=${user.organizationId} order by created_at desc limit 8`)
      : { rows: [] }
    const latest = latestCheckResult.rows[0] as Record<string, unknown> | undefined
    return {
      date,
      activeCourseCount: number(row.active_course_count),
      totalActiveParticipants: number(row.active_participants),
      todayExpectedAttendance: number(row.expected_attendance),
      todayRecordedAttendance: number(row.recorded_attendance),
      outstandingBalanceCents: user.role === 'trainer' ? 0 : number(row.outstanding_balance),
      waitlistCount: number(row.waitlist_count),
      laneUtilizationPercent: number(row.total_lanes) ? Math.round(number(row.used_lanes) / number(row.total_lanes) * 100) : 0,
      activeInstructorCount: number(row.active_instructors),
      poolStatus: latest ? { label: String(latest.status), temperature: latest.temperature == null ? undefined : number(latest.temperature), ph: latest.ph == null ? undefined : number(latest.ph), lastCheckedAt: String(latest.performed_at) } : undefined,
      sessions: sessionsResult.rows.map((item: any) => ({
        id: item.id, courseId: item.course_id, courseName: item.course_name, startsAt: item.starts_at,
        endsAt: item.ends_at, laneName: item.lane_name, instructorName: item.instructor_name,
        expectedCount: number(item.expected_count), recordedCount: number(item.recorded_count),
      })),
      recentEvents: recentResult.rows.map((item: any) => ({ id: item.id, type: item.action, summary: item.summary, occurredAt: item.created_at })),
    }
  })
}
