"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createDeepLink, updateDeepLink, deleteDeepLink } from "./actions";

const SPORTS = [
  "default",
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "ncaaf",
  "ncaab",
  "soccer",
];
const MARKET_TYPES = [
  "default",
  "moneyline",
  "spread",
  "total",
  "player_prop",
];
const QUERY_PARAMS = [
  { value: "", label: "None" },
  { value: "event", label: "Event name" },
  { value: "team", label: "Team name" },
  { value: "player", label: "Player name" },
];

interface DeepLink {
  id: string;
  sport: string;
  marketType: string;
  urlTemplate: string;
  queryParam: string | null;
  fallbackUrl: string | null;
  notes: string | null;
}

interface Props {
  bookId: string;
  bookName: string;
  deepLinks: DeepLink[];
}

interface FormRowProps {
  initial?: DeepLink;
  bookId: string;
  onDone: () => void;
}

function DeepLinkForm({ initial, bookId, onDone }: FormRowProps) {
  const [sport, setSport] = useState(initial?.sport ?? "default");
  const [marketType, setMarketType] = useState(
    initial?.marketType ?? "default"
  );
  const [urlTemplate, setUrlTemplate] = useState(initial?.urlTemplate ?? "");
  const [queryParam, setQueryParam] = useState(initial?.queryParam ?? "");
  const [fallbackUrl, setFallbackUrl] = useState(initial?.fallbackUrl ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("sport", sport);
      fd.set("marketType", marketType);
      fd.set("urlTemplate", urlTemplate);
      fd.set("queryParam", queryParam);
      fd.set("fallbackUrl", fallbackUrl);
      fd.set("notes", notes);

      if (initial) {
        await updateDeepLink(initial.id, bookId, fd);
        toast.success("Deep link updated");
      } else {
        await createDeepLink(bookId, fd);
        toast.success("Deep link added");
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function testUrl() {
    let url = urlTemplate;
    if (url.includes("{query}") && queryParam) {
      url = url.replace("{query}", encodeURIComponent(`[sample ${queryParam}]`));
    }
    if (!url || url === urlTemplate.split("?")[0]) {
      url = fallbackUrl || urlTemplate;
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sport</label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Market type</label>
          <select
            value={marketType}
            onChange={(e) => setMarketType(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {MARKET_TYPES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">
          URL template{" "}
          <span className="text-blue-600">
            (use <code>{"{query}"}</code> for search)
          </span>
        </label>
        <input
          type="url"
          required
          value={urlTemplate}
          onChange={(e) => setUrlTemplate(e.target.value)}
          placeholder="https://example.com/search?q={query}"
          className="w-full border rounded px-2 py-1.5 text-sm font-mono"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            {"{query}"} fills from
          </label>
          <select
            value={queryParam}
            onChange={(e) => setQueryParam(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          >
            {QUERY_PARAMS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">
            Fallback URL (no search term)
          </label>
          <input
            type="url"
            value={fallbackUrl}
            onChange={(e) => setFallbackUrl(e.target.value)}
            placeholder="https://example.com/sports"
            className="w-full border rounded px-2 py-1.5 text-sm font-mono"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Notes</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : initial ? "Update" : "Add"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={testUrl}
          disabled={!urlTemplate}
        >
          Test URL ▸
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDone}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function DeepLinksClient({ bookId, bookName, deepLinks }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm("Delete this deep link?")) return;
    await deleteDeepLink(id, bookId);
    toast.success("Deleted");
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Deep Links — {bookName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            URLs opened when you click "Open {bookName}" during verification.
            Use{" "}
            <code className="text-xs bg-muted px-1 rounded">{"{query}"}</code>{" "}
            to inject a search term.
          </p>
        </div>
        <Button size="sm" onClick={() => setAdding(true)}>
          + Add template
        </Button>
      </div>

      {adding && (
        <DeepLinkForm bookId={bookId} onDone={() => setAdding(false)} />
      )}

      {deepLinks.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
          No deep links yet. Add one above.
        </p>
      )}

      {deepLinks.map((dl) => (
        <div key={dl.id}>
          {editing === dl.id ? (
            <DeepLinkForm
              initial={dl}
              bookId={bookId}
              onDone={() => setEditing(null)}
            />
          ) : (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <div className="flex gap-2 text-xs">
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                      {dl.sport}
                    </span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                      {dl.marketType}
                    </span>
                    {dl.queryParam && (
                      <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-mono">
                        query={dl.queryParam}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-mono text-muted-foreground break-all">
                    {dl.urlTemplate}
                  </p>
                  {dl.fallbackUrl && (
                    <p className="text-xs text-muted-foreground">
                      Fallback: {dl.fallbackUrl}
                    </p>
                  )}
                  {dl.notes && (
                    <p className="text-xs text-muted-foreground italic">
                      {dl.notes}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 ml-4 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(dl.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleDelete(dl.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
