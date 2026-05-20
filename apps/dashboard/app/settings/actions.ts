"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@paperedge/database";

const LOCAL_USER_EMAIL = "local@paperedge.app";

const SettingsSchema = z.object({
  startingBankroll:         z.coerce.number().positive(),
  currentBankroll:          z.coerce.number(),
  maxStakePct:              z.coerce.number().min(0.1).max(100),
  oddsFreshnessMinutes:     z.coerce.number().int().min(1).max(60),
  defaultUnitPct:           z.coerce.number().min(0.1).max(100),
  warnLowHoldPctAbove:      z.coerce.number().min(0).max(100),
});

export async function saveSettings(formData: FormData) {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const data = SettingsSchema.parse({
    startingBankroll:     formData.get("startingBankroll"),
    currentBankroll:      formData.get("currentBankroll"),
    maxStakePct:          formData.get("maxStakePct"),
    oddsFreshnessMinutes: formData.get("oddsFreshnessMinutes"),
    defaultUnitPct:       formData.get("defaultUnitPct"),
    warnLowHoldPctAbove:  formData.get("warnLowHoldPctAbove"),
  });

  await db.userSettings.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  revalidatePath("/settings");
  revalidatePath("/");
}
