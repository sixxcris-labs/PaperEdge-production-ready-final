import Link from "next/link";
import { fmtUSD } from "@paperedge/core/fmt";
import { groupSettlementSuggestions } from "@paperedge/core/scores";
import { db } from "@paperedge/database";
import { getLocalUser } from "@/lib/opportunity-service";
import { confirmSettlementSuggestion, rejectSettlementSuggestion } from "./actions";

export const dynamic = "force-dynamic";

type Suggestion = Awaited<ReturnType<typeof loadSuggestions>>[number];

export default async function SettlementSuggestionsPage() {
  const suggestions = await loadSuggestions();
  const grouped = groupSettlementSuggestions(suggestions);
  const totalPending = suggestions.filter((suggestion) => suggestion.status === "pending").length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Auto-settlement</p>
          <h1>Settlement Suggestions</h1>
          <p>Review score-derived suggestions before any paper result is written.</p>
        </div>
        <div className="actions">
          <Link className="btn ghost" href="/verify">Verification Queue</Link>
          <Link className="btn primary" href="/locked">Locked Trades</Link>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <Kpi label="Pending" value={String(totalPending)} />
        <Kpi label="High confidence" value={String(grouped.highConfidence.length)} tone="profit" />
        <Kpi label="Needs review" value={String(grouped.needsReview.length)} tone="warn" />
        <Kpi label="Manual only" value={String(grouped.manual.length)} tone="loss" />
      </div>

      <div className="stack">
        <SuggestionSection
          title="High Confidence"
          badgeClass="b-profit"
          description="Parser confidence is at or above the green threshold. Confirm only after checking the audit note."
          suggestions={grouped.highConfidence}
        />
        <SuggestionSection
          title="Needs Review"
          badgeClass="b-warn"
          description="The parser found enough data to suggest an outcome, but a warning or ambiguity lowered confidence."
          suggestions={grouped.needsReview}
        />
        <SuggestionSection
          title="Manual Settlement Required"
          badgeClass="b-loss"
          description="No reliable score or parser result is available. Rejecting keeps the trade marked for manual settlement."
          suggestions={grouped.manual}
          manualOnly
        />
      </div>
    </div>
  );
}

async function loadSuggestions() {
  const user = await getLocalUser();

  return db.settlementSuggestion.findMany({
    where: {
      paperTrade: { userId: user.id },
      status: "pending",
    },
    include: {
      paperTrade: {
        include: {
          legs: {
            include: { book: true },
            orderBy: { legLabel: "asc" },
          },
        },
      },
    },
    orderBy: [
      { tier: "asc" },
      { confidence: "desc" },
      { fetchedAt: "desc" },
    ],
  });
}

function SuggestionSection({
  title,
  badgeClass,
  description,
  suggestions,
  manualOnly = false,
}: {
  title: string;
  badgeClass: string;
  description: string;
  suggestions: Suggestion[];
  manualOnly?: boolean;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h3>{title}</h3>
        <span className={`badge ${badgeClass}`}><span className="dot" />{suggestions.length}</span>
      </div>
      <div className="card-pad stack">
        <p className="hint" style={{ margin: 0 }}>{description}</p>
        {suggestions.length === 0 ? (
          <div className="hint" style={{ padding: "18px 0" }}>No pending suggestions in this lane.</div>
        ) : (
          suggestions.map((suggestion) => (
            <SuggestionCard key={suggestion.id} suggestion={suggestion} manualOnly={manualOnly} />
          ))
        )}
      </div>
    </section>
  );
}

function SuggestionCard({ suggestion, manualOnly }: { suggestion: Suggestion; manualOnly: boolean }) {
  const trade = suggestion.paperTrade;
  const legA = trade.legs.find((leg) => leg.legLabel === "A");
  const legB = trade.legs.find((leg) => leg.legLabel === "B");
  const canConfirm = !manualOnly && suggestion.suggestedWinningSide != null && suggestion.suggestedProfitLoss != null;
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";

  return (
    <div className="card" style={{ background: "var(--panel-2)" }}>
      <div className="card-pad stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="row tight">
              <span className="chip">{trade.sport || "unknown"}</span>
              <span className="chip">{trade.marketType || "market"}</span>
              <span className="muted num">{trade.customTradeId ?? trade.id.slice(0, 8)}</span>
            </div>
            <h3 style={{ margin: "10px 0 2px", fontSize: 15 }}>{trade.eventName}</h3>
            <p className="hint" style={{ margin: 0 }}>
              {trade.player ? `${trade.player} · ` : ""}{trade.tradeDate.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
          <div className="row tight">
            <span className="badge b-neutral"><span className="dot" />Tier {suggestion.tier}</span>
            <span className="badge b-info"><span className="dot" />{Math.round(suggestion.confidence * 100)}%</span>
          </div>
        </div>

        <div className="grid cols-2">
          <LegBox label="Leg A" book={legA?.book.name} side={legA?.side} stake={legA?.stake} />
          <LegBox label="Leg B" book={legB?.book.name} side={legB?.side} stake={legB?.stake} />
        </div>

        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <span className="hint">
              {suggestion.providerName ?? "No provider"} · fetched {suggestion.fetchedAt.toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <b>{suggestion.suggestedWinningSide ? `Suggested winner: ${suggestion.suggestedWinningSide}` : "No winner suggested"}</b>
            <span>{suggestion.reason}</span>
          </div>
          <div className="num" style={{ color: (suggestion.suggestedProfitLoss ?? 0) >= 0 ? "var(--profit)" : "var(--loss)", fontWeight: 700 }}>
            {suggestion.suggestedProfitLoss == null ? "P/L unknown" : fmtUSD(suggestion.suggestedProfitLoss, { sign: true })}
          </div>
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <form action={rejectSettlementSuggestion}>
            <input type="hidden" name="suggestionId" value={suggestion.id} />
            <button className="btn ghost" type="submit">Reject</button>
          </form>
          {canConfirm ? (
            <form action={confirmSettlementSuggestion}>
              <input type="hidden" name="suggestionId" value={suggestion.id} />
              <button className="btn success" type="submit">Confirm</button>
            </form>
          ) : (
            <a className="btn warn" href={`${dashboardUrl}/settlement`}>Settle manually</a>
          )}
        </div>
      </div>
    </div>
  );
}

function LegBox({ label, book, side, stake }: { label: string; book?: string; side?: string; stake?: number }) {
  return (
    <div className="card" style={{ background: "var(--card)" }}>
      <div className="card-pad">
        <div className="hint">{label} · {book ?? "Book unavailable"}</div>
        <div style={{ fontWeight: 600, marginTop: 4 }}>{side ?? "No side recorded"}</div>
        <div className="num muted" style={{ marginTop: 4 }}>{stake == null ? "Stake unknown" : `${fmtUSD(stake)} stake`}</div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "profit" | "warn" | "loss" }) {
  const color = tone === "profit" ? "var(--profit)" : tone === "warn" ? "var(--warn)" : tone === "loss" ? "var(--loss)" : "var(--fg)";
  return (
    <div className="card">
      <div className="card-pad">
        <div className="kpi">
          <span>{label}</span>
          <b style={{ color }}>{value}</b>
        </div>
      </div>
    </div>
  );
}
