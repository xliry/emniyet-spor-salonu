import { and, desc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { MEMBERSHIP_STATUSES, PAYMENT_METHODS } from '../../shared/enums.js'
import { AppError, conflict, notFound } from '../../shared/errors.js'
import { requireRole } from '../auth/authorize.js'
import { db } from '../db/client.js'
import { auditEvents, gymMemberships, membershipDebts, membershipPayments, membershipPlans, participants } from '../db/schema.js'
import { membershipBalanceCents } from '../domain/membershipFinance.js'
import { nextReceiptNumber } from '../domain/receiptNumbers.js'
import { localDateInIstanbul, parseWith, uuidSchema } from '../utils.js'

const createMembershipSchema = z.object({
  participantId: uuidSchema.optional(),
  participant: z.object({
    firstName: z.string().trim().min(2).max(100),
    lastName: z.string().trim().min(2).max(100),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().email().max(254).nullable().optional(),
    birthDate: z.string().date().nullable().optional(),
    emergencyContactName: z.string().max(160).nullable().optional(),
    emergencyContactPhone: z.string().max(40).nullable().optional(),
    safetyNotes: z.string().max(1000).nullable().optional(),
  }).strict().optional(),
  planId: uuidSchema,
  startsOn: z.string().date().optional(),
  status: z.enum(MEMBERSHIP_STATUSES).default('active'),
  saleAmountCents: z.number().int().nonnegative().optional(),
  initialPaymentCents: z.number().int().nonnegative().default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).default('cash'),
  note: z.string().max(500).nullable().optional(),
}).strict().superRefine((value, context) => {
  if (Boolean(value.participantId) === Boolean(value.participant)) context.addIssue({ code: 'custom', path: ['participantId'], message: 'Mevcut üye seçin veya yeni üye bilgisi girin.' })
})
const membershipPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(PAYMENT_METHODS),
  paidAt: z.string().datetime({ offset: true }).optional(),
  reference: z.string().max(120).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  allowOverpayment: z.boolean().default(false),
}).strict()
const membershipDebtSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  dueOn: z.string().date().nullable().optional(),
}).strict()
const membershipPlanSchema = z.object({
  name: z.string().trim().min(2).max(120),
  durationDays: z.number().int().min(1).max(3_650),
  priceCents: z.number().int().nonnegative().max(100_000_000),
  visitLimit: z.number().int().min(1).max(10_000).nullable().optional(),
  poolAccess: z.boolean(),
  gymAccess: z.boolean(),
  isActive: z.boolean().optional(),
}).strict().refine((value) => value.poolAccess || value.gymAccess, { message: 'Pakette en az bir erişim alanı seçin.' })

