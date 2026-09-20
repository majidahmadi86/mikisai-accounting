"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/Field";
import { useT } from "@/lib/i18n/client";
import { NO_ORDER_REF_MIN } from "@/lib/ledger/order-ref";

export type OrderRefValue = { orderRef: string; none: boolean; reason: string };

/** True when the value may be saved: an order ID, or "No order ID" with a reason. */
export function orderRefReady(v: OrderRefValue): boolean {
  return v.none ? v.reason.trim().length >= NO_ORDER_REF_MIN : v.orderRef.trim().length > 0;
}

/**
 * The order ID of a sale. It is required, because it is what keeps a later
 * import from adding the same order again. "No order ID" is an explicit
 * choice that asks for a reason. Works controlled (value and onChange, in the
 * quick sheets) or on its own inside a form, where it posts order_ref and
 * no_order_ref_reason.
 */
export function OrderRefField({ id, value, onChange, initial, hint, showError = false }: { id: string; value?: OrderRefValue; onChange?: (v: OrderRefValue) => void; initial?: Partial<OrderRefValue>; hint?: string; showError?: boolean }) {
  const t = useT();
  const [own, setOwn] = useState<OrderRefValue>({ orderRef: initial?.orderRef ?? "", none: initial?.none ?? false, reason: initial?.reason ?? "" });
  const v = value ?? own;
  const set = (patch: Partial<OrderRefValue>) => {
    const next = { ...v, ...patch };
    if (!value) setOwn(next);
    onChange?.(next);
  };
  const missing = showError && !orderRefReady(v);

  return (
    <div>
      {v.none ? null : (
        <Field label={t("transactions.orderRef")} htmlFor={id} hint={hint ?? t("orderRef.requiredHint")}>
          <Input id={id} name="order_ref" inputMode="numeric" autoComplete="off" value={v.orderRef} onChange={(e) => set({ orderRef: e.target.value })} placeholder="5860…" className="font-mono" aria-invalid={missing || undefined} />
        </Field>
      )}
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-3 text-sm text-plum">
        <input type="checkbox" checked={v.none} onChange={(e) => set({ none: e.target.checked, orderRef: e.target.checked ? "" : v.orderRef })} className="h-5 w-5 shrink-0 accent-[#8f315f]" />
        {t("orderRef.none")}
      </label>
      {v.none ? (
        <div className="mt-2">
          <Field label={t("orderRef.reason")} htmlFor={`${id}-reason`} hint={t("orderRef.reasonHint")}>
            <Input id={`${id}-reason`} name="no_order_ref_reason" value={v.reason} onChange={(e) => set({ reason: e.target.value })} maxLength={300} placeholder={t("orderRef.reasonPlaceholder")} aria-invalid={missing || undefined} />
          </Field>
        </div>
      ) : null}
      {missing ? (
        <p role="alert" className="mt-2 text-sm text-berry">
          {v.none ? t("orderRef.reasonRequired") : t("orderRef.required")}
        </p>
      ) : null}
    </div>
  );
}
