import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { conflict, notFound } from '../../shared/errors.js'
import { requireRole, requireUser } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, courseSessions, poolLanes } from '../db/schema.js'
import { localDateInIstanbul, parseWith, uuidSchema } from '../utils.js'

const rangeSchema = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), poolId: uuidSchema.optional(), date: z.string().date().optional() }).superRefine((value, context) => {
  if (Boolean(value.from) !== Boolean(value.to)) context.addIssue({ code: 'custom', path: ['from'], message: 'Baslangic ve bitis birlikte verilmelidir.' })
  if (value.from && value.to && new Date(value.to) <= new Date(value.from)) context.addIssue({ code: 'custom', path: ['to'], message: 'Bitis baslangictan sonra olmalidir.' })
})

export async function lanePlanRoutes(app: FastifyInstance) {
  app.get('/api/lane-plan', async (request) => {
    const user = requireUser(request)
    const query = parseWith(rangeSchema, request.query)
    const date = query.date ?? (query.from ? query.from.slice(0, 10) : localDateInIstanbul())
    const from = query.from ? new Date(query.from) : new Date(`${date}T00:00:00+03:00`)
    const to = query.to ? new Date(query.to) : new Date(from.getTime() + 86_400_000)
    const [poolRows, laneRows, sessionRows] = await Promise.all([
      db.execute(sql`select id,name from pools where organization_id=${user.organizationId} and is_active=true ${query.poolId ? sql`and id=${query.poolId}` : sql``} order by name`),
      db.execute(sql`select l.id,l.pool_id,l.name,p.name subtitle from pool_lanes l join pools p on p.id=l.pool_id where l.organization_id=${user.organizationId} and l.is_active=true ${query.poolId ? sql`and l.pool_id=${query.poolId}` : sql``} order by p.name,l.sort_order`),
      db.execute(sql`
        select s.id,s.course_id,c.title course_name,s.pool_lane_id,s.starts_at,s.ends_at,i.full_name instructor_name,s.status,s.version,c.capacity,
          (select count(*) from enrollments e where e.course_id=c.id and e.status='active') enrolled_count
        from course_sessions s join courses c on c.id=s.course_id join instructors i on i.id=s.instructor_id join pool_lanes l on l.id=s.pool_lane_id
        where s.organization_id=${user.organizationId} and s.starts_at < ${to} and s.ends_at > ${from} ${query.poolId ? sql`and l.pool_id=${query.poolId}` : sql``}
        order by s.starts_at
      `),
    ])
    return {
      date,
      pools: poolRows.rows,
      lanes: laneRows.rows.map((item: any) => ({ id: item.id, poolId: item.pool_id, name: item.name, subtitle: item.subtitle })),
      sessions: sessionRows.rows.map((item: any) => ({ id: item.id, courseId: item.course_id, courseName: item.course_name, poolLaneId: item.pool_lane_id, startsAt: item.starts_at, endsAt: item.ends_at, instructorName: item.instructor_name, enrolledCount: Number(item.enrolled_count), capacity: item.capacity, status: item.status, version: item.version })),
    }
  })

  app.patch('/api/sessions/:sessionId/lane', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { sessionId } = parseWith(z.object({ sessionId: uuidSchema }), request.params)
    const body = parseWith(z.object({ poolLaneId: uuidSchema, version: z.number().int().positive() }).strict(), request.body)
    return db.transaction(async (tx) => {
      const [lane] = await tx.select({ id: poolLanes.id }).from(poolLanes).where(and(eq(poolLanes.id, body.poolLaneId), eq(poolLanes.organizationId, user.organizationId), eq(poolLanes.isActive, true))).limit(1)
      if (!lane) throw notFound('Kulvar bulunamadi.')
      const [updated] = await tx.update(courseSessions).set({ poolLaneId: body.poolLaneId, version: body.version + 1, updatedAt: new Date() }).where(and(eq(courseSessions.id, sessionId), eq(courseSessions.organizationId, user.organizationId), eq(courseSessions.version, body.version))).returning()
      if (!updated) {
        const [exists] = await tx.select({ id: courseSessions.id }).from(courseSessions).where(and(eq(courseSessions.id, sessionId), eq(courseSessions.organizationId, user.organizationId))).limit(1)
        if (!exists) throw notFound('Ders oturumu bulunamadi.')
        throw conflict('SESSION_VERSION_CONFLICT', 'Ders oturumu baska bir kullanici tarafindan degistirildi.')
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'lane.assignment_change', entityType: 'course_session', entityId: sessionId, summary: 'Ders oturumunun kulvari degistirildi.', metadata: { poolLaneId: body.poolLaneId, version: updated.version } })
      return { session: updated }
    })
  })
}

