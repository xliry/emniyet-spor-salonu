import { auditEvents } from '../db/schema.js'

interface AuditInput {
  organizationId: string
  actorUserId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  summary: string
  metadata?: Record<string, unknown>
}

export async function writeAudit(executor: any, input: AuditInput) {
  await executor.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  })
}

