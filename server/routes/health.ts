import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../db/client.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health/live', async () => ({ status: 'ok' }))
  app.get('/health/ready', async (_request, reply) => {
    try {
      await Promise.race([
        db.execute(sql`select 1`),
        new Promise((_, reject) => setTimeout(() => reject(new Error('readiness timeout')), 2_500)),
      ])
      return { status: 'ready' }
    } catch (error) {
      app.log.warn({ err: error }, 'database readiness failed')
      return reply.code(503).send({ status: 'not_ready' })
    }
  })
}

