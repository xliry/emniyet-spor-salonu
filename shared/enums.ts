export const STAFF_ROLES = ['owner', 'manager', 'front_desk', 'trainer'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const TERM_STATUSES = ['draft', 'registration_open', 'active', 'completed', 'cancelled'] as const
export const COURSE_STATUSES = ['draft', 'upcoming', 'active', 'completed', 'cancelled'] as const
export const SESSION_STATUSES = ['scheduled', 'completed', 'cancelled', 'rescheduled'] as const
export const ENROLLMENT_STATUSES = ['active', 'waitlisted', 'cancelled', 'completed'] as const
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused', 'makeup_required'] as const
export const PAYMENT_METHODS = ['cash', 'card_terminal', 'bank_transfer', 'other'] as const
export const PAYMENT_STATUSES = ['recorded', 'voided'] as const
export const PARTICIPANT_TYPES = ['member', 'external'] as const
export const CHECK_VALUE_TYPES = ['number', 'boolean', 'text'] as const
export const FACILITY_STATUSES = ['ok', 'attention', 'not_checked'] as const

