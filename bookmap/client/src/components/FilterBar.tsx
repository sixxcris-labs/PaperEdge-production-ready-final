export type Filter = "all" | "verify" | "registered" | "funded" | "rollover" | "stale";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "verify", label: "Verify" },
  { id: "registered", label: "Registered" },
  { id: "funded", label: "Funded" },
  { id: "rollover", label: "Open Rollover" },
  { id: "stale", label: "Stale" },
];

export function FilterBar({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={`px-3 py-1.5 text-sm rounded-md border transition ${
            value === f.id
              ? "bg-slate-100 text-slate-900 border-slate-100"
              : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
