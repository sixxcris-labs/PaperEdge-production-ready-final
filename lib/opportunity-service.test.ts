import type { PrismaClient } from "@paperedge/database";
import { describe, expect, it, vi } from "vitest";
import { LOCAL_USER_EMAIL, getLocalUser } from "./opportunity-service";

describe("getLocalUser", () => {
  it("upserts the local verifier user when it does not exist yet", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "user-local",
      email: LOCAL_USER_EMAIL,
    });
    const client = {
      user: {
        upsert,
      },
    } as unknown as PrismaClient;

    const user = await getLocalUser(client);

    expect(upsert).toHaveBeenCalledWith({
      where: { email: LOCAL_USER_EMAIL },
      update: {},
      create: { email: LOCAL_USER_EMAIL },
    });
    expect(user).toMatchObject({
      id: "user-local",
      email: LOCAL_USER_EMAIL,
    });
  });
});
