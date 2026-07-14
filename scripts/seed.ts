import { sql } from 'drizzle-orm'
import { hashPassword } from '../server/auth/password.js'
import { db, pool } from '../server/db/client.js'
import {
  attendanceRecords, auditEvents, branches, courseScheduleRules, courseSessions, courseTerms, courses, enrollments,
  guardians, gymMemberships, instructors, membershipPayments, membershipPlans, organizationSettings, organizations, participantGuardians, participants, paymentRecords,
  poolCheckDefinitions, poolCheckRuns, poolCheckValues, poolLanes, pools, staffUsers,
} from '../server/db/schema.js'

const ids = {
  organization: '10000000-0000-4000-8000-000000000001', branch: '10000000-0000-4000-8000-000000000011',
  owner: '10000000-0000-4000-8000-000000000101', manager: '10000000-0000-4000-8000-000000000102', desk: '10000000-0000-4000-8000-000000000103', trainer: '10000000-0000-4000-8000-000000000104',
  instructor1: '10000000-0000-4000-8000-000000000201', instructor2: '10000000-0000-4000-8000-000000000202', instructor3: '10000000-0000-4000-8000-000000000203',
  pool1: '10000000-0000-4000-8000-000000000301', pool2: '10000000-0000-4000-8000-000000000302',
  term: '10000000-0000-4000-8000-000000000401',
}
const courseIds = Array.from({ length: 6 }, (_, index) => `10000000-0000-4000-8000-00000000050${index + 1}`)
const ruleIds = Array.from({ length: 6 }, (_, index) => `10000000-0000-4000-8000-00000000060${index + 1}`)
const sessionIds = Array.from({ length: 6 }, (_, index) => `10000000-0000-4000-8000-00000000070${index + 1}`)
const participantIds = Array.from({ length: 8 }, (_, index) => `10000000-0000-4000-8000-00000000080${index + 1}`)
const enrollmentIds = Array.from({ length: 8 }, (_, index) => `10000000-0000-4000-8000-00000000090${index + 1}`)
const laneIds = Array.from({ length: 8 }, (_, index) => `10000000-0000-4000-8000-00000000031${index + 1}`)
const membershipPlanIds = Array.from({ length: 3 }, (_, index) => `10000000-0000-4000-8000-00000000160${index + 1}`)
const membershipIds = Array.from({ length: 4 }, (_, index) => `10000000-0000-4000-8000-00000000170${index + 1}`)

