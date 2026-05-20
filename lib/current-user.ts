import { db } from "./db";
import { DEFAULT_STARTING_BANKROLL, LOCAL_USER_DISPLAY_NAME, LOCAL_USER_EMAIL } from "./config";

export { DEFAULT_STARTING_BANKROLL, LOCAL_USER_DISPLAY_NAME, LOCAL_USER_EMAIL } from "./config";

/**
 * Single-user MVP identity helper.
 *
 * Auth is intentionally out of scope for the local MVP, but user/settings lookup
 * must still be centralized so every page/action uses the same account and sane
 * defaults. This helper is the future replacement point for real auth.
 */
export async function getLocalUser() {
  const user = await db.user.upsert({
    where: { email: LOCAL_USER_EMAIL },
    update: {},
    create: {
      email: LOCAL_USER_EMAIL,
      displayName: LOCAL_USER_DISPLAY_NAME,
    },
  });

  await db.userSettings.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      startingBankroll: DEFAULT_STARTING_BANKROLL,
      currentBankroll: DEFAULT_STARTING_BANKROLL,
    },
  });

  return user;
}

export async function getLocalUserWithSettings() {
  const user = await getLocalUser();
  const settings = await db.userSettings.findUniqueOrThrow({
    where: { userId: user.id },
  });
  return { user, settings };
}
