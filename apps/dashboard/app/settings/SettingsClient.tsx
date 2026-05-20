"use client";

import { useState } from "react";
import { toast } from "sonner";
import { saveSettings } from "./actions";
import { fmtUSD } from "@paperedge/core/fmt";

interface Props {
  settings: {
    startingBankroll: number;
    currentBankroll: number;
    maxStakePct: number;
    oddsFreshnessMinutes: number;
    defaultUnitPct: number;
    warnLowHoldPctAbove: number;
  };
}

export function SettingsClient({ settings }: Props) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await saveSettings(new FormData(e.currentTarget));
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save settings");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="stack" style={{ maxWidth: 640 }}>
        {/* Bankroll */}
        <div className="card">
          <div className="card-head"><h3>Bankroll</h3><span className="sub">your simulated paper trading funds</span></div>
          <div className="card-pad grid cols-2" style={{ gap: 14 }}>
            <div className="field">
              <label className="label">Starting bankroll ($)</label>
              <input
                className="input num"
                type="number"
                step="0.01"
                name="startingBankroll"
                defaultValue={settings.startingBankroll}
                required
              />
            </div>
            <div className="field">
              <label className="label">Current bankroll ($)</label>
              <input
                className="input num"
                type="number"
                step="0.01"
                name="currentBankroll"
                defaultValue={settings.currentBankroll}
                required
              />
              <span className="hint">Updated automatically on settlement</span>
            </div>
          </div>
        </div>

        {/* Risk limits */}
        <div className="card">
          <div className="card-head"><h3>Risk limits</h3><span className="sub">thresholds for warnings</span></div>
          <div className="card-pad grid cols-2" style={{ gap: 14 }}>
            <div className="field">
              <label className="label">Max stake % of bankroll</label>
              <input
                className="input num"
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                name="maxStakePct"
                defaultValue={settings.maxStakePct}
                required
              />
              <span className="hint">e.g. 5 = warn if stake &gt; 5% of bankroll</span>
            </div>
            <div className="field">
              <label className="label">Default unit % of bankroll</label>
              <input
                className="input num"
                type="number"
                step="0.1"
                min="0.1"
                max="100"
                name="defaultUnitPct"
                defaultValue={settings.defaultUnitPct}
                required
              />
            </div>
            <div className="field">
              <label className="label">Warn low-hold % above</label>
              <input
                className="input num"
                type="number"
                step="0.1"
                min="0"
                max="100"
                name="warnLowHoldPctAbove"
                defaultValue={settings.warnLowHoldPctAbove}
                required
              />
              <span className="hint">e.g. 3 = warn if low-hold loss &gt; 3%</span>
            </div>
            <div className="field">
              <label className="label">Odds freshness window (minutes)</label>
              <input
                className="input num"
                type="number"
                step="1"
                min="1"
                max="60"
                name="oddsFreshnessMinutes"
                defaultValue={settings.oddsFreshnessMinutes}
                required
              />
              <span className="hint">Odds older than this trigger a staleness warning</span>
            </div>
          </div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn primary" disabled={pending}>
              {pending ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