function dayString(date: Date) { return date.toISOString().slice(0, 10) }
function weekMonday() {
  const now = new Date()
  const day = now.getUTCDay() || 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1))
  return monday
}
function atLocal(day: string, time: string) { return new Date(`${day}T${time}:00+03:00`) }

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
    throw new Error('Refusing to seed production unless SEED_DEMO_DATA=true')
  }
  const password = process.env.SEED_PASSWORD ?? 'Pilot!2026'
  const passwordHash = await hashPassword(password)
  const monday = weekMonday()
  const termStart = dayString(monday)
  const termEndDate = new Date(monday); termEndDate.setUTCDate(termEndDate.getUTCDate() + 90)
  const termEnd = dayString(termEndDate)

  await db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id: ids.organization, name: 'Emniyet Spor Salonu Pilot Tesisi', slug: 'emniyet-spor-salonu', timezone: 'Europe/Istanbul' })
      .onConflictDoUpdate({ target: organizations.id, set: { name: 'Emniyet Spor Salonu Pilot Tesisi', timezone: 'Europe/Istanbul', updatedAt: new Date() } })
    await tx.insert(organizationSettings).values({ organizationId: ids.organization, childAgeThreshold: 18 })
      .onConflictDoUpdate({ target: organizationSettings.organizationId, set: { childAgeThreshold: 18, updatedAt: new Date() } })
    await tx.insert(branches).values({ id: ids.branch, organizationId: ids.organization, name: 'Emniyet Spor Salonu', code: 'MERKEZ', address: 'Kurgu Pilot Yerleskesi' })
      .onConflictDoUpdate({ target: branches.id, set: { name: 'Emniyet Spor Salonu', code: 'MERKEZ', address: 'Kurgu Pilot Yerleskesi', isActive: true, updatedAt: new Date() } })

    const users = [
      { id: ids.owner, fullName: 'Pilot Sistem Sahibi', email: 'owner@emniyet-pilot.local', role: 'owner' as const },
      { id: ids.manager, fullName: 'Pilot Operasyon Yoneticisi', email: 'manager@emniyet-pilot.local', role: 'manager' as const },
      { id: ids.desk, fullName: 'Pilot Resepsiyon Gorevlisi', email: 'desk@emniyet-pilot.local', role: 'front_desk' as const },
      { id: ids.trainer, fullName: 'Pilot Yuzme Egitmeni', email: 'trainer@emniyet-pilot.local', role: 'trainer' as const },
    ]
    for (const user of users) {
      await tx.insert(staffUsers).values({ ...user, organizationId: ids.organization, branchId: user.role === 'owner' ? null : ids.branch, passwordHash })
        .onConflictDoUpdate({ target: staffUsers.id, set: { fullName: user.fullName, email: user.email, role: user.role, passwordHash, isActive: true, updatedAt: new Date() } })
    }
    const instructorRows = [
      { id: ids.instructor1, staffUserId: ids.trainer, fullName: 'Pilot Yuzme Egitmeni', phone: '+90 555 010 0001', specialties: ['Temel yuzme', 'Yetiskin'] },
      { id: ids.instructor2, staffUserId: null, fullName: 'Deniz Aksu', phone: '+90 555 010 0002', specialties: ['Cocuk grubu'] },
      { id: ids.instructor3, staffUserId: null, fullName: 'Ekin Yalcin', phone: '+90 555 010 0003', specialties: ['Teknik gelisim'] },
    ]
    for (const row of instructorRows) await tx.insert(instructors).values({ ...row, organizationId: ids.organization }).onConflictDoUpdate({ target: instructors.id, set: { staffUserId: row.staffUserId, fullName: row.fullName, phone: row.phone, specialties: row.specialties, isActive: true, updatedAt: new Date() } })

    for (const poolRow of [
      { id: ids.pool1, name: 'Ana Havuz', description: 'Kurgu pilot ana havuzu' },
      { id: ids.pool2, name: 'Cocuk Havuzu', description: 'Kurgu pilot egitim havuzu' },
    ]) await tx.insert(pools).values({ ...poolRow, organizationId: ids.organization, branchId: ids.branch }).onConflictDoUpdate({ target: pools.id, set: { name: poolRow.name, description: poolRow.description, isActive: true, updatedAt: new Date() } })
    for (let index = 0; index < laneIds.length; index += 1) {
      const poolId = index < 6 ? ids.pool1 : ids.pool2
      const name = index < 6 ? `Kulvar ${index + 1}` : `Egitim Alani ${index - 5}`
      await tx.insert(poolLanes).values({ id: laneIds[index], organizationId: ids.organization, poolId, name, sortOrder: index < 6 ? index + 1 : index - 5 }).onConflictDoUpdate({ target: poolLanes.id, set: { poolId, name, sortOrder: index < 6 ? index + 1 : index - 5, isActive: true, updatedAt: new Date() } })
    }
    await tx.insert(courseTerms).values({ id: ids.term, organizationId: ids.organization, name: 'Pilot Donem', startsOn: termStart, endsOn: termEnd, registrationOpensOn: termStart, registrationClosesOn: termEnd, status: 'active' })
      .onConflictDoUpdate({ target: courseTerms.id, set: { startsOn: termStart, endsOn: termEnd, registrationOpensOn: termStart, registrationClosesOn: termEnd, status: 'active', updatedAt: new Date() } })

    const courseRows = [
      ['Yetiskin Temel Yuzme', 'Yetiskin', 'baslangic', ids.instructor1, 12, 250000, 1, '09:00', '10:00', laneIds[0]],
      ['Cocuk Suya Uyum', 'Cocuk', 'baslangic', ids.instructor2, 1, 180000, 2, '10:30', '11:15', laneIds[6]],
      ['Teknik Gelisim', 'Performans', 'orta', ids.instructor3, 10, 300000, 3, '18:00', '19:00', laneIds[1]],
      ['Serbest Stil Atolyesi', 'Atolye', 'orta', ids.instructor1, 8, 220000, 4, '19:00', '20:00', laneIds[2]],
      ['Sabah Kondisyon', 'Kondisyon', 'ileri', ids.instructor3, 10, 280000, 5, '07:30', '08:30', laneIds[3]],
      ['Aile Yuzme Saati', 'Aile', 'karma', ids.instructor2, 14, 200000, 6, '11:00', '12:00', laneIds[4]],
    ] as const
    for (let index = 0; index < courseRows.length; index += 1) {
      const [title, category, level, instructorId, capacity, feeAmountCents, dayOfWeek, startsAtLocal, endsAtLocal, poolLaneId] = courseRows[index]
      await tx.insert(courses).values({ id: courseIds[index], organizationId: ids.organization, branchId: ids.branch, termId: ids.term, instructorId, title, category, level, capacity, minimumParticipants: 1, feeAmountCents, status: 'active', description: `${title} icin kurgu pilot kursu.` })
        .onConflictDoUpdate({ target: courses.id, set: { instructorId, title, category, level, capacity, feeAmountCents, status: 'active', updatedAt: new Date() } })
      await tx.insert(courseScheduleRules).values({ id: ruleIds[index], organizationId: ids.organization, courseId: courseIds[index], dayOfWeek, startsAtLocal, endsAtLocal, poolLaneId })
        .onConflictDoUpdate({ target: courseScheduleRules.id, set: { dayOfWeek, startsAtLocal, endsAtLocal, poolLaneId } })
      const day = new Date(monday); day.setUTCDate(day.getUTCDate() + dayOfWeek - 1)
      await tx.insert(courseSessions).values({ id: sessionIds[index], organizationId: ids.organization, courseId: courseIds[index], instructorId, poolLaneId, startsAt: atLocal(dayString(day), startsAtLocal), endsAt: atLocal(dayString(day), endsAtLocal), status: 'scheduled', sourceRuleId: ruleIds[index] })
        .onConflictDoUpdate({ target: courseSessions.id, set: { instructorId, poolLaneId, startsAt: atLocal(dayString(day), startsAtLocal), endsAt: atLocal(dayString(day), endsAtLocal), status: 'scheduled', sourceRuleId: ruleIds[index], updatedAt: new Date() } })
    }

    const people = [
      ['Ada', 'Koral', 'external', '1996-04-12'], ['Bora', 'Deniz', 'member', '1988-11-03'], ['Cemre', 'Ileri', 'external', '2016-02-20'],
      ['Doruk', 'Esen', 'external', '1992-07-08'], ['Ece', 'Yaman', 'member', '1985-01-15'], ['Firat', 'Uslu', 'external', '2001-09-09'],
      ['Gunes', 'Arin', 'external', '1999-06-24'], ['Hazal', 'Somer', 'member', '1990-12-30'],
    ] as const
    for (let index = 0; index < people.length; index += 1) {
      const [firstName, lastName, participantType, birthDate] = people[index]
      await tx.insert(participants).values({ id: participantIds[index], organizationId: ids.organization, participantType, firstName, lastName, birthDate, email: `${firstName.toLowerCase()}@fictional.invalid`, phone: `+90 555 020 00${String(index + 1).padStart(2, '0')}`, swimmingLevel: index % 2 ? 'orta' : 'baslangic', createdBy: ids.manager })
        .onConflictDoUpdate({ target: participants.id, set: { firstName, lastName, participantType, birthDate, isActive: true, updatedAt: new Date() } })
    }
    const guardianId = '10000000-0000-4000-8000-000000001001'
    await tx.insert(guardians).values({ id: guardianId, organizationId: ids.organization, fullName: 'Kurgu Veli Koral', relationship: 'Veli', phone: '+90 555 030 0001', email: 'veli@fictional.invalid' }).onConflictDoUpdate({ target: guardians.id, set: { fullName: 'Kurgu Veli Koral', phone: '+90 555 030 0001', updatedAt: new Date() } })
    await tx.insert(participantGuardians).values({ participantId: participantIds[2], guardianId, isPrimaryContact: true }).onConflictDoUpdate({ target: [participantGuardians.participantId, participantGuardians.guardianId], set: { isPrimaryContact: true } })

    const membershipPlanRows = [
      { id: membershipPlanIds[0], name: 'Aylik Salon + Havuz', durationDays: 30, priceCents: 180000, visitLimit: null, poolAccess: true, gymAccess: true },
      { id: membershipPlanIds[1], name: 'Uc Aylik Salon', durationDays: 90, priceCents: 420000, visitLimit: null, poolAccess: false, gymAccess: true },
      { id: membershipPlanIds[2], name: 'Aile Havuz Erisimi', durationDays: 30, priceCents: 250000, visitLimit: 12, poolAccess: true, gymAccess: false },
    ]
    for (const plan of membershipPlanRows) {
      await tx.insert(membershipPlans).values({ ...plan, organizationId: ids.organization }).onConflictDoUpdate({ target: membershipPlans.id, set: { name: plan.name, durationDays: plan.durationDays, priceCents: plan.priceCents, visitLimit: plan.visitLimit, poolAccess: plan.poolAccess, gymAccess: plan.gymAccess, isActive: true, updatedAt: new Date() } })
    }
    const membershipRows = [
      { id: membershipIds[0], participantIndex: 1, planIndex: 0, status: 'active' as const, startsOffset: -8, paidCents: 180000 },
      { id: membershipIds[1], participantIndex: 4, planIndex: 1, status: 'active' as const, startsOffset: -70, paidCents: 300000 },
      { id: membershipIds[2], participantIndex: 7, planIndex: 0, status: 'frozen' as const, startsOffset: -18, paidCents: 90000 },
      { id: membershipIds[3], participantIndex: 0, planIndex: 2, status: 'active' as const, startsOffset: -25, paidCents: 250000 },
    ]
    for (let index = 0; index < membershipRows.length; index += 1) {
      const row = membershipRows[index]
      const plan = membershipPlanRows[row.planIndex]
      const starts = new Date(monday); starts.setUTCDate(starts.getUTCDate() + row.startsOffset)
      const ends = new Date(starts); ends.setUTCDate(ends.getUTCDate() + plan.durationDays - 1)
      await tx.insert(gymMemberships).values({
        id: row.id,
        organizationId: ids.organization,
        participantId: participantIds[row.participantIndex],
        planId: plan.id,
        status: row.status,
        startsOn: dayString(starts),
        endsOn: dayString(ends),
        saleAmountCents: plan.priceCents,
        notes: 'Kurgu pilot salon uyeligi.',
        createdBy: ids.desk,
      }).onConflictDoUpdate({ target: gymMemberships.id, set: { participantId: participantIds[row.participantIndex], planId: plan.id, status: row.status, startsOn: dayString(starts), endsOn: dayString(ends), saleAmountCents: plan.priceCents, updatedAt: new Date() } })
      if (row.paidCents > 0) {
        await tx.insert(membershipPayments).values({ id: `10000000-0000-4000-8000-00000000180${index + 1}`, organizationId: ids.organization, membershipId: row.id, amountCents: row.paidCents, method: index % 2 ? 'cash' : 'card_terminal', paidAt: new Date(), recordedBy: ids.desk, reference: `PILOT-UYELIK-${index + 1}` })
          .onConflictDoUpdate({ target: membershipPayments.id, set: { amountCents: row.paidCents, status: 'recorded', voidedAt: null, voidedBy: null, voidReason: null, updatedAt: new Date() } })
      }
    }

    const enrollmentRows = [
      [0, 0, 'active', null], [1, 1, 'active', null], [1, 2, 'waitlisted', 1], [2, 3, 'active', null],
      [3, 4, 'active', null], [4, 5, 'active', null], [5, 6, 'active', null], [0, 7, 'active', null],
    ] as const
    for (let index = 0; index < enrollmentRows.length; index += 1) {
      const [courseIndex, participantIndex, status, waitlistPosition] = enrollmentRows[index]
      const fee = Number(courseRows[courseIndex][5])
      await tx.insert(enrollments).values({ id: enrollmentIds[index], organizationId: ids.organization, courseId: courseIds[courseIndex], participantId: participantIds[participantIndex], status, waitlistPosition, agreedFeeAmountCents: fee, registeredBy: ids.desk })
        .onConflictDoUpdate({ target: enrollments.id, set: { status, waitlistPosition, agreedFeeAmountCents: fee, updatedAt: new Date() } })
    }
    await tx.insert(attendanceRecords).values({ id: '10000000-0000-4000-8000-000000001101', organizationId: ids.organization, courseSessionId: sessionIds[0], enrollmentId: enrollmentIds[0], status: 'present', recordedBy: ids.trainer })
      .onConflictDoUpdate({ target: attendanceRecords.id, set: { status: 'present', recordedBy: ids.trainer, recordedAt: new Date(), updatedAt: new Date() } })
    await tx.insert(paymentRecords).values({ id: '10000000-0000-4000-8000-000000001201', organizationId: ids.organization, enrollmentId: enrollmentIds[0], amountCents: 100000, method: 'card_terminal', paidAt: new Date(), recordedBy: ids.desk, reference: 'PILOT-TAHSILAT-1' })
      .onConflictDoUpdate({ target: paymentRecords.id, set: { amountCents: 100000, status: 'recorded', voidedAt: null, voidedBy: null, voidReason: null, updatedAt: new Date() } })

    const definitionRows = [
      { id: '10000000-0000-4000-8000-000000001301', key: 'temperature', label: 'Su sicakligi', unit: 'C', valueType: 'number' as const, warningMin: '25', warningMax: '29', sortOrder: 1 },
      { id: '10000000-0000-4000-8000-000000001302', key: 'ph', label: 'pH', unit: 'pH', valueType: 'number' as const, warningMin: '7.0', warningMax: '7.8', sortOrder: 2 },
      { id: '10000000-0000-4000-8000-000000001303', key: 'visual_clarity', label: 'Gorsel berraklik', unit: null, valueType: 'boolean' as const, warningMin: null, warningMax: null, sortOrder: 3 },
    ]
    for (const definition of definitionRows) await tx.insert(poolCheckDefinitions).values({ ...definition, organizationId: ids.organization }).onConflictDoUpdate({ target: poolCheckDefinitions.id, set: { label: definition.label, unit: definition.unit, valueType: definition.valueType, warningMin: definition.warningMin, warningMax: definition.warningMax, isActive: true, sortOrder: definition.sortOrder, updatedAt: new Date() } })
    const runId = '10000000-0000-4000-8000-000000001401'
    await tx.insert(poolCheckRuns).values({ id: runId, organizationId: ids.organization, poolId: ids.pool1, performedBy: ids.manager, performedAt: new Date(), cleaningStatus: 'ok', equipmentStatus: 'ok', changingRoomStatus: 'ok', status: 'ok', note: 'Kurgu pilot kontrol kaydi.' }).onConflictDoUpdate({ target: poolCheckRuns.id, set: { performedAt: new Date(), status: 'ok', updatedAt: new Date() } })
    for (const value of [
      { id: '10000000-0000-4000-8000-000000001411', definitionId: definitionRows[0].id, numericValue: '27.2', booleanValue: null },
      { id: '10000000-0000-4000-8000-000000001412', definitionId: definitionRows[1].id, numericValue: '7.4', booleanValue: null },
      { id: '10000000-0000-4000-8000-000000001413', definitionId: definitionRows[2].id, numericValue: null, booleanValue: true },
    ]) await tx.insert(poolCheckValues).values({ ...value, organizationId: ids.organization, runId, textValue: null }).onConflictDoUpdate({ target: poolCheckValues.id, set: { numericValue: value.numericValue, booleanValue: value.booleanValue } })
    await tx.insert(auditEvents).values({ id: '10000000-0000-4000-8000-000000001501', organizationId: ids.organization, actorUserId: ids.manager, action: 'seed.complete', entityType: 'organization', entityId: ids.organization, summary: 'Kurgu pilot verileri hazirlandi.', metadata: { fixtureVersion: 1 } }).onConflictDoNothing()
  })
  const counts = await db.execute(sql`select (select count(*) from courses where organization_id=${ids.organization}) courses,(select count(*) from participants where organization_id=${ids.organization}) participants`)
  process.stdout.write(`Fictional seed complete: ${JSON.stringify(counts.rows[0])}\n`)
}

try { await seed() } finally { await pool.end() }
