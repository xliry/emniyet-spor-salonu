import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const citext = customType<{ data: string }>({ dataType: () => 'citext' })
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

export const staffRoleEnum = pgEnum('staff_role', ['owner', 'manager', 'front_desk', 'trainer'])
export const participantTypeEnum = pgEnum('participant_type', ['member', 'external'])
export const termStatusEnum = pgEnum('term_status', ['draft', 'registration_open', 'active', 'completed', 'cancelled'])
export const courseStatusEnum = pgEnum('course_status', ['draft', 'upcoming', 'active', 'completed', 'cancelled'])
export const sessionStatusEnum = pgEnum('course_session_status', ['scheduled', 'completed', 'cancelled', 'rescheduled'])
export const enrollmentStatusEnum = pgEnum('enrollment_status', ['active', 'waitlisted', 'cancelled', 'completed'])
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'absent', 'late', 'excused', 'makeup_required'])
export const paymentMethodEnum = pgEnum('payment_method', ['cash', 'card_terminal', 'bank_transfer', 'other'])
export const paymentStatusEnum = pgEnum('payment_status', ['recorded', 'voided'])
export const checkValueTypeEnum = pgEnum('check_value_type', ['number', 'boolean', 'text'])
export const facilityStatusEnum = pgEnum('facility_status', ['ok', 'attention', 'not_checked'])

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  timezone: text('timezone').notNull().default('Europe/Istanbul'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const organizationSettings = pgTable('organization_settings', {
  organizationId: uuid('organization_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  childAgeThreshold: integer('child_age_threshold').notNull().default(18),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [check('organization_settings_child_age_check', sql`${table.childAgeThreshold} between 1 and 30`)])

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  address: text('address'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('branches_org_code_unique').on(table.organizationId, table.code), index('branches_org_idx').on(table.organizationId)])

export const staffUsers = pgTable('staff_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  email: citext('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: staffRoleEnum('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('staff_users_org_idx').on(table.organizationId), index('staff_users_branch_idx').on(table.branchId)])

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  staffUserId: uuid('staff_user_id').notNull().references(() => staffUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [index('auth_sessions_user_idx').on(table.staffUserId), index('auth_sessions_expiry_idx').on(table.expiresAt)])

export const instructors = pgTable('instructors', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  staffUserId: uuid('staff_user_id').unique().references(() => staffUsers.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  phone: text('phone'),
  specialties: text('specialties').array().notNull().default(sql`ARRAY[]::text[]`),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('instructors_org_idx').on(table.organizationId)])

export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  participantType: participantTypeEnum('participant_type').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  birthDate: date('birth_date'),
  email: citext('email'),
  phone: text('phone'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  swimmingLevel: text('swimming_level'),
  safetyNotes: text('safety_notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdBy: uuid('created_by').notNull().references(() => staffUsers.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('participants_org_idx').on(table.organizationId), index('participants_creator_idx').on(table.createdBy)])

export const guardians = pgTable('guardians', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  relationship: text('relationship'),
  phone: text('phone').notNull(),
  email: citext('email'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('guardians_org_idx').on(table.organizationId)])

export const participantGuardians = pgTable('participant_guardians', {
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  guardianId: uuid('guardian_id').notNull().references(() => guardians.id, { onDelete: 'cascade' }),
  isPrimaryContact: boolean('is_primary_contact').notNull().default(false),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.participantId, table.guardianId] }), index('participant_guardians_guardian_idx').on(table.guardianId)])

export const pools = pgTable('pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  name: text('name').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('pools_org_name_unique').on(table.organizationId, table.name), index('pools_branch_idx').on(table.branchId)])

export const poolLanes = pgTable('pool_lanes', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  poolId: uuid('pool_id').notNull().references(() => pools.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('pool_lanes_pool_name_unique').on(table.poolId, table.name), index('pool_lanes_org_idx').on(table.organizationId)])

export const courseTerms = pgTable('course_terms', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  registrationOpensOn: date('registration_opens_on'),
  registrationClosesOn: date('registration_closes_on'),
  status: termStatusEnum('status').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [check('course_terms_dates_check', sql`${table.endsOn} >= ${table.startsOn}`), index('course_terms_org_idx').on(table.organizationId)])

export const courses = pgTable('courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  termId: uuid('term_id').notNull().references(() => courseTerms.id),
  instructorId: uuid('instructor_id').notNull().references(() => instructors.id),
  title: text('title').notNull(),
  category: text('category').notNull(),
  level: text('level').notNull(),
  ageMin: integer('age_min'),
  ageMax: integer('age_max'),
  capacity: integer('capacity').notNull(),
  minimumParticipants: integer('minimum_participants').notNull().default(1),
  feeAmountCents: integer('fee_amount_cents').notNull().default(0),
  memberDiscountPercent: integer('member_discount_percent').notNull().default(0),
  status: courseStatusEnum('status').notNull().default('draft'),
  description: text('description'),
  registrationNotes: text('registration_notes'),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check('courses_capacity_check', sql`${table.capacity} > 0`),
  check('courses_min_participants_check', sql`${table.minimumParticipants} > 0 and ${table.minimumParticipants} <= ${table.capacity}`),
  check('courses_fee_check', sql`${table.feeAmountCents} >= 0`),
  check('courses_discount_check', sql`${table.memberDiscountPercent} between 0 and 100`),
  check('courses_age_check', sql`${table.ageMin} is null or ${table.ageMax} is null or ${table.ageMax} >= ${table.ageMin}`),
  index('courses_org_status_idx').on(table.organizationId, table.status),
  index('courses_instructor_idx').on(table.instructorId),
  index('courses_term_idx').on(table.termId),
])

export const courseScheduleRules = pgTable('course_schedule_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(),
  startsAtLocal: time('starts_at_local').notNull(),
  endsAtLocal: time('ends_at_local').notNull(),
  poolLaneId: uuid('pool_lane_id').notNull().references(() => poolLanes.id),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex('course_schedule_rules_exact_unique').on(table.courseId, table.dayOfWeek, table.startsAtLocal, table.endsAtLocal, table.poolLaneId),
  check('course_schedule_rules_day_check', sql`${table.dayOfWeek} between 1 and 7`),
  check('course_schedule_rules_time_check', sql`${table.endsAtLocal} > ${table.startsAtLocal}`),
  index('course_schedule_rules_course_idx').on(table.courseId),
  index('course_schedule_rules_lane_idx').on(table.poolLaneId),
])

export const courseSessions = pgTable('course_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  instructorId: uuid('instructor_id').notNull().references(() => instructors.id),
  poolLaneId: uuid('pool_lane_id').notNull().references(() => poolLanes.id),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: sessionStatusEnum('status').notNull().default('scheduled'),
  cancellationReason: text('cancellation_reason'),
  sourceRuleId: uuid('source_rule_id').references(() => courseScheduleRules.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  check('course_sessions_time_check', sql`${table.endsAt} > ${table.startsAt}`),
  index('course_sessions_org_time_idx').on(table.organizationId, table.startsAt),
  index('course_sessions_course_idx').on(table.courseId),
  index('course_sessions_lane_time_idx').on(table.poolLaneId, table.startsAt, table.endsAt),
])

export const enrollments = pgTable('enrollments', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id),
  participantId: uuid('participant_id').notNull().references(() => participants.id),
  status: enrollmentStatusEnum('status').notNull(),
  waitlistPosition: integer('waitlist_position'),
  agreedFeeAmountCents: integer('agreed_fee_amount_cents').notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  registeredBy: uuid('registered_by').notNull().references(() => staffUsers.id),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [
  uniqueIndex('enrollments_course_participant_unique').on(table.courseId, table.participantId),
  check('enrollments_fee_check', sql`${table.agreedFeeAmountCents} >= 0`),
  check('enrollments_waitlist_check', sql`(${table.status} = 'waitlisted' and ${table.waitlistPosition} is not null and ${table.waitlistPosition} > 0) or (${table.status} <> 'waitlisted' and ${table.waitlistPosition} is null)`),
  index('enrollments_org_status_idx').on(table.organizationId, table.status),
  index('enrollments_course_status_idx').on(table.courseId, table.status),
  index('enrollments_participant_idx').on(table.participantId),
])

export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  courseSessionId: uuid('course_session_id').notNull().references(() => courseSessions.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id),
  status: attendanceStatusEnum('status').notNull(),
  note: text('note'),
  recordedBy: uuid('recorded_by').notNull().references(() => staffUsers.id),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('attendance_session_enrollment_unique').on(table.courseSessionId, table.enrollmentId), index('attendance_org_idx').on(table.organizationId), index('attendance_enrollment_idx').on(table.enrollmentId)])

