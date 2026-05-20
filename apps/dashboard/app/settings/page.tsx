import { db } from "@paperedge/database";
import { SettingsClient } from "./SettingsClient";
import Link from "next/link";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

const DEFAULTS = {
  startingBankroll: 1000,
  currentBankroll: 1000,
  maxStakePct: 5.0,
  oddsFreshnessMinutes: 5,
  defaultUnitPct: 1.0,
  warnLowHoldPctAbove: 3.0,
};

export default async function SettingsPage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Configure bankroll, risk limits, and preferences.</p>
        </div>
        <div className="actions">
          <Link href="/books/manage" className="btn ghost">Manage books →</Link>
        </div>
      </div>

      <SettingsClient settings={settings ?? DEFAULTS} />
    </div>
  );
}
