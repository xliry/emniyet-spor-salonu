import type { FastifyInstance } from 'fastify'
import { attendanceRoutes } from './attendance.js'
import { courseRoutes } from './courses.js'
import { dashboardRoutes } from './dashboard.js'
import { lanePlanRoutes } from './lanePlan.js'
import { instructorRoutes } from './instructor.js'
import { participantRoutes } from './participants.js'
import { paymentRoutes } from './payments.js'
import { poolCheckRoutes } from './poolChecks.js'

export async function operationRoutes(app: FastifyInstance) {
  await app.register(dashboardRoutes)
  await app.register(courseRoutes)
  await app.register(participantRoutes)
  await app.register(attendanceRoutes)
  await app.register(lanePlanRoutes)
  await app.register(instructorRoutes)
  await app.register(paymentRoutes)
  await app.register(poolCheckRoutes)
}
