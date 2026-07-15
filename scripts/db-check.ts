import { sql } from 'drizzle-orm'
import { db, pool } from '../server/db/client.js'

const expectedTables = [
  'organizations', 'organization_settings', 'branches', 'staff_users', 'auth_sessions', 'instructors', 'participants', 'guardians',
  'participant_guardians', 'pools', 'pool_lanes', 'course_terms', 'courses', 'course_schedule_rules', 'course_sessions', 'enrollments',
  'attendance_records', 'payment_records', 'membership_debts', 'pool_check_definitions', 'pool_check_runs', 'pool_check_values', 'audit_events',
]

try {
  const [tables, extensions, exclusion, forbidden] = await Promise.all([
    db.execute(sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`),
    db.execute(sql`select extname from pg_extension where extname in ('pgcrypto','citext','btree_gist')`),
    db.execute(sql`select conname from pg_constraint where conname='course_sessions_lane_no_overlap' and contype='x'`),
    db.execute(sql`select table_name,column_name from information_schema.columns where table_schema='public' and (table_name ilike '%qr%' or column_name ilike '%qr%' or table_name ilike '%supabase%' or column_name ilike '%supabase%')`),
  ])
  const actualTables = new Set(tables.rows.map((row: any) => row.table_name))
  const missing = expectedTables.filter((table) => !actualTables.has(table))
  const actualExtensions = new Set(extensions.rows.map((row: any) => row.extname))
  const missingExtensions = ['pgcrypto', 'citext', 'btree_gist'].filter((extension) => !actualExtensions.has(extension))
  if (missing.length || missingExtensions.length || exclusion.rows.length !== 1 || forbidden.rows.length) {
    throw new Error(JSON.stringify({ missingTables: missing, missingExtensions, exclusionConstraint: exclusion.rows.length === 1, forbiddenColumns: forbidden.rows }))
  }
  process.stdout.write(`Database check passed: ${expectedTables.length} tables, required extensions and lane exclusion constraint present.\n`)
} finally {
  await pool.end()
}
