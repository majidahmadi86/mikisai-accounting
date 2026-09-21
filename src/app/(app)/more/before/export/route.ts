import { requireSession } from "@/lib/auth";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Before MikiSai as CSV: every statement row from before the business began, so the file TikTok sent still reconciles outside the app. */
export async function GET() {
  const { supabase, profile } = await requireSession();
  const { data } = await supabase.from("order_statements").select("order_ref, kind, created_date, settled_date, revenue, settlement_amount, fee_commission, fee_commerce_growth, fee_transaction, fee_seller_shipping, boxes").eq("business_id", profile.business_id).eq("pre_business", true).order("settled_date");
  const header = ["Order ID", "Kind", "Order created", "Paid by TikTok", "Customer paid", "TikTok paid", "Commission", "Commerce growth fee", "Transaction fee", "Seller shipping fee", "Boxes"];
  const lines = (data ?? []).map((r) => [r.order_ref, r.kind, r.created_date, r.settled_date, r.revenue, r.settlement_amount, r.fee_commission, r.fee_commerce_growth, r.fee_transaction, r.fee_seller_shipping, r.boxes].map(cell).join(","));
  const body = `﻿${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`;
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="before-mikisai.csv"', "cache-control": "no-store" } });
}
