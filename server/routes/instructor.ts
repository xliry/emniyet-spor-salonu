import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requireUser } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { localDateInIstanbul } from '../utils.js'

export async function instructorRoutes(app: FastifyInstance) {
  app.get('/api/instructor', async (request) => {
    const user = requireUser(request)
    const date = localDateInIstanbul()
    const start = new Date(`${date}T00:00:00+03:00`)
    const end = new Date(start.getTime() + 7 * 86_400_000)
    const rows = await db.execute(sql`
      select s.id,s.course_id,c.title course_name,s.starts_at,s.ends_at,l.name lane_name,i.full_name instructor_name,
        (select count(*) from enrollments e where e.course_id=c.id and e.status='active') participant_count,
        (select count(*) from attendance_records a where a.course_session_id=s.id) attendance_count
      from course_sessions s join courses c on c.id=s.course_id join pool_lanes l on l.id=s.pool_lane_id join instructors i on i.id=s.instructor_id
      where s.organization_id=${user.organizationId} and s.starts_at >= ${start} and s.starts_at < ${end} and s.status <> 'cancelled'
      ${user.role === 'trainer' ? sql`and s.instructor_id=${user.instructorId}` : sql``}
      order by s.starts_at
    `)
    return { date, sessions: rows.rows.map((item: any) => ({ id: item.id, courseId: item.course_id, courseName: item.course_name, startsAt: item.starts_at, endsAt: item.ends_at, laneName: item.lane_name, instructorName: item.instructor_name, participantCount: Number(item.participant_count), attendanceCount: Number(item.attendance_count) })) }
  })
}

