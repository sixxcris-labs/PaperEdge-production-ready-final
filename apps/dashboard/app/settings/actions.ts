"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@paperedge/database";
import { toCents } from "@paperedge/core/money";
import { getDashboardLocalUser } from "@/apps/dashboard/lib/local-user";

const SettingsSchema = z.object({
  startingBankroll:         z.coerce.number().positive(),
  currentBankroll:          z.coerce.number(),
  maxStakePct:              z.coerce.number().min(0.1).max(100),
  oddsFreshnessMinutes:     z.coerce.number().int().min(1).max(60),
  defaultUnitPct:           z.coerce.number().min(0.1).max(100),
  warnLowHoldPctAbove:      z.coerce.number().min(0).max(100),
});

export async function saveSettings(formData: FormData) {
  const user = await getDashboardLocalUser();
  const data = SettingsSchema.parse({
    startingBankroll:     formData.get("startingBankroll"),
    currentBankroll:      formData.get("currentBankroll"),
    maxStakePct:          formData.get("maxStakePct"),
    oddsFreshnessMinutes: formData.get("oddsFreshnessMinutes"),
    defaultUnitPct:       formData.get("defaultUnitPct"),
    warnLowHoldPctAbove:  formData.get("warnLowHoldPctAbove"),
  });
  const moneyData = {
    ...data,
    startingBankrollCents: toCents(data.startingBankroll),
    currentBankrollCents: toCents(data.currentBankroll),
  };

  await db.userSettings.upsert({
    where: { userId: user.id },
    update: moneyData,
    create: { userId: user.id, ...moneyData },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}
