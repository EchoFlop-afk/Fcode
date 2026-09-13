import type { PromotionStatus } from "../types";
import { formatTokens } from "../util/misc";

export interface QuotaView {
  name: string;
  description: string;
  provider: string;
  used: number;
  remaining: number;
  total: number;
  percent: number;
  endsAt: string | null;
  expiresLabel: string;
  state: "active" | "expired" | "upcoming" | "exhausted";
}

export function promotionStatusView(p: PromotionStatus): QuotaView {
  const total = p.promotion.tokenBudget;
  const percent = total > 0 ? Math.min(100, Math.round((p.used / total) * 100)) : 0;
  const ends = Date.parse(p.promotion.endsAt);
  const expiresLabel = Number.isFinite(ends)
    ? new Date(ends).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  let state: QuotaView["state"] = "active";
  if (p.expired) state = "expired";
  else if (p.notStarted) state = "upcoming";
  else if (p.remaining <= 0) state = "exhausted";
  return {
    name: p.promotion.name,
    description: p.promotion.description,
    provider: p.promotion.provider,
    used: p.used,
    remaining: p.remaining,
    total,
    percent,
    endsAt: p.promotion.endsAt,
    expiresLabel,
    state,
  };
}

export function formatQuotaLine(q: QuotaView): string {
  return `${formatTokens(q.used)} / ${formatTokens(q.total)} tokens`;
}
