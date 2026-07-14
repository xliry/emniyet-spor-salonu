import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import { AppError } from '../shared/errors.js'
import { resolveSession } from './auth/session.js'
import { config } from './config.js'
import { pool } from './db/client.js'
import { authRoutes } from './routes/auth.js'
import { healthRoutes } from './routes/health.js'
import { operationRoutes } from './routes/operations.js'

interface PgError extends Error { code?: string; constraint?: string }

export async function buildApp() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    trustProxy: config.trustProxy,
    bodyLimit: 256 * 1024,
    genReqId: () => `req_${crypto.randomUUID()}`,
  })
  app.decorateRequest('user', null)
  await app.register(cookie)
  await app.register(helmet, { contentSecurityPolicy: false })
  await app.register(cors, {
    credentials: true,
    origin: config.APP_ORIGIN ? [config.APP_ORIGIN] : true,
  })
  await app.register(rateLimit, { global: false })

  app.addHook('onRequest', async (request) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME]
    request.user = await resolveSession(token)
  })
  app.addHook('preHandler', async (request) => {
    if (!config.isProduction || !request.url.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return
    if (request.headers.origin !== config.APP_ORIGIN) throw new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Istek kaynagi kabul edilmedi.')
  })

  app.setErrorHandler((error: FastifyError | AppError | PgError, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors, requestId: request.id } })
    }
    const pgError = ((error as FastifyError & { cause?: PgError }).cause ?? error) as PgError
    if (pgError.code === '23P01' || pgError.constraint === 'course_sessions_lane_no_overlap') {
      return reply.code(409).send({ error: { code: 'LANE_SCHEDULE_CONFLICT', message: 'Secilen kulvar ve saat araliginda baska bir ders var.', fieldErrors: {}, requestId: request.id } })
    }
    if (pgError.code === '23505') {
      return reply.code(409).send({ error: { code: 'DUPLICATE_RECORD', message: 'Ayni kayit zaten mevcut.', fieldErrors: {}, requestId: request.id } })
    }
    const fastifyError = error as FastifyError
    if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      return reply.code(fastifyError.statusCode).send({ error: { code: 'INVALID_REQUEST', message: 'Istek bicimi veya icerigi gecersiz.', fieldErrors: {}, requestId: request.id } })
    }
    request.log.error({ err: error, requestId: request.id }, 'unexpected request error')
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Islem tamamlanamadi.', fieldErrors: {}, requestId: request.id } })
  })

  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(operationRoutes)

  const dist = resolve(process.cwd(), 'dist')
  if (existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/health/')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Uct nokta bulunamadi.', fieldErrors: {}, requestId: request.id } })
      }
      return reply.sendFile('index.html')
    })
  }
  app.addHook('onClose', async () => { await pool.end() })
  return app
}
