import "server-only";

import type { PoolClient } from "pg";

import { formatInvoiceNumber } from "@/features/physical-wall/gst";

/**
 * Next invoice number for financial year `fy` (BE-2.05). MUST run inside the
 * transaction that inserts the invoice: the upsert row-locks the year's
 * counter (serialising concurrent issuers) and rolls back with it, so a failed
 * invoice never burns a number. Sequential and gap-free — see 0028.
 */
export async function allocateInvoiceNumber(client: PoolClient, fy: string): Promise<string> {
  const { rows } = await client.query<{ last_number: number }>(
    `insert into pw_invoice_counters (fiscal_year, last_number) values ($1, 1)
     on conflict (fiscal_year) do update set last_number = pw_invoice_counters.last_number + 1
     returning last_number`,
    [fy]
  );
  return formatInvoiceNumber(fy, rows[0].last_number);
}
