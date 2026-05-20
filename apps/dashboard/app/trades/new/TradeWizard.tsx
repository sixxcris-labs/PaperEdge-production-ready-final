"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  TRADE_TYPES,
  GOALS,
  BONUS_TYPES,
  MARKET_TYPES,
  GAME_PERIODS,
  SPORTS,
  BOOK_ROLES,
  ROLE_BADGE_COLORS,
} from "@paperedge/core/constants";
import {
  requiredCalculator,
  calculatorMismatchWarning,
} from "@paperedge/core/calculator-router";
import type { BonusType, TradeType } from "@paperedge/core/calculator-router";
import { checklistFailures } from "@paperedge/core/checklist";
import {
  cashArbHedge,
  promoHedge,
  lowHold,
  americanToDecimal,
} from "@paperedge/core/calc";
import type { Book } from "@paperedge/database";
import { createTrade } from "../actions";

interface Props {
  books: Book[];
}

type FormData = {
  tradeType: string;
  bonusType: string;
  goal: string;
  bookAId: string;
  bookBId: string;
  eventName: string;
  sport: string;
  league: string;
  tradeDate: string;
  marketType: string;
  gamePeriod: string;
  lineValue: string;
  legAside: string;
  legAodds: string;
  legAstake: string;
  legBside: string;
  legBodds: string;
  legBstake: string;
  legAisPromo: boolean;
  legBisPromo: boolean;
  notes: string;
  goalStated: boolean;
  bookRolesClassified: boolean;
  calculatorMatchesBonusType: boolean;
  sameEventConfirmed: boolean;
  sameMarketTypeConfirmed: boolean;
  sameGamePeriodConfirmed: boolean;
  oppositeSidesConfirmed: boolean;
  sameLineConfirmed: boolean;
  oddsWithinFreshnessWindow: boolean;
  maxBetWithinLimits: boolean;
  bankrollExposureReviewed: boolean;
};

const CHECKLIST_LABELS: Record<string, string> = {
  goalStated: "Goal is clearly stated",
  bookRolesClassified: "Both book roles are classified",
  calculatorMatchesBonusType: "Calculator matches bonus type",
  sameEventConfirmed: "Same event confirmed",
  sameMarketTypeConfirmed: "Same market type confirmed",
  sameGamePeriodConfirmed: "Same game period confirmed",
  oppositeSidesConfirmed: "Opposite sides confirmed",
  sameLineConfirmed: "Same line confirmed",
  oddsWithinFreshnessWindow: "Odds within freshness window (< 5 min)",
  maxBetWithinLimits: "Max bet within limits",
  bankrollExposureReviewed: "Bankroll exposure reviewed",
};

const STEPS = ["Classify", "Books", "Market", "Legs", "Confirm"];

function calcPreview(data: Partial<FormData>) {
  try {
    const tradeType = (data.tradeType ?? "cash_arbitrage") as TradeType;
    const bonusType = (data.bonusType ?? "none") as BonusType;
    const calc = requiredCalculator(bonusType, tradeType);
    const oddsA = parseInt(data.legAodds ?? "0");
    const oddsB = parseInt(data.legBodds ?? "0");
    const stakeA = parseFloat(data.legAstake ?? "0");
    const stakeB = parseFloat(data.legBstake ?? "0");
    if (!oddsA || !oddsB || stakeA <= 0) return null;

    if (calc === "promo_converter") {
      const r = promoHedge(stakeA, oddsA, oddsB);
      return { profitA: r.lockedProfit, profitB: r.lockedProfit, exposure: r.cashExposure, hedgeStake: r.stakeB };
    }
    if (calc === "low_holds") {
      const r = lowHold(stakeA, oddsA, stakeB || stakeA, oddsB);
      return { profitA: r.profitIfA, profitB: r.profitIfB, exposure: r.totalStake, worstCase: r.worstCaseLoss };
    }
    const r = cashArbHedge(stakeA, oddsA, oddsB);
    return { profitA: r.profitIfA, profitB: r.profitIfB, exposure: r.totalStake, hedgeStake: r.stakeB, isArb: r.isArb };
  } catch {
    return null;
  }
}

