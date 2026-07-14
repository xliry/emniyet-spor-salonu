import { randomUUID } from 'node:crypto'
import { and, eq, isNull, lt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors.js'
import { toPublicUser } from '../../shared/contracts.js'
import { clearSessionCookie, createSessionToken, hashSessionToken, revokeSession, setSessionCookie } from '../auth/session.js'
import { requireUser } from '../auth/authorize.js'
import { verifyPassword } from '../auth/password.js'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { auditEvents, authSessions, staffUsers } from '../db/schema.js'
import { parseWith } from '../utils.js'

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  rememberMe: z.boolean().optional().default(false),
}).strict()

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parseWith(loginSchema, request.body)
    const email = body.email.trim().toLowerCase()
    const [user] = await db.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1)
    const valid = user?.isActive ? await verifyPassword(user.passwordHash, body.password).catch(() => false) : false
    if (!user || !valid) {
      if (user) {
        await db.insert(auditEvents).values({
          organizationId: user.organizationId,
          actorUserId: null,
          action: 'auth.login_failed',
          entityType: 'staff_user',
          entityId: user.id,
          summary: 'Basarisiz oturum acma denemesi.',
          metadata: { requestId: request.id },
        })
      }
      throw new AppError(401, 'INVALID_CREDENTIALS', 'E-posta veya sifre hatali.')
    }

    const token = createSessionToken()
    const sessionTtlHours = body.rememberMe ? config.REMEMBER_ME_TTL_DAYS * 24 : config.SESSION_TTL_HOURS
    const expiresAt = new Date(Date.now() + sessionTtlHours * 3_600_000)
    await db.transaction(async (tx) => {
      await tx.delete(authSessions).where(and(lt(authSessions.expiresAt, new Date()), isNull(authSessions.revokedAt)))
      await tx.insert(authSessions).values({
        id: randomUUID(),
        organizationId: user.organizationId,
        staffUserId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
      })
      await tx.update(staffUsers).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(staffUsers.id, user.id))
      await tx.insert(auditEvents).values({
        organizationId: user.organizationId,
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'staff_user',
        entityId: user.id,
        summary: 'Personel oturum acti.',
          metadata: { requestId: request.id, rememberMe: body.rememberMe },
      })
    })
    setSessionCookie(reply, token, expiresAt)
    return { user: { id: user.id, fullName: user.fullName, email: user.email, role: user.role } }
  })

  app.get('/api/auth/me', async (request) => ({ user: toPublicUser(requireUser(request)) }))

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME]
    if (request.user) {
      await db.transaction(async (tx) => {
        if (token) await tx.update(authSessions).set({ revokedAt: new Date() }).where(and(eq(authSessions.tokenHash, hashSessionToken(token)), isNull(authSessions.revokedAt)))
        await tx.insert(auditEvents).values({
          organizationId: request.user!.organizationId,
          actorUserId: request.user!.id,
          action: 'auth.logout',
          entityType: 'staff_user',
          entityId: request.user!.id,
          summary: 'Personel oturumu kapatti.',
          metadata: {},
        })
      })
    } else {
      await revokeSession(token)
    }
    clearSessionCookie(reply)
    return reply.code(204).send()
  })
}
