import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './client.js'

try {
  await migrate(db, { migrationsFolder: 'drizzle' })
  process.stdout.write('Database migrations applied.\n')
} finally {
  await pool.end()
}

