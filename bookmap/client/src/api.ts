import type { Book, LogEntry, Summary } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listBooks: () => fetch("/api/books").then((r) => json<Book[]>(r)),
  getBook: (id: string) =>
    fetch(`/api/books/${id}`).then((r) => json<Book & { log: LogEntry[] }>(r)),
  updateState: (id: string, patch: Partial<Book>) =>
    fetch(`/api/books/${id}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<{ updated: number }>(r)),
  openBook: (id: string) =>
    fetch(`/api/books/${id}/open`, { method: "POST" }).then((r) =>
      json<{ url: string }>(r),
    ),
  summary: () => fetch("/api/summary").then((r) => json<Summary>(r)),
};
