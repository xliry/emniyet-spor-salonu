import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.string().url().optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  SESSION_COOKIE_NAME: z.string().min(1).default('emniyet_session'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(168).default(12),
  REMEMBER_ME_TTL_DAYS: z.coerce.number().int().positive().max(90).default(30),
  LOG_LEVEL: z.string().default('info'),
})

const parsed = schema.superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && !value.APP_ORIGIN) {
    context.addIssue({ code: 'custom', path: ['APP_ORIGIN'], message: 'APP_ORIGIN is required in production' })
  }
  if (value.NODE_ENV === 'production' && value.TRUST_PROXY !== 'true') {
    context.addIssue({ code: 'custom', path: ['TRUST_PROXY'], message: 'TRUST_PROXY=true is required in production' })
  }
}).parse(process.env)

export const config = {
  ...parsed,
  trustProxy: parsed.TRUST_PROXY === 'true',
  isProduction: parsed.NODE_ENV === 'production',
}
