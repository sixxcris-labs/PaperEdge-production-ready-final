// Plain module (NO "use server"): shared by the client form and the server
// action. A "use server" file may only export async functions — exporting a
// Zod schema from there turns it into a server-action proxy on the client,
// which is why ManualTradeSchema.safeParse was "not a function".

import { z } from "zod";

export const ManualTradeSchema = z.object({
  customTradeId: z.string().min(1, "Trade ID is required"),
  tradeDate: z.string().min(1, "Date is required"),
  eventName: z.string().min(1, "Event is required"),
  marketType: z.string().min(1, "Market is required"),
  player: z.string().optional(),
  lineValue: z.coerce.number({ message: "Line must be a number" }),
  bookAId: z.string().min(1, "Book A is required"),
  sideA: z.string().min(1, "Side A is required"),
  oddsA: z.coerce.number({ message: "Odds A must be a number" }).int("Odds A must be a whole number").refine((n) => n !== 0, "Odds A cannot be 0 — use e.g. +120 or -110"),
  stakeA: z.coerce.number({ message: "Stake A must be a number" }).positive("Stake A must be positive"),
  bookBId: z.string().min(1, "Book B is required"),
  sideB: z.string().min(1, "Side B is required"),
  oddsB: z.coerce.number({ message: "Odds B must be a number" }).int("Odds B must be a whole number").refine((n) => n !== 0, "Odds B cannot be 0 — use e.g. +120 or -110"),
  stakeB: z.coerce.number({ message: "Stake B must be a number" }).positive("Stake B must be positive"),
  expectedProfitRange: z.string().optional(),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
});

export type ManualTradeInput = z.infer<typeof ManualTradeSchema>;