export const paymentRecords = pgTable('payment_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  enrollmentId: uuid('enrollment_id').notNull().references(() => enrollments.id),
  amountCents: integer('amount_cents').notNull(),
  method: paymentMethodEnum('method').notNull(),
  status: paymentStatusEnum('status').notNull().default('recorded'),
  reference: text('reference'),
  note: text('note'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  recordedBy: uuid('recorded_by').notNull().references(() => staffUsers.id),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedBy: uuid('voided_by').references(() => staffUsers.id),
  voidReason: text('void_reason'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [check('payment_records_amount_check', sql`${table.amountCents} > 0`), index('payment_records_org_paid_idx').on(table.organizationId, table.paidAt), index('payment_records_enrollment_idx').on(table.enrollmentId)])

export const poolCheckDefinitions = pgTable('pool_check_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  label: text('label').notNull(),
  unit: text('unit'),
  valueType: checkValueTypeEnum('value_type').notNull(),
  warningMin: numeric('warning_min', { precision: 10, scale: 3 }),
  warningMax: numeric('warning_max', { precision: 10, scale: 3 }),
  isRequired: boolean('is_required').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [uniqueIndex('pool_check_definitions_org_key_unique').on(table.organizationId, table.key), check('pool_check_definitions_range_check', sql`${table.warningMin} is null or ${table.warningMax} is null or ${table.warningMax} >= ${table.warningMin}`)])

export const poolCheckRuns = pgTable('pool_check_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  poolId: uuid('pool_id').notNull().references(() => pools.id),
  performedBy: uuid('performed_by').notNull().references(() => staffUsers.id),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  cleaningStatus: facilityStatusEnum('cleaning_status').notNull(),
  equipmentStatus: facilityStatusEnum('equipment_status').notNull(),
  changingRoomStatus: facilityStatusEnum('changing_room_status').notNull(),
  status: facilityStatusEnum('status').notNull(),
  note: text('note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (table) => [index('pool_check_runs_org_time_idx').on(table.organizationId, table.performedAt), index('pool_check_runs_pool_idx').on(table.poolId)])

export const poolCheckValues = pgTable('pool_check_values', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  runId: uuid('run_id').notNull().references(() => poolCheckRuns.id, { onDelete: 'cascade' }),
  definitionId: uuid('definition_id').notNull().references(() => poolCheckDefinitions.id),
  numericValue: numeric('numeric_value', { precision: 12, scale: 3 }),
  textValue: text('text_value'),
  booleanValue: boolean('boolean_value'),
  createdAt: createdAt(),
}, (table) => [uniqueIndex('pool_check_values_run_definition_unique').on(table.runId, table.definitionId), index('pool_check_values_org_idx').on(table.organizationId)])

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => staffUsers.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  summary: text('summary').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, (table) => [index('audit_events_org_created_idx').on(table.organizationId, table.createdAt), index('audit_events_entity_idx').on(table.entityType, table.entityId)])