export function TradeWizard({ books }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showAllBooks, setShowAllBooks] = useState(false);

  const {
    register,
    control,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues: {
      tradeType: "cash_arbitrage",
      bonusType: "none",
      goal: "",
      bookAId: "",
      bookBId: "",
      eventName: "",
      sport: "NFL",
      league: "",
      tradeDate: new Date().toISOString().split("T")[0],
      marketType: "moneyline",
      gamePeriod: "full_game",
      lineValue: "",
      legAside: "",
      legAodds: "",
      legAstake: "",
      legBside: "",
      legBodds: "",
      legBstake: "",
      legAisPromo: false,
      legBisPromo: false,
      notes: "",
      goalStated: false,
      bookRolesClassified: false,
      calculatorMatchesBonusType: false,
      sameEventConfirmed: false,
      sameMarketTypeConfirmed: false,
      sameGamePeriodConfirmed: false,
      oppositeSidesConfirmed: false,
      sameLineConfirmed: false,
      oddsWithinFreshnessWindow: false,
      maxBetWithinLimits: false,
      bankrollExposureReviewed: false,
    },
  });

  const watchAll = watch();
  const tradeType = watchAll.tradeType as TradeType;
  const bonusType = watchAll.bonusType as BonusType;
  const reqCalc = requiredCalculator(bonusType, tradeType);
  const mismatch = calculatorMismatchWarning(bonusType, tradeType, reqCalc);
  const preview = calcPreview(watchAll);

  const bookA = books.find((b) => b.id === watchAll.bookAId);
  const bookB = books.find((b) => b.id === watchAll.bookBId);
  const filteredGoals = GOALS.filter((g) =>
    (g.tradeTypes as readonly string[]).includes(tradeType)
  );

  const checklistData = {
    goalStated: watchAll.goalStated,
    bookRolesClassified: watchAll.bookRolesClassified,
    calculatorMatchesBonusType: watchAll.calculatorMatchesBonusType,
    sameEventConfirmed: watchAll.sameEventConfirmed,
    sameMarketTypeConfirmed: watchAll.sameMarketTypeConfirmed,
    sameGamePeriodConfirmed: watchAll.sameGamePeriodConfirmed,
    oppositeSidesConfirmed: watchAll.oppositeSidesConfirmed,
    sameLineConfirmed: watchAll.sameLineConfirmed,
    oddsWithinFreshnessWindow: watchAll.oddsWithinFreshnessWindow,
    maxBetWithinLimits: watchAll.maxBetWithinLimits,
    bankrollExposureReviewed: watchAll.bankrollExposureReviewed,
  };
  const failures = checklistFailures(checklistData);
  const allChecksPassed = failures.length === 0;

  function fillHedge() {
    if (!preview?.hedgeStake) return;
    setValue("legBstake", preview.hedgeStake.toFixed(2));
  }

  async function submitTrade(status: string, override?: string) {
    const data = getValues();
    setSubmitting(true);
    try {
      const id = await createTrade(
        {
          ...data,
          legAodds: parseInt(data.legAodds) as unknown as number,
          legAstake: parseFloat(data.legAstake) as unknown as number,
          legBodds: parseInt(data.legBodds) as unknown as number,
          legBstake: parseFloat(data.legBstake) as unknown as number,
          lineValue: data.lineValue ? parseFloat(data.lineValue) : undefined,
          legAisPromo: Boolean(data.legAisPromo),
          legBisPromo: Boolean(data.legBisPromo),
          forceOverride: Boolean(override),
          overrideReason: override,
        } as Parameters<typeof createTrade>[0],
        status
      );
      toast.success("Trade saved!");
      router.push(`/trades/${id}`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const roleLabel = (role: string) =>
    BOOK_ROLES.find((r) => r.value === role)?.label ?? role;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step tabs */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => i < step && setStep(i)}
            className={`flex-1 py-2 text-xs font-medium rounded border transition-colors ${
              i === step
                ? "bg-slate-900 text-white border-slate-900"
                : i < step
                ? "bg-slate-100 text-slate-700 border-slate-200 cursor-pointer hover:bg-slate-200"
                : "bg-white text-slate-400 border-slate-200 cursor-default"
            }`}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Step 1: Classify */}
      {step === 0 && (
        <div className="space-y-4 bg-white rounded-lg border p-6">
          <h2 className="font-semibold">Step 1: Classify the Trade</h2>

          <div>
            <Label>Trade Type</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TRADE_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-center gap-2 p-3 rounded border cursor-pointer text-sm transition-colors ${
                    watchAll.tradeType === t.value
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    value={t.value}
                    {...register("tradeType")}
                    className="sr-only"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label>Bonus Type</Label>
            <Controller
              name="bonusType"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BONUS_TYPES.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {mismatch && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              ⚠ {mismatch}
            </div>
          )}

          <div>
            <Label>Goal</Label>
            <div className="mt-2 space-y-2">
              {filteredGoals.map((g) => (
                <label
                  key={g.value}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${
                    watchAll.goal === g.value
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    value={g.value}
                    {...register("goal")}
                    className="sr-only"
                  />
                  {g.label}
                </label>
              ))}
            </div>
          </div>

          <div className="p-3 rounded bg-slate-50 text-xs text-slate-600">
            Required calculator: <strong>{reqCalc}</strong>
          </div>

          <Button
            className="w-full"
            onClick={() => setStep(1)}
            disabled={!watchAll.tradeType || !watchAll.goal}
          >
            Next: Select Books →
          </Button>
        </div>
      )}

      {/* Step 2: Books */}
      {step === 1 && (
        <div className="space-y-4 bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Step 2: Select Books</h2>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={showAllBooks}
                onChange={(e) => setShowAllBooks(e.target.checked)}
                className="rounded"
              />
              Show unavailable books
            </label>
          </div>

          <div>
            <Label>Book A (promo/sharp side)</Label>
            <Controller
              name="bookAId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Book A" />
                  </SelectTrigger>
                  <SelectContent>
                    {(showAllBooks ? books : books.filter((b) => b.available)).map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}{" "}
                        <span
                          className={`ml-1 text-xs ${ROLE_BADGE_COLORS[b.role]}`}
                        >
                          [{roleLabel(b.role)}]
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {bookA?.role === "unknown" && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠ Book A role is unclassified
              </p>
            )}
          </div>

          <div>
            <Label>Book B (hedge side)</Label>
            <Controller
              name="bookBId"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Book B" />
                  </SelectTrigger>
                  <SelectContent>
                    {(showAllBooks ? books : books.filter((b) => b.available))
                      .filter((b) => b.id !== watchAll.bookAId)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}{" "}
                          <span
                            className={`ml-1 text-xs ${ROLE_BADGE_COLORS[b.role]}`}
                          >
                            [{roleLabel(b.role)}]
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
            />
            {bookB?.role === "unknown" && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠ Book B role is unclassified
              </p>
            )}
          </div>

          {bookA && bookB && bookA.role === bookB.role && (
            <div className="p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-700">
              ⚠ Both books have the same role ({roleLabel(bookA.role)}). This
              may not match your strategy.
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(0)}>
              ← Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => setStep(2)}
              disabled={!watchAll.bookAId || !watchAll.bookBId}
            >
              Next: Market →
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Market */}
      {step === 2 && (
        <div className="space-y-4 bg-white rounded-lg border p-6">
          <h2 className="font-semibold">Step 3: Market Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Trade Date</Label>
              <Input type="date" {...register("tradeDate")} className="mt-1" />
            </div>
            <div>
              <Label>Sport</Label>
              <Controller
                name="sport"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORTS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div>
            <Label>Event Name</Label>
            <Input
              {...register("eventName")}
              placeholder="e.g. Chiefs vs Eagles"
              className="mt-1"
            />
          </div>

          <div>
            <Label>League (optional)</Label>
            <Input
              {...register("league")}
              placeholder="e.g. NFL Week 10"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Market Type</Label>
              <Controller
                name="marketType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKET_TYPES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div>
              <Label>Game Period</Label>
              <Controller
                name="gamePeriod"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAME_PERIODS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {(watchAll.marketType === "spread" ||
            watchAll.marketType === "total" ||
            watchAll.marketType === "team_total") && (
            <div>
              <Label>Line Value</Label>
              <Input
                type="number"
                step="0.5"
                {...register("lineValue")}
                placeholder="e.g. 7.5"
                className="mt-1"
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => setStep(3)}
              disabled={!watchAll.eventName || !watchAll.sport}
            >
              Next: Legs →
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Legs */}
      {step === 3 && (
        <div className="space-y-4 bg-white rounded-lg border p-6">
          <h2 className="font-semibold">Step 4: Legs</h2>
          <p className="text-xs text-slate-500">Calculator: {reqCalc}</p>

          {/* Leg A */}
          <div className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">
                Leg A — {bookA?.name ?? "Book A"}
              </p>
              {reqCalc === "promo_converter" && (
                <label className="flex items-center gap-2 text-xs">
                  <Controller
                    name="legAisPromo"
                    control={control}
                    render={({ field }) => (
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                  Promo leg (stake not returned)
                </label>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Side</Label>
                <Input
                  {...register("legAside")}
                  placeholder="e.g. Chiefs ML"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Odds (American)</Label>
                <Input
                  type="number"
                  {...register("legAodds")}
                  placeholder="+140"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Stake ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("legAstake")}
                  placeholder="100"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Leg B */}
          <div className="border rounded p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">
                Leg B — {bookB?.name ?? "Book B"}
              </p>
              {reqCalc !== "low_holds" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={fillHedge}
                  disabled={!preview?.hedgeStake}
                >
                  Auto-fill Hedge
                </Button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Side</Label>
                <Input
                  {...register("legBside")}
                  placeholder="e.g. Eagles ML"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Odds (American)</Label>
                <Input
                  type="number"
                  {...register("legBodds")}
                  placeholder="-130"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Stake ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register("legBstake")}
                  placeholder="135.65"
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Live preview */}
          {preview && (
            <div className="bg-slate-50 rounded border p-4 text-sm space-y-1">
              <p className="font-medium text-xs text-slate-500 uppercase">
                Live Preview
              </p>
              <div className="grid grid-cols-2 gap-2">
                <span>
                  Profit if A wins:{" "}
                  <strong
                    className={preview.profitA >= 0 ? "text-green-700" : "text-red-600"}
                  >
                    ${preview.profitA.toFixed(2)}
                  </strong>
                </span>
                <span>
                  Profit if B wins:{" "}
                  <strong
                    className={preview.profitB >= 0 ? "text-green-700" : "text-red-600"}
                  >
                    ${preview.profitB.toFixed(2)}
                  </strong>
                </span>
                <span>Total exposure: ${preview.exposure.toFixed(2)}</span>
                {preview.hedgeStake && (
                  <span>Hedge stake: ${preview.hedgeStake.toFixed(2)}</span>
                )}
                {"isArb" in preview && (
                  <span
                    className={
                      preview.isArb ? "text-green-700 font-medium" : "text-red-600"
                    }
                  >
                    {preview.isArb ? "✓ Arb opportunity" : "✗ Not an arb"}
                  </span>
                )}
              </div>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea {...register("notes")} rows={2} className="mt-1" />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>
              ← Back
            </Button>
            <Button
              className="flex-1"
              onClick={() => setStep(4)}
              disabled={
                !watchAll.legAside ||
                !watchAll.legAodds ||
                !watchAll.legAstake ||
                !watchAll.legBside ||
                !watchAll.legBodds ||
                !watchAll.legBstake
              }
            >
              Next: Confirm →
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Confirm + Checklist */}
      {step === 4 && (
        <div className="space-y-4 bg-white rounded-lg border p-6">
          <h2 className="font-semibold">Step 5: Confirm & Checklist</h2>

          {/* Summary */}
          <div className="bg-slate-50 rounded p-4 text-sm space-y-1">
            <p>
              <strong>{watchAll.eventName}</strong> — {watchAll.sport}
            </p>
            <p>
              {watchAll.tradeType} · {bookA?.name} vs {bookB?.name}
            </p>
            {preview && (
              <p>
                Expected:{" "}
                <strong className={preview.profitA >= 0 ? "text-green-700" : "text-red-600"}>
                  ${Math.min(preview.profitA, preview.profitB).toFixed(2)}
                </strong>{" "}
                min locked
              </p>
            )}
          </div>

          {/* Checklist */}
          <div className="space-y-2">
            {Object.entries(CHECKLIST_LABELS).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-3 text-sm cursor-pointer"
              >
                <Controller
                  name={key as keyof FormData}
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      checked={Boolean(field.value)}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                {label}
              </label>
            ))}
          </div>

          {failures.length > 0 && (
            <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
              <strong>Incomplete:</strong>
              <ul className="mt-1 list-disc list-inside">
                {failures.map((f) => (
                  <li key={f}>{CHECKLIST_LABELS[f] ?? f}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(3)}>
              ← Back
            </Button>
            <Button
              variant="outline"
              onClick={() => submitTrade("draft")}
              disabled={submitting}
            >
              Save as Draft
            </Button>
            <Button
              className="flex-1"
              disabled={!allChecksPassed || submitting}
              onClick={() => submitTrade("ready")}
            >
              Mark Ready ✓
            </Button>
          </div>

          {failures.length > 0 && (
            <Button
              variant="outline"
              className="w-full text-amber-700 border-amber-300 hover:bg-amber-50"
              onClick={() => setOverrideOpen(true)}
            >
              Force Save (Override)
            </Button>
          )}
        </div>
      )}

      {/* Override modal */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override Checklist</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You are about to save this trade with incomplete checklist items.
            This will be logged. Please explain why.
          </p>
          <Textarea
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Reason for override…"
            rows={3}
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!overrideReason.trim() || submitting}
              onClick={async () => {
                setOverrideOpen(false);
                await submitTrade("ready", overrideReason);
              }}
            >
              Save with Override
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
