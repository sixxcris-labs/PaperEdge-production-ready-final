"use server";

import { revalidatePath } from "next/cache";
import { db } from "@paperedge/database";
import { parseBookFormData } from "@/lib/book-form";

const LOCAL_USER_EMAIL = "local@paperedge.app";

async function getLocalUser() {
  return db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
}

export async function createBook(formData: FormData) {
  const user = await getLocalUser();
  const data = parseBookFormData(formData);
  await db.book.create({ data: { ...data, userId: user.id } });
  revalidatePath("/books");
}

export async function updateBook(id: string, formData: FormData) {
  const data = parseBookFormData(formData);
  await db.book.update({ where: { id }, data });
  revalidatePath("/books");
}

export async function deleteBook(id: string) {
  await db.book.delete({ where: { id } });
  revalidatePath("/books");
}
