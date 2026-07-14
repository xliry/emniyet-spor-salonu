import { z } from 'zod'
import { AppError } from '../shared/errors.js'

export const uuidSchema = z.string().uuid()

export function parseWith<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of parsed.error.issues) {
    const key = issue.path.join('.') || 'request'
    fieldErrors[key] ??= []
    fieldErrors[key].push(issue.message)
  }
  throw new AppError(400, 'VALIDATION_ERROR', 'Gonderilen bilgiler gecersiz.', fieldErrors)
}

export function localDateInIstanbul(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value)
}

export function sessionDates(startsOn: string, endsOn: string, dayOfWeek: number, startsAt: string, endsAt: string) {
  const results: Array<{ startsAt: Date; endsAt: Date }> = []
  const cursor = new Date(`${startsOn}T00:00:00Z`)
  const end = new Date(`${endsOn}T00:00:00Z`)
  while (cursor <= end) {
    const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay()
    if (isoDay === dayOfWeek) {
      const day = cursor.toISOString().slice(0, 10)
      results.push({
        startsAt: new Date(`${day}T${startsAt.slice(0, 5)}:00+03:00`),
        endsAt: new Date(`${day}T${endsAt.slice(0, 5)}:00+03:00`),
      })
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return results
}

export function ageOnDate(birthDate: string, today = localDateInIstanbul()) {
  const [year, month, day] = today.split('-').map(Number)
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  let age = year - birthYear
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1
  return age
}