export async function membershipRoutes(app: FastifyInstance) {
  app.get('/api/membership-plans', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const rows = await db.select().from(membershipPlans)
      .where(eq(membershipPlans.organizationId, user.organizationId))
      .orderBy(desc(membershipPlans.isActive), membershipPlans.name)
    return { items: rows.map((plan) => ({
      id: plan.id,
      name: plan.name,
      durationDays: plan.durationDays,
      priceCents: plan.priceCents,
      visitLimit: plan.visitLimit,
      poolAccess: plan.poolAccess,
      gymAccess: plan.gymAccess,
      isActive: plan.isActive,
      updatedAt: plan.updatedAt,
    })) }
  })

  app.post('/api/membership-plans', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager'])
    const body = parseWith(membershipPlanSchema, request.body)
    const [existing] = await db.select({ id: membershipPlans.id }).from(membershipPlans)
      .where(and(eq(membershipPlans.organizationId, user.organizationId), eq(membershipPlans.name, body.name))).limit(1)
    if (existing) throw conflict('MEMBERSHIP_PLAN_NAME_EXISTS', 'Bu isimle bir paket zaten var.')
    const [plan] = await db.insert(membershipPlans).values({
      organizationId: user.organizationId,
      name: body.name,
      durationDays: body.durationDays,
      priceCents: body.priceCents,
      visitLimit: body.visitLimit ?? null,
      poolAccess: body.poolAccess,
      gymAccess: body.gymAccess,
      isActive: body.isActive ?? true,
    }).returning()
    await db.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership_plan.create', entityType: 'membership_plan', entityId: plan.id, summary: 'Yeni üyelik paketi oluşturuldu.', metadata: { durationDays: plan.durationDays, priceCents: plan.priceCents, isActive: plan.isActive } })
    return reply.code(201).send(plan)
  })

  app.patch('/api/membership-plans/:planId', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { planId } = parseWith(z.object({ planId: uuidSchema }), request.params)
    const body = parseWith(membershipPlanSchema, request.body)
    const [current] = await db.select().from(membershipPlans)
      .where(and(eq(membershipPlans.id, planId), eq(membershipPlans.organizationId, user.organizationId))).limit(1)
    if (!current) throw notFound('Üyelik paketi bulunamadı.')
    if (body.name !== current.name) {
      const [sameName] = await db.select({ id: membershipPlans.id }).from(membershipPlans)
        .where(and(eq(membershipPlans.organizationId, user.organizationId), eq(membershipPlans.name, body.name))).limit(1)
      if (sameName) throw conflict('MEMBERSHIP_PLAN_NAME_EXISTS', 'Bu isimle bir paket zaten var.')
    }
    const [plan] = await db.update(membershipPlans).set({
      name: body.name,
      durationDays: body.durationDays,
      priceCents: body.priceCents,
      visitLimit: body.visitLimit ?? null,
      poolAccess: body.poolAccess,
      gymAccess: body.gymAccess,
      isActive: body.isActive ?? current.isActive,
      updatedAt: new Date(),
    }).where(eq(membershipPlans.id, current.id)).returning()
    await db.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership_plan.update', entityType: 'membership_plan', entityId: plan.id, summary: 'Üyelik paketi ayarları güncellendi.', metadata: { durationDays: plan.durationDays, priceCents: plan.priceCents, isActive: plan.isActive } })
    return plan
  })

  app.get('/api/memberships', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const query = parseWith(z.object({
      query: z.string().max(120).optional(),
      status: z.enum(MEMBERSHIP_STATUSES).optional(),
      ending: z.enum(['7d', '30d']).optional(),
      sort: z.enum(['expires_asc', 'expires_desc', 'balance_desc', 'newest']).default('expires_asc'),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(30),
    }), request.query)
    const search = query.query?.trim()
    const endingCondition = query.ending === '7d'
      ? sql`and m.status='active' and m.ends_on >= current_date and m.ends_on <= current_date + interval '7 days'`
      : query.ending === '30d'
        ? sql`and m.status='active' and m.ends_on >= current_date and m.ends_on <= current_date + interval '30 days'`
        : sql``
    const offset = (query.page - 1) * query.pageSize
    const orderBy = query.sort === 'expires_desc'
      ? sql`case when m.status='active' then 0 when m.status='frozen' then 1 else 2 end,m.ends_on desc`
      : query.sort === 'balance_desc'
        ? sql`greatest(0,m.sale_amount_cents+coalesce(debts.debt_total,0)-coalesce(payments.paid_total,0)) desc,m.ends_on asc`
        : query.sort === 'newest'
          ? sql`m.created_at desc`
          : sql`case when m.status='active' then 0 when m.status='frozen' then 1 else 2 end,m.ends_on asc`
    const rows = await db.execute(sql`
      select m.id,m.status,m.starts_on,m.ends_on,m.sale_amount_cents,m.notes,
        p.id participant_id,concat(p.first_name,' ',p.last_name) participant_name,p.phone,p.email,
        mp.name plan_name,mp.duration_days,mp.pool_access,mp.gym_access,
        coalesce(payments.paid_total,0) paid_total,coalesce(debts.debt_total,0) debt_total,
        payments.last_paid_at
      from gym_memberships m
      join participants p on p.id=m.participant_id
      join membership_plans mp on mp.id=m.plan_id
      left join (
        select membership_id,sum(amount_cents) paid_total,max(paid_at) last_paid_at
        from membership_payments where status='recorded' group by membership_id
      ) payments on payments.membership_id=m.id
      left join (select membership_id,sum(amount_cents) debt_total from membership_debts where status='recorded' group by membership_id) debts on debts.membership_id=m.id
      where m.organization_id=${user.organizationId}
      ${query.status ? sql`and m.status=${query.status}` : sql``}
      ${endingCondition}
      ${search ? sql`and (concat(p.first_name,' ',p.last_name) ilike ${`%${search}%`} or p.phone ilike ${`%${search}%`} or p.email ilike ${`%${search}%`} or mp.name ilike ${`%${search}%`})` : sql``}
      order by ${orderBy}
      limit ${query.pageSize} offset ${offset}
    `)
    const count = await db.execute(sql`
      select count(*) total
      from gym_memberships m join participants p on p.id=m.participant_id join membership_plans mp on mp.id=m.plan_id
      where m.organization_id=${user.organizationId}
      ${query.status ? sql`and m.status=${query.status}` : sql``}
      ${endingCondition}
      ${search ? sql`and (concat(p.first_name,' ',p.last_name) ilike ${`%${search}%`} or p.phone ilike ${`%${search}%`} or p.email ilike ${`%${search}%`} or mp.name ilike ${`%${search}%`})` : sql``}
    `)
    const summary = await db.execute(sql`
      select
        count(*) filter (where status='active') active_count,
        count(*) filter (where status='frozen') frozen_count,
        count(*) filter (where status='expired') expired_count,
        count(*) filter (where status='active' and ends_on <= current_date + interval '7 days') expiring_soon_count,
        coalesce(sum(greatest(0,m.sale_amount_cents+coalesce(debts.debt_total,0)-coalesce(paid.paid_total,0))),0) outstanding
      from gym_memberships m
      left join (select membership_id,sum(amount_cents) paid_total from membership_payments where status='recorded' group by membership_id) paid on paid.membership_id=m.id
      left join (select membership_id,sum(amount_cents) debt_total from membership_debts where status='recorded' group by membership_id) debts on debts.membership_id=m.id
      where m.organization_id=${user.organizationId}
    `)
    const total = Number((count.rows[0] as any).total)
    const totals = summary.rows[0] as any
    return {
      items: rows.rows.map((item: any) => ({
        id: item.id,
        participantId: item.participant_id,
        participantName: item.participant_name,
        phone: item.phone,
        email: item.email,
        planName: item.plan_name,
        durationDays: Number(item.duration_days),
        poolAccess: Boolean(item.pool_access),
        gymAccess: Boolean(item.gym_access),
        status: item.status,
        startsOn: item.starts_on,
        endsOn: item.ends_on,
        saleAmountCents: Number(item.sale_amount_cents),
        debtTotalCents: Number(item.debt_total),
        paidTotalCents: Number(item.paid_total),
        balanceCents: membershipBalanceCents(Number(item.sale_amount_cents), Number(item.debt_total), Number(item.paid_total)),
        lastPaidAt: item.last_paid_at,
        notes: item.notes,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
      summary: {
        activeCount: Number(totals.active_count),
        frozenCount: Number(totals.frozen_count),
        expiredCount: Number(totals.expired_count),
        expiringSoonCount: Number(totals.expiring_soon_count),
        outstandingBalanceCents: Number(totals.outstanding),
      },
    }
  })

  app.get('/api/memberships/options', async (request) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const [planRows, participantRows] = await Promise.all([
      db.select().from(membershipPlans).where(and(eq(membershipPlans.organizationId, user.organizationId), eq(membershipPlans.isActive, true))),
      db.execute(sql`
        select id,concat(first_name,' ',last_name) full_name,phone,email,participant_type
        from participants
        where organization_id=${user.organizationId} and is_active=true
        order by first_name,last_name limit 100
      `),
    ])
    return {
      plans: planRows.map((plan) => ({ id: plan.id, name: plan.name, durationDays: plan.durationDays, priceCents: plan.priceCents, visitLimit: plan.visitLimit, poolAccess: plan.poolAccess, gymAccess: plan.gymAccess })),
      participants: participantRows.rows.map((person: any) => ({ id: person.id, fullName: person.full_name, phone: person.phone, email: person.email, participantType: person.participant_type })),
    }
  })

  app.post('/api/memberships', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const body = parseWith(createMembershipSchema, request.body)
    const result = await db.transaction(async (tx) => {
      let participantId = body.participantId
      if (body.participant) {
        const [created] = await tx.insert(participants).values({
          organizationId: user.organizationId,
          participantType: 'member',
          firstName: body.participant.firstName,
          lastName: body.participant.lastName,
          phone: body.participant.phone,
          email: body.participant.email?.toLowerCase() ?? null,
          birthDate: body.participant.birthDate,
          emergencyContactName: body.participant.emergencyContactName,
          emergencyContactPhone: body.participant.emergencyContactPhone,
          safetyNotes: body.participant.safetyNotes,
          createdBy: user.id,
        }).returning()
        participantId = created.id
        await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'participant.create', entityType: 'participant', entityId: created.id, summary: 'Yeni üye kaydı oluşturuldu.', metadata: { participantType: 'member', source: 'membership_form' } })
      }
      const [participant] = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, participantId!), eq(participants.organizationId, user.organizationId), eq(participants.isActive, true))).limit(1)
      if (!participant) throw notFound('Üye bulunamadı.')
      const [plan] = await tx.select().from(membershipPlans).where(and(eq(membershipPlans.id, body.planId), eq(membershipPlans.organizationId, user.organizationId), eq(membershipPlans.isActive, true))).limit(1)
      if (!plan) throw notFound('Üyelik paketi bulunamadı.')
      const [existing] = await tx.select({ id: gymMemberships.id }).from(gymMemberships).where(and(eq(gymMemberships.participantId, participant.id), eq(gymMemberships.organizationId, user.organizationId), eq(gymMemberships.status, 'active'))).limit(1)
      if (existing && body.status === 'active') throw conflict('ACTIVE_MEMBERSHIP_EXISTS', 'Bu kişi için aktif salon üyeliği zaten var.')
      const startsOn = body.startsOn ?? localDateInIstanbul()
      const endDate = new Date(`${startsOn}T00:00:00Z`)
      endDate.setUTCDate(endDate.getUTCDate() + plan.durationDays - 1)
      const endsOn = endDate.toISOString().slice(0, 10)
      const saleAmountCents = body.saleAmountCents ?? plan.priceCents
      if (body.initialPaymentCents > saleAmountCents) throw new AppError(409, 'MEMBERSHIP_OVERPAYMENT', 'İlk tahsilat üyelik tutarını aşamaz.')
      const [membership] = await tx.insert(gymMemberships).values({
        organizationId: user.organizationId,
        participantId: participant.id,
        planId: body.planId,
        status: body.status,
        startsOn,
        endsOn,
        saleAmountCents,
        notes: body.note,
        createdBy: user.id,
      }).returning()
      let payment = null
      if (body.initialPaymentCents > 0) {
        const paidAt = new Date()
        const receiptNumber = await nextReceiptNumber(tx, user.organizationId, paidAt)
        ;[payment] = await tx.insert(membershipPayments).values({
          organizationId: user.organizationId,
          membershipId: membership.id,
          amountCents: body.initialPaymentCents,
          method: body.paymentMethod,
          paidAt,
          receiptNumber,
          recordedBy: user.id,
          note: 'Üyelik açılış tahsilatı',
        }).returning()
      }
      await tx.update(participants).set({ participantType: 'member', updatedAt: new Date() }).where(eq(participants.id, participant.id))
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership.create', entityType: 'gym_membership', entityId: membership.id, summary: 'Salon üyeliği oluşturuldu.', metadata: { participantId: participant.id, planId: body.planId, status: body.status, saleAmountCents, initialPaymentCents: body.initialPaymentCents } })
      return { membership, payment }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/memberships/:membershipId/payments', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { membershipId } = parseWith(z.object({ membershipId: uuidSchema }), request.params)
    const body = parseWith(membershipPaymentSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select * from gym_memberships where id=${membershipId} and organization_id=${user.organizationId} for update`)
      const membership = locked.rows[0] as any
      if (!membership) throw notFound('Üyelik bulunamadı.')
      const [paidResult, debtResult] = await Promise.all([
        tx.execute(sql`select coalesce(sum(amount_cents),0) paid from membership_payments where membership_id=${membershipId} and status='recorded'`),
        tx.execute(sql`select coalesce(sum(amount_cents),0) debt from membership_debts where membership_id=${membershipId} and status='recorded'`),
      ])
      const paid = Number((paidResult.rows[0] as any).paid)
      const debt = Number((debtResult.rows[0] as any).debt)
      const balanceBefore = membershipBalanceCents(Number(membership.sale_amount_cents), debt, paid)
      if (balanceBefore <= 0) throw conflict('MEMBERSHIP_BALANCE_CLOSED', 'Bu üyeliğin açık bakiyesi bulunmuyor.')
      if (body.amountCents > balanceBefore) throw new AppError(409, 'MEMBERSHIP_OVERPAYMENT', 'Tahsilat kalan üyelik bakiyesini aşamaz.')
      const paidAt = body.paidAt ? new Date(body.paidAt) : new Date()
      const receiptNumber = await nextReceiptNumber(tx, user.organizationId, paidAt)
      const [payment] = await tx.insert(membershipPayments).values({ organizationId: user.organizationId, membershipId, amountCents: body.amountCents, method: body.method, paidAt, receiptNumber, reference: body.reference, note: body.note, recordedBy: user.id }).returning()
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership_payment.record', entityType: 'membership_payment', entityId: payment.id, summary: 'Üyelik tahsilatı kaydedildi.', metadata: { membershipId, amountCents: body.amountCents, method: body.method } })
      return { payment, balanceBefore, balanceAfter: membershipBalanceCents(Number(membership.sale_amount_cents), debt, paid + body.amountCents) }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/memberships/:membershipId/debts', async (request, reply) => {
    const user = requireRole(request, ['owner', 'manager', 'front_desk'])
    const { membershipId } = parseWith(z.object({ membershipId: uuidSchema }), request.params)
    const body = parseWith(membershipDebtSchema, request.body)
    const result = await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select * from gym_memberships where id=${membershipId} and organization_id=${user.organizationId} for update`)
      const membership = locked.rows[0] as any
      if (!membership) throw notFound('Üyelik bulunamadı.')
      if (!['active', 'frozen'].includes(membership.status)) throw conflict('MEMBERSHIP_NOT_DEBITABLE', 'İptal edilmiş veya süresi dolmuş üyeliğe ek ücret eklenemez.')
      const [debt] = await tx.insert(membershipDebts).values({ organizationId: user.organizationId, membershipId, amountCents: body.amountCents, reason: body.reason, dueOn: body.dueOn ?? null, createdBy: user.id }).returning()
      const [paidResult, debtResult] = await Promise.all([
        tx.execute(sql`select coalesce(sum(amount_cents),0) paid from membership_payments where membership_id=${membershipId} and status='recorded'`),
        tx.execute(sql`select coalesce(sum(amount_cents),0) debt from membership_debts where membership_id=${membershipId} and status='recorded'`),
      ])
      const balanceAfter = membershipBalanceCents(Number(membership.sale_amount_cents), Number((debtResult.rows[0] as any).debt), Number((paidResult.rows[0] as any).paid))
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership_debt.create', entityType: 'membership_debt', entityId: debt.id, summary: 'Üyelik için ek ücret kaydedildi.', metadata: { membershipId, amountCents: body.amountCents, hasDueDate: Boolean(body.dueOn) } })
      return { debt, balanceAfter }
    })
    return reply.code(201).send(result)
  })

  app.post('/api/membership-payments/:paymentId/void', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { paymentId } = parseWith(z.object({ paymentId: uuidSchema }), request.params)
    const { reason } = parseWith(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), request.body)
    return db.transaction(async (tx) => {
      const [payment] = await tx.update(membershipPayments).set({ status: 'voided', voidedAt: new Date(), voidedBy: user.id, voidReason: reason, updatedAt: new Date() })
        .where(and(eq(membershipPayments.id, paymentId), eq(membershipPayments.organizationId, user.organizationId), eq(membershipPayments.status, 'recorded'))).returning()
      if (!payment) {
        const [exists] = await tx.select({ id: membershipPayments.id }).from(membershipPayments).where(and(eq(membershipPayments.id, paymentId), eq(membershipPayments.organizationId, user.organizationId))).limit(1)
        if (!exists) throw notFound('Üyelik tahsilatı bulunamadı.')
        throw conflict('MEMBERSHIP_PAYMENT_ALREADY_VOIDED', 'Üyelik tahsilatı daha önce geçersiz kılınmış.')
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership_payment.void', entityType: 'membership_payment', entityId: payment.id, summary: 'Üyelik tahsilatı geçersiz kılındı.', metadata: { membershipId: payment.membershipId, reasonCategory: 'staff_provided', receiptNumber: payment.receiptNumber } })
      return { payment }
    })
  })

  app.post('/api/membership-charges/:chargeId/void', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { chargeId } = parseWith(z.object({ chargeId: uuidSchema }), request.params)
    const { reason } = parseWith(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), request.body)
    return db.transaction(async (tx) => {
      const [charge] = await tx.update(membershipDebts).set({ status: 'voided', voidedAt: new Date(), voidedBy: user.id, voidReason: reason, updatedAt: new Date() })
        .where(and(eq(membershipDebts.id, chargeId), eq(membershipDebts.organizationId, user.organizationId), eq(membershipDebts.status, 'recorded'))).returning()
      if (!charge) {
        const [exists] = await tx.select({ id: membershipDebts.id }).from(membershipDebts).where(and(eq(membershipDebts.id, chargeId), eq(membershipDebts.organizationId, user.organizationId))).limit(1)
        if (!exists) throw notFound('Ek ücret bulunamadı.')
        throw conflict('MEMBERSHIP_CHARGE_ALREADY_VOIDED', 'Ek ücret daha önce geçersiz kılınmış.')
      }
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership_charge.void', entityType: 'membership_debt', entityId: charge.id, summary: 'Üyelik ek ücreti geçersiz kılındı.', metadata: { membershipId: charge.membershipId, reasonCategory: 'staff_provided' } })
      return { charge }
    })
  })

  app.post('/api/memberships/:membershipId/cancel', async (request) => {
    const user = requireRole(request, ['owner', 'manager'])
    const { membershipId } = parseWith(z.object({ membershipId: uuidSchema }), request.params)
    const { reason } = parseWith(z.object({ reason: z.string().trim().min(3).max(500) }).strict(), request.body)
    return db.transaction(async (tx) => {
      const locked = await tx.execute(sql`select id,status from gym_memberships where id=${membershipId} and organization_id=${user.organizationId} for update`)
      const membership = locked.rows[0] as any
      if (!membership) throw notFound('Üyelik bulunamadı.')
      if (membership.status === 'cancelled') throw conflict('MEMBERSHIP_ALREADY_CANCELLED', 'Üyelik daha önce iptal edilmiş.')
      const [updated] = await tx.update(gymMemberships).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() }).where(eq(gymMemberships.id, membershipId)).returning()
      await tx.insert(auditEvents).values({ organizationId: user.organizationId, actorUserId: user.id, action: 'membership.cancel', entityType: 'gym_membership', entityId: membershipId, summary: 'Üyelik iptal edildi; tahsilat geçmişi ve açık bakiye korundu.', metadata: { from: membership.status, reasonCategory: 'staff_provided', reasonLength: reason.length } })
      return { membership: updated }
    })
  })
}
