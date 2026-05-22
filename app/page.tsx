import { redirect } from "next/navigation";

export default function WorkspaceLauncherPage() {
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL ?? "http://localhost:3000";
  redirect(dashboardUrl);
}
