export function assertCents(value: number, allowZero = false) {
  if (!Number.isInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new AppError(400, 'INVALID_MONEY_AMOUNT', 'Tutar kurus cinsinden gecerli bir tam sayi olmalidir.')
  }
  return value
}

import { AppError } from './errors.js'

