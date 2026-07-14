import { and, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { FACILITY_STATUSES } from '../../shared/enums.js'
import { AppError, notFound } from '../../shared/errors.js'
import { requireRole } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, poolCheckDefinitions, poolCheckRuns, poolCheckValues, pools } from '../db/schema.js'
import { parseWith, uuidSchema } from '../utils.js'

const createSchema = z.object({
  poolId: uuidSchema, performedAt: z.string().datetime({ offset: true }).optional(),
  cleaningStatus: z.enum(FACILITY_STATUSES), equipmentStatus: z.enum(FACILITY_STATUSES), changingRoomStatus: z.enum(FACILITY_STATUSES),
  note: z.string().max(1000).nullable().optional(),
  values: z.array(z.object({ definitionId: uuidSchema, value: z.union([z.number(), z.boolean(), z.string().max(500)]) }).strict()).max(100),
}).strict().superRefine((value, context) => {
  if (new Set(value.values.map((item) => item.definitionId)).size !== value.values.length) context.addIssue({ code: 'custom', path: ['values'], message: 'Ayni kontrol degeri birden fazla kez gonderilemez.' })
})

export async function poolCheckRoutes(app: FastifyInstance) {
  app.get('/api/pool-checks', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const query = parseWith(z.object({ poolId: uuidSchema.optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }), request.query)
    const [poolRows, definitions, history] = await Promise.all([
      db.select({ id: pools.id, name: pools.name }).from(pools).where(and(eq(pools.organizationId, user.organizationId), eq(pools.isActive, true))),
      db.select().from(poolCheckDefinitions).where(and(eq(poolCheckDefinitions.organizationId, user.organizationId), eq(poolCheckDefinitions.isActive, true))).orderBy(poolCheckDefinitions.sortOrder),
      db.execute(sql`
        select r.id,r.status,r.performed_at,p.name pool_name,u.full_name checked_by,
          concat(r.cleaning_status,' / ',r.equipment_status,' / ',r.changing_room_status) summary
        from pool_check_runs r join pools p on p.id=r.pool_id join staff_users u on u.id=r.performed_by
        where r.organization_id=${user.organizationId}
        ${query.poolId ? sql`and r.pool_id=${query.poolId}` : sql``}
        ${query.from ? sql`and r.performed_at >= ${new Date(query.from)}` : sql``}
        ${query.to ? sql`and r.performed_at < ${new Date(query.to)}` : sql``}
        order by r.performed_at desc limit 100
      `),
    ])
    const mapped = history.rows.map((item: any) => ({ id: item.id, poolName: item.pool_name, checkedAt: item.performed_at, checkedBy: item.checked_by, status: item.status, summary: item.summary }))
    return {
      pools: poolRows,
      definitions: definitions.map((item) => ({ id: item.id, key: item.key, label: item.label, inputType: item.valueType, unit: item.unit, minValue: item.warningMin == null ? null : Number(item.warningMin), maxValue: item.warningMax == null ? null : Number(item.warningMax), required: item.isRequired })),
      latest: mapped[0],
      history: mapped,
    }
  })

  app.post('/api/pool-checks', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager'])
    const body = parseWith(createSchema, request.body)
    const [pool] = await db.select({ id: pools.id }).from(pools).where(and(eq(pools.id, body.poolId), eq(pools.organizationId, user.organizationId), eq(pools.isActive, true))).limit(1)
    if (!pool) throw notFound('Havuz bulunamadi.')
    const definitions = await db.select().from(poolCheckDefinitions).where(and(eq(poolCheckDefinitions.organizationId, user.organizationId), eq(poolCheckDefinitions.isActive, true)))
    const byId = new Map(definitions.map((definition) => [definition.id, definition]))
    const valuesById = new Map(body.values.map((value) => [value.definitionId, value.value]))
    for (const definition of definitions) {
      if (definition.isRequired && !valuesById.has(definition.id)) throw new AppError(400, 'POOL_CHECK_VALUE_REQUIRED', `${definition.label} degeri zorunludur.`, { values: definition.label })
    }
    let hasWarning = [body.cleaningStatus, body.equipmentStatus, body.changingRoomStatus].includes('attention')
    const normalized = body.values.map((item) => {
      const definition = byId.get(item.definitionId)
      if (!definition) throw new AppError(400, 'POOL_CHECK_DEFINITION_INVALID', 'Kontrol tanimi bu tesise ait degil.')
      if (definition.valueType === 'number') {
        const numeric = Number(item.value)
        if ((typeof item.value !== 'number' && typeof item.value !== 'string') || !Number.isFinite(numeric)) throw new AppError(400, 'POOL_CHECK_VALUE_TYPE_INVALID', `${definition.label} icin sayisal deger gecersiz.`)
        if ((definition.warningMin != null && numeric < Number(definition.warningMin)) || (definition.warningMax != null && numeric > Number(definition.warningMax))) hasWarning = true
        return { definitionId: item.definitionId, numericValue: String(numeric), textValue: null, booleanValue: null }
      }
      if (definition.valueType === 'boolean') {
        if (typeof item.value !== 'boolean') throw new AppError(400, 'POOL_CHECK_VALUE_TYPE_INVALID', `${definition.label} icin secim gecersiz.`)
        if (item.value === false) hasWarning = true
        return { definitionId: item.definitionId, numericValue: null, textValue: null, booleanValue: Boolean(item.value) }
      }
      if (typeof item.value !== 'string') throw new AppError(400, 'POOL_CHECK_VALUE_TYPE_INVALID', `${definition.label} icin metin degeri gecersiz.`)
      return { definitionId: item.definitionId, numericValue: null, textValue: item.value, booleanValue: null }
    })
    const status = hasWarning ? 'attention' as const : 'ok' as const
    const result = await db.transaction(async (tx) => {
      const [run] = await tx.insert(poolCheckRuns).values({ organizationId: user.organizationId, poolId: body.poolId, performedBy: user.id, performedAt: body.performedAt ? new Date(body.performedAt) : new Date(), cleaningStatus: body.cleaningStatus, equipmentStatus: body.equipmentStatus, changingRoomStatus: body.changingRoomStatus, status, note: body.note }).returning()
      if (normalized.length) await tx.insert(poolCheckValues).values(normalized.map((item) => ({ ...item, organizationId: user.organizationId, runId: run.id })))
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'pool_check.create', entityType: 'pool_check_run', entityId: run.id, summary: `Havuz operasyon kontrolu ${status === 'ok' ? 'normal' : 'dikkat gerekli'} olarak kaydedildi.`, metadata: { poolId: body.poolId, status, valueCount: normalized.length } })
      return run
    })
    return reply.code(201).send({ run: result, statusLabel: status === 'ok' ? 'Tesis araliginda' : 'Dikkat gerekli', rangeNotice: 'Tesis tarafindan belirlenen aralik' })
  })
}
