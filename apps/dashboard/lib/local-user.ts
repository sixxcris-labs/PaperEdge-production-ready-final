import { db } from "@paperedge/database";

export const LOCAL_USER_EMAIL = "local@paperedge.app";

export async function getDashboardLocalUser() {
  return db.user.findUniqueOrThrow({
    where: { email: LOCAL_USER_EMAIL },
  });
}
