"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { BOOK_ROLES } from "@paperedge/core/constants";
import type { Book } from "@paperedge/database";
import { createBook, updateBook } from "./actions";
import { toast } from "sonner";

interface Props {
  book?: Book;
  onDone: () => void;
}

export function BookForm({ book, onDone }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [role, setRole] = useState(book?.role ?? "unknown");
  const handleRoleChange = (v: string | null) => { if (v) setRole(v); };

  async function handleSubmit(formData: FormData) {
    formData.set("role", role);
    setPending(true);
    try {
      if (book) {
        await updateBook(book.id, formData);
        toast.success("Book updated");
      } else {
        await createBook(formData);
        toast.success("Book created");
      }
      onDone();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Book Name</Label>
        <Input id="name" name="name" defaultValue={book?.name} required />
      </div>

      <div>
        <Label>Role *</Label>
        <Select value={role} onValueChange={handleRoleChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {BOOK_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                <span className="font-medium">{r.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {r.description}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="currentBalance">Current Balance ($)</Label>
          <Input
            id="currentBalance"
            name="currentBalance"
            type="number"
            step="0.01"
            defaultValue={book?.currentBalance ?? 0}
          />
        </div>
        <div>
          <Label htmlFor="rolloverRemaining">Rollover Remaining ($)</Label>
          <Input
            id="rolloverRemaining"
            name="rolloverRemaining"
            type="number"
            step="0.01"
            defaultValue={book?.rolloverRemaining ?? 0}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="maxBetLimit">Max Bet Limit ($)</Label>
        <Input
          id="maxBetLimit"
          name="maxBetLimit"
          type="number"
          step="0.01"
          defaultValue={book?.maxBetLimit ?? ""}
          placeholder="Leave blank if unknown"
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="kycCompleted"
          name="kycCompleted"
          defaultChecked={book?.kycCompleted ?? false}
        />
        <Label htmlFor="kycCompleted">KYC Completed</Label>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={book?.notes ?? ""} rows={2} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : book ? "Update Book" : "Add Book"}
        </Button>
      </div>
    </form>
  );
}
