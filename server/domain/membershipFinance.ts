export function membershipReceivableCents(saleAmountCents: number, additionalChargeCents = 0) {
  return saleAmountCents + additionalChargeCents
}

export function membershipBalanceCents(saleAmountCents: number, additionalChargeCents: number, paidAmountCents: number) {
  return Math.max(0, membershipReceivableCents(saleAmountCents, additionalChargeCents) - paidAmountCents)
}
