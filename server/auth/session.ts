import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { FastifyReply } from 'fastify'
import '@fastify/cookie'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { authSessions, instructors, staffUsers } from '../db/schema.js'
import type { SessionUser } from '../../shared/contracts.js'

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(staffUserId: string, organizationId: string) {
  const token = createSessionToken()
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3_600_000)
  await db.insert(authSessions).values({ staffUserId, organizationId, tokenHash, expiresAt })
  return { token, expiresAt }
}

export async function resolveSession(token?: string): Promise<SessionUser | null> {
  if (!token) return null
  const now = new Date()
  const [row] = await db
    .select({
      sessionId: authSessions.id,
      id: staffUsers.id,
      organizationId: staffUsers.organizationId,
      branchId: staffUsers.branchId,
      fullName: staffUsers.fullName,
      email: staffUsers.email,
      role: staffUsers.role,
      instructorId: instructors.id,
    })
    .from(authSessions)
    .innerJoin(staffUsers, eq(staffUsers.id, authSessions.staffUserId))
    .leftJoin(instructors, and(eq(instructors.staffUserId, staffUsers.id), eq(instructors.organizationId, staffUsers.organizationId)))
    .where(and(
      eq(authSessions.tokenHash, hashSessionToken(token)),
      gt(authSessions.expiresAt, now),
      isNull(authSessions.revokedAt),
      eq(staffUsers.isActive, true),
    ))
    .limit(1)
  if (!row) return null
  await db.update(authSessions).set({ lastSeenAt: now }).where(eq(authSessions.id, row.sessionId))
  return {
    id: row.id,
    organizationId: row.organizationId,
    branchId: row.branchId,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    instructorId: row.instructorId,
  }
}

export async function revokeSession(token?: string) {
  if (!token) return
  await db.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.tokenHash, hashSessionToken(token)), isNull(authSessions.revokedAt)))
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(config.SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
    maxAge: config.SESSION_TTL_HOURS * 60 * 60,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
  })
}
