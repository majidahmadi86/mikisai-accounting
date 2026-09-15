import { round2 } from "@/lib/money";
import type { Platform, PlatformSetting } from "@/lib/types";

/** net = gross × (1 − commission%) − fixed fee, never below zero. */
export function estimateNet(gross: number, platform: Platform, settings: Pick<PlatformSetting, "platform" | "commission_pct" | "fixed_fee">[]): number {
  const s = settings.find((x) => x.platform === platform);
  if (!s) return round2(gross);
  const net = gross * (1 - s.commission_pct / 100) - s.fixed_fee;
  return round2(Math.max(0, net));
}
