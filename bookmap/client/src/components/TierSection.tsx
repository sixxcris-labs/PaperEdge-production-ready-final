import type { Book, Tier } from "../types";
import { TIER_LABEL } from "../types";
import { BookCard } from "./BookCard";

export function TierSection({
  tier,
  books,
  onEdit,
}: {
  tier: Tier;
  books: Book[];
  onEdit: (id: string) => void;
}) {
  if (books.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-3">
        {TIER_LABEL[tier]}
        <span className="ml-2 text-slate-600">({books.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {books.map((b) => (
          <BookCard key={b.id} book={b} onEdit={onEdit} />
        ))}
      </div>
    </section>
  );
}
