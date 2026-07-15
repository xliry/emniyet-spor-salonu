import { sql, type SQL } from 'drizzle-orm'

interface SqlExecutor {
  execute(query: SQL): Promise<{ rows: unknown[] }>
}

export async function nextReceiptNumber(tx: SqlExecutor, organizationId: string, occurredAt = new Date()) {
  const result = await tx.execute(sql`
    insert into finance_counters (organization_id,next_receipt_number,updated_at)
    values (${organizationId},2,now())
    on conflict (organization_id) do update
    set next_receipt_number=finance_counters.next_receipt_number+1,updated_at=now()
    returning next_receipt_number-1 receipt_sequence
  `)
  const sequence = Number((result.rows[0] as { receipt_sequence: number }).receipt_sequence)
  return formatReceiptNumber(sequence, occurredAt)
}

export function formatReceiptNumber(sequence: number, occurredAt = new Date()) {
  const year = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Istanbul', year: 'numeric' }).format(occurredAt)
  return `ESS-${year}-${String(sequence).padStart(6, '0')}`
}
