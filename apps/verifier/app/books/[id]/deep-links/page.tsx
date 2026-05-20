import { notFound } from "next/navigation";
import { db } from "@paperedge/database";
import { DeepLinksClient } from "./DeepLinksClient";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function BookDeepLinksPage({ params }: Props) {
  const { id } = await params;

  const book = await db.book.findUnique({
    where: { id },
    include: {
      deepLinks: { orderBy: [{ sport: "asc" }, { marketType: "asc" }] },
    },
  });

  if (!book) notFound();

  return (
    <DeepLinksClient
      bookId={book.id}
      bookName={book.name}
      deepLinks={book.deepLinks}
    />
  );
}
