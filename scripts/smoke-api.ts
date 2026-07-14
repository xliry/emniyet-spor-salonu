import { randomUUID } from 'node:crypto'

const baseUrl = (process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '')
const origin = process.env.SMOKE_ORIGIN ?? baseUrl
const password = process.env.SEED_PASSWORD ?? 'Pilot!2026'
const mode = process.argv[2] ?? 'all'

interface Session { cookie: string; role: string }
interface ResponseResult<T = any> { status: number; body: T; headers: Headers }

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Smoke assertion failed: ${message}`)
}

async function request<T = any>(path: string, options: RequestInit & { session?: Session; expected?: number | number[] } = {}): Promise<ResponseResult<T>> {
  const { session, expected = 200, ...init } = options
  const headers = new Headers(init.headers)
  headers.set('accept', 'application/json')
  if (init.body) headers.set('content-type', 'application/json')
  if (session) headers.set('cookie', session.cookie)
  if (init.method && !['GET', 'HEAD'].includes(init.method)) headers.set('origin', origin)
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers, redirect: 'manual' })
  const text = await response.text()
  const body = text ? JSON.parse(text) : undefined
  const statuses = Array.isArray(expected) ? expected : [expected]
  if (!statuses.includes(response.status)) throw new Error(`${init.method ?? 'GET'} ${path}: expected ${statuses.join('/')}, got ${response.status}: ${text}`)
  return { status: response.status, body, headers: response.headers }
}

async function login(email: string, expected = 200): Promise<Session> {
  const response = await request<{ user: { role: string } }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), expected })
  if (expected !== 200) return { cookie: '', role: '' }
  const setCookie = response.headers.get('set-cookie') ?? ''
  assert(/HttpOnly/i.test(setCookie), 'login cookie must be HttpOnly')
  const cookie = setCookie.split(';', 1)[0]
  assert(cookie.includes('='), 'login must set a session cookie')
  return { cookie, role: response.body.user.role }
}

async function authSmoke() {
  await request('/health/live')
  await request('/health/ready')
  await request('/api/dashboard', { expected: 401 })
  const invalid = await request<any>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'owner@emniyet-pilot.local', password: 'definitely-wrong' }), expected: 401 })
  assert(invalid.body.error.code === 'INVALID_CREDENTIALS', 'invalid login must use generic credential error')
  const manager = await login('manager@emniyet-pilot.local')
  const me = await request<any>('/api/auth/me', { session: manager })
  assert(me.body.user.role === 'manager', 'manager session must resolve')
  return manager
}

async function references(session: Session) {
  const response = await request<any>('/api/courses?pageSize=100', { session })
  assert(Array.isArray(response.body.items) && response.body.items.length >= 6, 'fictional seed must expose at least six courses')
  assert(response.body.filters?.terms?.length, 'course filters must contain terms')
  assert(response.body.filters?.instructors?.length, 'course filters must contain instructors')
  assert(response.body.filters?.branches?.length, 'course filters must contain branches')
  assert(response.body.filters?.lanes?.length, 'course filters must contain lanes')
  return response.body
}

async function createCourse(session: Session) {
  const refs = await references(session)
  let payload: any
  let created: ResponseResult<any> | undefined
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = randomUUID().slice(0, 8)
    const minute = String(Math.floor(Math.random() * 50)).padStart(2, '0')
    const dayOfWeek = 1 + Math.floor(Math.random() * 7)
    const lane = refs.filters.lanes[Math.floor(Math.random() * refs.filters.lanes.length)]
    payload = {
      branchId: refs.filters.branches[0].id,
      termId: refs.filters.terms[0].id,
      instructorId: refs.filters.instructors[0].id,
      title: `Smoke Kursu ${suffix}`,
      category: 'Smoke', level: 'baslangic', capacity: 1, minimumParticipants: 1,
      feeAmountCents: 50000, status: 'upcoming',
      scheduleRules: [{ dayOfWeek, startsAtLocal: `22:${minute}`, endsAtLocal: `23:${minute}`, poolLaneId: lane.id }],
    }
    const candidate = await request<any>('/api/courses', { method: 'POST', session, body: JSON.stringify(payload), expected: [201, 409] })
    if (candidate.status === 201) { created = candidate; break }
  }
  assert(created, 'smoke must find a conflict-free recurring slot')
  assert(created.body.course.id, 'manager must create course')
  const filtered = await request<any>(`/api/courses?query=${encodeURIComponent(payload.title)}`, { session })
  assert(filtered.body.items.some((item: any) => item.id === created.body.course.id), 'course query filter must find created course')
  const conflictResponse = await request<any>('/api/courses', { method: 'POST', session, body: JSON.stringify({ ...payload, title: `${payload.title} Catisma` }), expected: 409 })
  assert(conflictResponse.body.error.code === 'LANE_SCHEDULE_CONFLICT', 'overlapping course must return lane conflict')
  return { courseId: created.body.course.id, payload }
}

async function enrollmentSmoke(manager: Session) {
  const { courseId } = await createCourse(manager)
  const nested = (suffix: string) => ({ participant: { participantType: 'external', firstName: `Smoke${suffix}`, lastName: 'Kursiyer', birthDate: '1990-01-01', email: `smoke-${suffix}@fictional.invalid`, phone: '+90 555 099 0000' } })
  const first = await request<any>(`/api/courses/${courseId}/enrollments`, { method: 'POST', session: manager, body: JSON.stringify(nested(randomUUID().slice(0, 6))), expected: 201 })
  const second = await request<any>(`/api/courses/${courseId}/enrollments`, { method: 'POST', session: manager, body: JSON.stringify(nested(randomUUID().slice(0, 6))), expected: 201 })
  assert(first.body.status === 'active', 'first enrollment below capacity must be active')
  assert(second.body.status === 'waitlisted' && second.body.waitlistPosition === 1, 'second enrollment over capacity must be first waitlist entry')
  return { courseId, activeEnrollmentId: first.body.enrollmentId, waitlistEnrollmentId: second.body.enrollmentId }
}

async function attendanceSmoke(manager: Session) {
  const prepared = await enrollmentSmoke(manager)
  const detail = await request<any>(`/api/courses/${prepared.courseId}`, { session: manager })
  const sessionId = detail.body.upcomingSessions[0]?.id
  assert(sessionId, 'created recurring course must have a session')
  const payload = { records: [{ enrollmentId: prepared.activeEnrollmentId, status: 'present', note: null }] }
  await request(`/api/sessions/${sessionId}/attendance`, { method: 'PUT', session: manager, body: JSON.stringify(payload) })
  await request(`/api/sessions/${sessionId}/attendance`, { method: 'PUT', session: manager, body: JSON.stringify(payload) })
  const roster = await request<any>(`/api/sessions/${sessionId}/attendance`, { session: manager })
  const matches = roster.body.roster.filter((item: any) => item.enrollmentId === prepared.activeEnrollmentId)
  assert(matches.length === 1 && matches[0].status === 'present', 'attendance upsert must remain one row')
  return { ...prepared, sessionId }
}

async function paymentSmoke(manager: Session) {
  const prepared = await enrollmentSmoke(manager)
  const desk = await login('desk@emniyet-pilot.local')
  const recorded = await request<any>(`/api/enrollments/${prepared.activeEnrollmentId}/payments`, { method: 'POST', session: desk, expected: 201, body: JSON.stringify({ amountCents: 1000, method: 'cash' }) })
  assert(recorded.body.payment.id, 'front desk must record payment')
  await request(`/api/payments/${recorded.body.payment.id}/void`, { method: 'POST', session: desk, expected: 403, body: JSON.stringify({ reason: 'Smoke yetki kontrolu' }) })
  const voided = await request<any>(`/api/payments/${recorded.body.payment.id}/void`, { method: 'POST', session: manager, body: JSON.stringify({ reason: 'Smoke iptal kontrolu' }) })
  assert(voided.body.payment.status === 'voided', 'manager must void payment')
}

async function operationsSmoke(manager: Session) {
  const plan = await request<any>('/api/lane-plan', { session: manager })
  assert(plan.body.pools.length >= 2 && plan.body.lanes.length >= 2, 'lane plan must include seeded pools and lanes')
  const checks = await request<any>('/api/pool-checks', { session: manager })
  assert(checks.body.pools.length && checks.body.definitions.length, 'pool check references must exist')
  const values = checks.body.definitions.map((definition: any) => ({
    definitionId: definition.id,
    value: definition.inputType === 'number' ? (definition.minValue ?? 1) : definition.inputType === 'boolean' ? true : 'normal',
  }))
  const created = await request<any>('/api/pool-checks', { method: 'POST', session: manager, expected: 201, body: JSON.stringify({ poolId: checks.body.pools[0].id, cleaningStatus: 'ok', equipmentStatus: 'ok', changingRoomStatus: 'ok', values }) })
  assert(created.body.run.id, 'manager must record pool check')
}

async function coursePermissionSmoke(manager: Session) {
  const trainer = await login('trainer@emniyet-pilot.local')
  const refs = await references(manager)
  const deniedPayload = { branchId: refs.filters.branches[0].id, termId: refs.filters.terms[0].id, instructorId: refs.filters.instructors[0].id, title: 'Yetkisiz Smoke Kursu', category: 'Smoke', level: 'baslangic', capacity: 2, feeAmountCents: 0, scheduleRules: [{ dayOfWeek: 7, startsAtLocal: '20:00', endsAtLocal: '21:00', poolLaneId: refs.filters.lanes[0].id }] }
  await request('/api/courses', { method: 'POST', session: trainer, expected: 403, body: JSON.stringify(deniedPayload) })
  await createCourse(manager)
}

async function finalSafetySmoke(manager: Session) {
  await request(`/api/courses/${randomUUID()}`, { session: manager, expected: 404 })
  const dashboard = await request<any>('/api/dashboard', { session: manager })
  assert(dashboard.body.recentEvents.some((item: any) => String(item.type).includes('course') || String(item.type).includes('pool_check') || String(item.type).includes('enrollment')), 'critical writes must appear in audit summaries')
}

async function main() {
  const manager = await authSmoke()
  if (mode === 'auth') return
  if (mode === 'seed') { await references(manager); return }
  if (mode === 'courses' || mode === 'course-create') { await coursePermissionSmoke(manager); return }
  if (mode === 'enrollment') { await enrollmentSmoke(manager); return }
  if (mode === 'attendance') { await attendanceSmoke(manager); return }
  if (mode === 'operations') { await operationsSmoke(manager); return }
  if (mode === 'payments') { await paymentSmoke(manager); return }
  await references(manager)
  await coursePermissionSmoke(manager)
  await attendanceSmoke(manager)
  await operationsSmoke(manager)
  await paymentSmoke(manager)
  await finalSafetySmoke(manager)
}

await main()
process.stdout.write(`API smoke passed (${mode}).\n`)
