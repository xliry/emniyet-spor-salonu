import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { hashPassword } from '../server/auth/password.js'
import { db, pool } from '../server/db/client.js'
import { auditEvents, branches, organizationSettings, organizations, staffUsers } from '../server/db/schema.js'

const input = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.string().email(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(12),
  BOOTSTRAP_ADMIN_NAME: z.string().min(2).default('Sistem Yoneticisi'),
}).parse(process.env)

try {
  const email = input.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()
  const passwordHash = await hashPassword(input.BOOTSTRAP_ADMIN_PASSWORD)
  await db.transaction(async (tx) => {
    const [organization] = await tx.insert(organizations).values({ name: 'Emniyet Spor Salonu', slug: 'emniyet-spor-salonu', timezone: 'Europe/Istanbul' })
      .onConflictDoUpdate({ target: organizations.slug, set: { name: 'Emniyet Spor Salonu', updatedAt: new Date() } }).returning()
    await tx.insert(organizationSettings).values({ organizationId: organization.id, childAgeThreshold: 18 }).onConflictDoNothing()
    const [branch] = await tx.insert(branches).values({ organizationId: organization.id, name: 'Emniyet Spor Salonu', code: 'MERKEZ' })
      .onConflictDoUpdate({ target: [branches.organizationId, branches.code], set: { name: 'Emniyet Spor Salonu', isActive: true, updatedAt: new Date() } }).returning()
    const [existing] = await tx.select().from(staffUsers).where(eq(staffUsers.email, email)).limit(1)
    if (existing && existing.organizationId !== organization.id) throw new Error('Bootstrap email belongs to another organization')
    const [admin] = existing
      ? await tx.update(staffUsers).set({ fullName: input.BOOTSTRAP_ADMIN_NAME, passwordHash, role: 'owner', isActive: true, updatedAt: new Date() }).where(eq(staffUsers.id, existing.id)).returning()
      : await tx.insert(staffUsers).values({ organizationId: organization.id, branchId: branch.id, fullName: input.BOOTSTRAP_ADMIN_NAME, email, passwordHash, role: 'owner' }).returning()
    await tx.insert(auditEvents).values({ organizationId: organization.id, actorUserId: admin.id, action: existing ? 'staff.bootstrap_rotate' : 'staff.bootstrap_create', entityType: 'staff_user', entityId: admin.id, summary: existing ? 'Bootstrap yonetici kimligi yenilendi.' : 'Ilk yonetici hesabi olusturuldu.', metadata: {} })
  })
  process.stdout.write('Bootstrap administrator is ready. Remove bootstrap secrets from the environment.\n')
} finally {
  await pool.end()
}

