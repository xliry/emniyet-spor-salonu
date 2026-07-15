import assert from 'node:assert/strict'
import test from 'node:test'
import { membershipBalanceCents, membershipReceivableCents } from './membershipFinance.js'

test('900 TL paket ve 450 TL tahsilat 450 TL kalan bakiye oluşturur', () => {
  assert.equal(membershipReceivableCents(90_000), 90_000)
  assert.equal(membershipBalanceCents(90_000, 0, 45_000), 45_000)
})

test('ek ücret paket bedeline ayrıca eklenir', () => {
  assert.equal(membershipReceivableCents(90_000, 10_000), 100_000)
  assert.equal(membershipBalanceCents(90_000, 10_000, 45_000), 55_000)
})

test('kapalı hesap negatif bakiye göstermez', () => {
  assert.equal(membershipBalanceCents(90_000, 0, 90_000), 0)
})
