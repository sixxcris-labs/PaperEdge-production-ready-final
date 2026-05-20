"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@paperedge/database";

const DeepLinkSchema = z.object({
  sport: z.string().min(1),
  marketType: z.string().min(1),
  urlTemplate: z.string().url("Must be a valid URL"),
  queryParam: z.string().nullable().optional(),
  fallbackUrl: z.string().url("Must be a valid URL").nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function createDeepLink(bookId: string, formData: FormData) {
  const raw = Object.fromEntries(formData);
  const data = DeepLinkSchema.parse({
    ...raw,
    queryParam: raw.queryParam || null,
    fallbackUrl: raw.fallbackUrl || null,
    notes: raw.notes || null,
  });
  await db.bookDeepLink.create({ data: { bookId, ...data } });
  revalidatePath(`/books/${bookId}/deep-links`);
}

export async function updateDeepLink(
  id: string,
  bookId: string,
  formData: FormData
) {
  const raw = Object.fromEntries(formData);
  const data = DeepLinkSchema.parse({
    ...raw,
    queryParam: raw.queryParam || null,
    fallbackUrl: raw.fallbackUrl || null,
    notes: raw.notes || null,
  });
  await db.bookDeepLink.update({ where: { id }, data });
  revalidatePath(`/books/${bookId}/deep-links`);
}

export async function deleteDeepLink(id: string, bookId: string) {
  await db.bookDeepLink.delete({ where: { id } });
  revalidatePath(`/books/${bookId}/deep-links`);
}
