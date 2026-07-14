import type { StaffRole } from './enums.js'

export interface SessionUser {
  id: string
  organizationId: string
  branchId: string | null
  fullName: string
  email: string
  role: StaffRole
  instructorId: string | null
}

export interface PublicUser {
  id: string
  fullName: string
  email: string
  role: StaffRole
}

export const toPublicUser = (user: SessionUser): PublicUser => ({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
})

