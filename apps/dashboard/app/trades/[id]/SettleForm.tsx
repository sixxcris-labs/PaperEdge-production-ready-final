"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { settleTrade } from "./settle-actions";

interface Props {
  tradeId: string;
  legALabel?: string;
  legBLabel?: string;
  onDone: () => void;
}

export function SettleForm({ tradeId, legALabel = "Side A", legBLabel = "Side B", onDone }: Props) {
  const [winningSide, setWinningSide] = useState("A");
  const [finalStat, setFinalStat] = useState("");
  const [actualPayout, setActualPayout] = useState("");
  const [losingSake, setLosingSake] = useState("");
  const [actualPL, setActualPL] = useState("");
  const [resultNotes, setResultNotes] = useState("");
  const [pending, setPending] = useState(false);

  // Auto-calculate P/L when payout + losing stake change
  function recalcPL(payout: string, losing: string) {
    const p = parseFloat(payout) || 0;
    const l = parseFloat(losing) || 0;
    if (p > 0 || l > 0) setActualPL((p - l).toFixed(2));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("winningSide", winningSide);
      fd.set("finalStat", finalStat);
      fd.set("actualPayout", actualPayout);
      fd.set("losingSake", losingSake);
      fd.set("actualProfitLoss", actualPL);
      fd.set("resultNotes", resultNotes);
      await settleTrade(tradeId, fd);
      toast.success("Trade settled");
      onDone();
    } catch {
      toast.error("Failed to settle trade");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Winning side</Label>
        <select
          value={winningSide}
          onChange={(e) => setWinningSide(e.target.value)}
          className="mt-1 w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="A">{legALabel} wins</option>
          <option value="B">{legBLabel} wins</option>
          <option value="push">Push / Void</option>
        </select>
      </div>

      <div>
        <Label htmlFor="finalStat">Final stat / result</Label>
        <Input
          id="finalStat"
          value={finalStat}
          onChange={(e) => setFinalStat(e.target.value)}
          placeholder="e.g. 1 assist, +4.5 pts, 3-2 final score"
          className="mt-1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="actualPayout">Actual payout — winning leg ($)</Label>
          <Input
            id="actualPayout"
            type="number"
            step="0.01"
            value={actualPayout}
            onChange={(e) => {
              setActualPayout(e.target.value);
              recalcPL(e.target.value, losingSake);
            }}
            placeholder="526.00"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="losingSake">Losing stake ($)</Label>
          <Input
            id="losingSake"
            type="number"
            step="0.01"
            value={losingSake}
            onChange={(e) => {
              setLosingSake(e.target.value);
              recalcPL(actualPayout, e.target.value);
            }}
            placeholder="398.00"
            className="mt-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="actualPL">
          Actual profit / loss ($)
          <span className="text-xs font-normal text-muted-foreground ml-2">auto-calculated — edit if needed</span>
        </Label>
        <Input
          id="actualPL"
          type="number"
          step="0.01"
          required
          value={actualPL}
          onChange={(e) => setActualPL(e.target.value)}
          placeholder="29.50"
          className={`mt-1 font-mono ${parseFloat(actualPL) >= 0 ? "text-green-700" : parseFloat(actualPL) < 0 ? "text-red-600" : ""}`}
        />
      </div>

      <div>
        <Label htmlFor="resultNotes">Settlement notes</Label>
        <Textarea
          id="resultNotes"
          value={resultNotes}
          onChange={(e) => setResultNotes(e.target.value)}
          rows={2}
          placeholder="Any notes about the settlement…"
          className="mt-1"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending || !actualPL}>
          {pending ? "Saving…" : "Settle Trade"}
        </Button>
      </div>
    </form>
  );
}
