import type { FastifyRequest } from 'fastify'
import type { SessionUser } from '../../shared/contracts.js'
import type { StaffRole } from '../../shared/enums.js'
import { AppError } from '../../shared/errors.js'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
}

export function requireUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw new AppError(401, 'AUTH_REQUIRED', 'Oturum acmaniz gerekiyor.')
  return request.user
}

export function requireRole(request: FastifyRequest, roles: readonly StaffRole[]) {
  const user = requireUser(request)
  if (!roles.includes(user.role)) throw new AppError(403, 'FORBIDDEN', 'Bu islem icin yetkiniz yok.')
  return user
}

export const isManager = (role: StaffRole) => role === 'owner' || role === 'manager'

