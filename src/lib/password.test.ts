import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the original password but rejects a different one", async () => {
    const hash = await hashPassword("Noventra-Admin-Password-123");

    assert.equal(await verifyPassword("Noventra-Admin-Password-123", hash), true);
    assert.equal(await verifyPassword("different-password", hash), false);
  });
});
