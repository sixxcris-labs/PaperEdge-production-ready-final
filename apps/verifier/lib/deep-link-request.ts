import { z } from "zod";

export interface DeepLinkQuery {
  bookId: string;
  sport: string;
  marketType: string;
  player?: string;
  team?: string;
  event?: string;
}

const querySchema = z.object({
  bookId: z
    .string()
    .max(255, { message: "bookId is too long" })
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, { message: "bookId is required" }),
  sport: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .transform((value) => (value.length > 0 ? value : "default"))
    .refine((value) => value.length <= 80, { message: "sport is too long" }),
  marketType: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .transform((value) => (value.length > 0 ? value : "default"))
    .refine((value) => value.length <= 80, { message: "marketType is too long" }),
  player: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .transform((value) => (value.length > 0 ? value : undefined))
    .refine((value) => value === undefined || value.length <= 1000, {
      message: "player is too long",
    }),
  team: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .transform((value) => (value.length > 0 ? value : undefined))
    .refine((value) => value === undefined || value.length <= 1000, {
      message: "team is too long",
    }),
  event: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? "")
    .transform((value) => (value.length > 0 ? value : undefined))
    .refine((value) => value === undefined || value.length <= 1000, {
      message: "event is too long",
    }),
});

export function parseDeepLinkQuery(searchParams: URLSearchParams): DeepLinkQuery {
  const raw = Object.fromEntries(searchParams.entries());
  const rawBookId = typeof raw.bookId === "string" ? raw.bookId.trim() : "";
  if (!rawBookId) {
    throw new Error("bookId is required");
  }

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid deep-link query");
  }
  return parsed.data;
}

export function sanitizeResolvedUrl(url: string | null | undefined): string {
  const candidate = String(url ?? "").trim();
  if (!candidate) return "about:blank";
  if (candidate === "about:blank") return candidate;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return "about:blank";
  } catch {
    return "about:blank";
  }
}
