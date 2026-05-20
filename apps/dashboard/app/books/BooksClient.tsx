"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookForm } from "./BookForm";
import { deleteBook } from "./actions";
import { BOOK_ROLES, ROLE_BADGE_COLORS } from "@paperedge/core/constants";
import type { Book } from "@paperedge/database";
import { toast } from "sonner";

interface Props {
  books: Book[];
}

export function BooksClient({ books }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Book | undefined>();

  function openCreate() {
    setEditing(undefined);
    setOpen(true);
  }

  function openEdit(book: Book) {
    setEditing(book);
    setOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this book?")) return;
    await deleteBook(id);
    toast.success("Book deleted");
  }

  const roleLabel = (role: string) =>
    BOOK_ROLES.find((r) => r.value === role)?.label ?? role;

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Books</h1>
        <Button onClick={openCreate}>+ Add Book</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <div
            key={book.id}
            className="bg-white rounded-lg border p-4 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-sm">{book.name}</p>
                <span
                  className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                    ROLE_BADGE_COLORS[book.role] ?? "bg-gray-100 text-gray-700"
                  }`}
                >
                  {roleLabel(book.role)}
                </span>
                {book.role === "unknown" && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Classify this book before using in a trade
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(book)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => handleDelete(book.id)}
                >
                  Del
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 text-xs text-muted-foreground">
              <span>Balance: ${book.currentBalance.toFixed(2)}</span>
              {book.rolloverRemaining > 0 && (
                <span>Rollover: ${book.rolloverRemaining.toFixed(2)}</span>
              )}
              {book.maxBetLimit && (
                <span>Max Bet: ${book.maxBetLimit.toFixed(0)}</span>
              )}
              {book.kycCompleted && (
                <span className="text-green-700">✓ KYC</span>
              )}
            </div>

            {book.notes && (
              <p className="text-xs text-muted-foreground italic">{book.notes}</p>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Book" : "Add Book"}</DialogTitle>
          </DialogHeader>
          <BookForm book={editing} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
