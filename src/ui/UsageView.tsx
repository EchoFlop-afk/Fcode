import { useEffect, useState } from "react";
import { api } from "../core/api/ipc";
import { useSettings } from "../state/settings";
import { promotionStatusView, formatQuotaLine } from "../core/credits/quotas";
import { formatTokens } from "../core/util/misc";
import type { UsageSnapshot } from "../core/types";
import { IconRefresh, IconTrash } from "./icons";

export function UsageView() {
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [promotions, setPromotions] = useState<ReturnType<typeof promotionStatusView>[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { refreshAllModels } = useSettings();
  const catalogRefreshedAt = useSettings((s) => s.settings.models.catalogRefreshedAt);
  const catalogRefreshedLabel = catalogRefreshedAt
    ? new Date(catalogRefreshedAt).toLocaleString()
    : "never (seed data only)";

  const load = async () => {
    setRefreshing(true);
    const [usage, promos] = await Promise.all([
      api.usageGet().catch(() => null),
      api.promotionsList().catch(() => []),
    ]);
    setSnapshot(usage);
    setPromotions(promos.map(promotionStatusView));
    setRefreshing(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="usage">
      <div className="usage-head">
        <h2>Usage</h2>
        <div className="hub-actions">
          <button className="btn small" onClick={() => void load()}>
            <IconRefresh size={12} className={refreshing ? "spin" : ""} /> Refresh
          </button>
          <button
            className="btn small ghost"
            onClick={async () => {
              await api.usageReset().catch(() => {});
              void load();
            }}
            title="Clear locally recorded usage"
          >
            <IconTrash size={12} /> Reset
          </button>
        </div>
      </div>
      <p className="usage-note">
        Usage is recorded locally by Fcode from provider-reported token counts
        (estimated when the provider does not report). Provider-side dashboards remain the
        authoritative source for billing.
      </p>

      {snapshot && (
        <div className="usage-grid">
          <UsageBlock title="Today" summary={snapshot.today} />
          <UsageBlock title="This month" summary={snapshot.month} />
        </div>
      )}

      <h3>Free & promotional quotas</h3>
      {promotions.length === 0 ? (
        <p className="dim">No promotions configured.</p>
      ) : (
        <div className="promo-list">
          {promotions.map((q) => (
            <div key={q.name} className={`promo-card state-${q.state}`}>
              <div className="promo-head">
                <span className="promo-name">{q.name}</span>
                <span className={`tag state-${q.state}`}>{q.state}</span>
              </div>
              <div className="promo-provider dim">{q.provider}</div>
              <div className="promo-bar">
                <div className="promo-bar-fill" style={{ width: `${q.percent}%` }} />
              </div>
              <div className="promo-meta">
                <span>{formatQuotaLine(q)}</span>
                <span>expires {q.expiresLabel}</span>
              </div>
              {q.description && <div className="promo-desc dim">{q.description}</div>}
            </div>
          ))}
        </div>
      )}

      <h3>Model catalog cache</h3>
      <p className="dim">
        Catalog refreshed {catalogRefreshedLabel}.
        {" "}
        <button className="link" onClick={() => void refreshAllModels()}>Refresh now</button>
      </p>
    </div>
  );
}

function UsageBlock({ title, summary }: { title: string; summary: UsageSnapshot["today"] }) {
  return (
    <div className="usage-block">
      <div className="usage-block-title">{title}</div>
      <div className="usage-nums">
        <div><span className="num">{summary.requests}</span><span className="label">requests</span></div>
        <div><span className="num">{formatTokens(summary.inputTokens)}</span><span className="label">tokens in</span></div>
        <div><span className="num">{formatTokens(summary.outputTokens)}</span><span className="label">tokens out</span></div>
      </div>
      {summary.byProvider.length === 0 ? (
        <p className="dim">No requests recorded yet.</p>
      ) : (
        <table className="usage-table">
          <thead>
            <tr><th>Provider / model</th><th>Requests</th><th>In</th><th>Out</th></tr>
          </thead>
          <tbody>
            {summary.byProvider.flatMap((p) =>
              p.models.map((m, i) => (
                <tr key={`${p.provider}/${m.model}`}>
                  <td>{i === 0 ? `${p.provider} · ` : ""}{m.model}</td>
                  <td>{m.requests}</td>
                  <td>{formatTokens(m.inputTokens)}</td>
                  <td>{formatTokens(m.outputTokens)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
