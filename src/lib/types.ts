export type Role = 'owner' | 'manager' | 'front_desk' | 'trainer'

export interface User {
  id: string
  fullName: string
  email: string
  role: Role
}

export interface ApiErrorShape {
  error: {
    code: string
    message: string
    fieldErrors?: Record<string, string[] | string>
    requestId?: string
  }
}

export interface PageMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface CourseSummary {
  id: string
  name: string
  category?: string
  termName?: string
  ageGroup?: string
  level?: string
  instructorName?: string
  scheduleLabel?: string
  laneLabel?: string
  capacity: number
  activeEnrollmentCount: number
  waitlistCount?: number
  feeAmountCents?: number
  status: 'draft' | 'active' | 'upcoming' | 'cancelled' | string
}

export interface CourseListResponse {
  items: CourseSummary[]
  meta: PageMeta
  filters?: {
    terms?: Array<{ id: string; name: string }>
    instructors?: Array<{ id: string; name: string }>
    branches?: Array<{ id: string; name: string }>
    lanes?: Array<{ id: string; name: string }>
  }
}

export interface DashboardResponse {
  date: string
  activeCourseCount: number
  totalActiveParticipants: number
  todayExpectedAttendance: number
  todayRecordedAttendance: number
  outstandingBalanceCents: number
  waitlistCount: number
  laneUtilizationPercent: number
  activeInstructorCount: number
  activeMembershipCount: number
  expiringMembershipCount: number
  membershipOutstandingBalanceCents: number
  poolStatus?: { label: string; temperature?: number; ph?: number; lastCheckedAt?: string }
  sessions: Array<{
    id: string
    courseId: string
    courseName: string
    startsAt: string
    endsAt: string
    laneName?: string
    instructorName?: string
    expectedCount: number
    recordedCount: number
  }>
  expiringMemberships: Array<{
    id: string
    participantId: string
    participantName: string
    planName: string
    endsOn: string
    balanceCents: number
  }>
  recentEvents: Array<{ id: string; type: string; summary: string; occurredAt: string }>
}

export interface Participant {
  id: string
  fullName: string
  phone?: string
  email?: string
  participantType?: 'member' | 'external'
  guardianName?: string
  activeEnrollmentCount?: number
  currentCourseName?: string
}

export interface Membership {
  id: string
  participantId: string
  participantName: string
  phone?: string
  email?: string
  planName: string
  durationDays: number
  poolAccess: boolean
  gymAccess: boolean
  status: 'active' | 'frozen' | 'expired' | 'cancelled' | string
  startsOn: string
  endsOn: string
  saleAmountCents: number
  paidTotalCents: number
  balanceCents: number
  lastPaidAt?: string
  notes?: string
}

export interface MembershipsResponse {
  items: Membership[]
  meta: PageMeta
  summary: {
    activeCount: number
    frozenCount: number
    expiredCount: number
    expiringSoonCount: number
    outstandingBalanceCents: number
  }
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'makeup_required' | null

export interface AttendanceRosterItem {
  enrollmentId: string
  participantId: string
  participantName: string
  guardianName?: string
  paymentAttention?: boolean
  status: AttendanceStatus
  note?: string | null
}

export interface AttendanceResponse {
  session: {
    id: string
    courseId: string
    courseName: string
    startsAt: string
    endsAt: string
    laneName?: string
  }
  roster: AttendanceRosterItem[]
}

export interface LanePlanResponse {
  date: string
  pools: Array<{ id: string; name: string }>
  lanes: Array<{ id: string; poolId: string; name: string; subtitle?: string }>
  sessions: Array<{
    id: string
    courseId: string
    courseName: string
    poolLaneId: string
    startsAt: string
    endsAt: string
    instructorName?: string
    enrolledCount?: number
    capacity?: number
    status?: string
    version?: number
  }>
}

export interface PoolCheckDefinition {
  id: string
  key: string
  label: string
  inputType: 'number' | 'boolean' | 'text'
  unit?: string
  minValue?: number | null
  maxValue?: number | null
  required?: boolean
}

export interface PoolChecksResponse {
  pools: Array<{ id: string; name: string }>
  definitions: PoolCheckDefinition[]
  latest?: { id: string; poolName: string; status: string; checkedAt: string; checkedBy: string }
  history: Array<{
    id: string
    poolName: string
    checkedAt: string
    checkedBy: string
    status: string
    summary?: string
  }>
}

export interface PaymentRecord {
  id: string
  participantName: string
  courseName: string
  enrollmentId: string
  amountCents: number
  method: string
  status: 'recorded' | 'voided' | string
  recordedAt: string
  recordedBy: string
}
