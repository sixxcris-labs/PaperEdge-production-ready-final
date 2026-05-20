import { z } from "zod";

const BookSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.enum([
    "win_into",
    "lose_out_of",
    "bonus",
    "liquid",
    "exchange",
    "social",
    "prediction_market",
    "unknown",
  ]),
  currentBalance: z.coerce.number().default(0),
  rolloverRemaining: z.coerce.number().default(0),
  maxBetLimit: z.coerce.number().optional(),
  kycCompleted: z.coerce.boolean().default(false),
  notes: z.string().optional(),
});

export type BookFormData = z.infer<typeof BookSchema>;

function parseCheckbox(value: FormDataEntryValue | undefined): boolean {
  return value === "on" || value === "true";
}

export function parseBookFormData(formData: FormData): BookFormData {
  const raw = Object.fromEntries(formData);
  return BookSchema.parse({
    ...raw,
    kycCompleted: parseCheckbox(raw.kycCompleted),
  });
}
