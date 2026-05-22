"use server";

import { revalidatePath } from "next/cache";
import { db } from "@paperedge/database";
import { toCents, toCentsOrNull } from "@paperedge/core/money";
import { parseBookFormData } from "@/lib/book-form";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";

export async function createBook(formData: FormData) {
  const user = await getDashboardLocalUser();
  const data = parseBookFormData(formData);
  await db.book.create({
    data: {
      ...data,
      userId: user.id,
      currentBalanceCents: toCents(data.currentBalance),
      rolloverRemainingCents: toCents(data.rolloverRemaining),
      maxBetLimitCents: toCentsOrNull(data.maxBetLimit),
    },
  });
  revalidatePath("/books");
}

export async function updateBook(id: string, formData: FormData) {
  const data = parseBookFormData(formData);
  await db.book.update({
    where: { id },
    data: {
      ...data,
      currentBalanceCents: toCents(data.currentBalance),
      rolloverRemainingCents: toCents(data.rolloverRemaining),
      maxBetLimitCents: toCentsOrNull(data.maxBetLimit),
    },
  });
  revalidatePath("/books");
}

export async function deleteBook(id: string) {
  await db.book.delete({ where: { id } });
  revalidatePath("/books");
}
