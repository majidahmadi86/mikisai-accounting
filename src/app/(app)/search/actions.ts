"use server";

import { requireSession } from "@/lib/auth";
import { getLedgerSnapshot } from "@/lib/data/ledger";
import { getLocale } from "@/lib/i18n/server";
import { amountOf, groupSearch, type SearchHit, type SearchRow } from "@/lib/search";
import { num } from "@/lib/types";

/** Feeds the search overlay: ledger rows by order ID, customer, amount or note, and products by name. Read-only. */
export async function searchAll(query: string): Promise<SearchHit[]> {
  const q = String(query ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];
  const [session, locale] = await Promise.all([requireSession(), getLocale()]);
  const safe = q.replace(/[%,()]/g, " ").trim();
  if (!safe) return [];
  const clauses = [`order_ref.ilike.%${safe}%`, `customer_name.ilike.%${safe}%`, `note.ilike.%${safe}%`];
  const amount = amountOf(q);
  if (amount !== null) clauses.push(`net_amount.eq.${amount}`, `gross_amount.eq.${amount}`);
  const [{ data }, snapshot] = await Promise.all([
    session.supabase.from("transactions").select("id, date, type, order_ref, customer_name, note, net_amount, gross_amount").is("deleted_at", null).or(clauses.join(",")).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    getLedgerSnapshot(session.profile.business_id),
  ]);
  const rows: SearchRow[] = (data ?? []).map((r) => ({ id: r.id as string, date: r.date as string, type: r.type as SearchRow["type"], order_ref: r.order_ref as string | null, customer_name: r.customer_name as string | null, note: r.note as string | null, net_amount: num(r.net_amount), gross_amount: num(r.gross_amount) }));
  return groupSearch(q, rows, snapshot.products, locale);
}
