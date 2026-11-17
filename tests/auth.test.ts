import { describe, expect, it } from "vitest";
import { Session } from "@/models";
import { LOGIN_MAX_ATTEMPTS, login, logout, validateSessionToken } from "@/services/auth.service";
import { sha256 } from "@/lib/crypto";
import { makeAdmin } from "./helpers";

describe("admin authentication", () => {
  it("logs in and validates the session server-side", async () => {
    await makeAdmin();
    const { token } = await login({ email: "BOSS@party.test", password: "super-secret-pass", ip: "1.1.1.1" });
    const admin = await validateSessionToken(token);
    expect(admin?.email).toBe("boss@party.test");
    // Only the hash is stored, never the raw token.
    expect(await Session.findOne({ tokenHash: token })).toBeNull();
    expect(await Session.findOne({ tokenHash: sha256(token) })).not.toBeNull();
  });

  it("rejects bad passwords and unknown users with the same error", async () => {
    await makeAdmin();
    await expect(login({ email: "boss@party.test", password: "nope", ip: "1.1.1.2" })).rejects.toMatchObject({ status: 401 });
    await expect(login({ email: "ghost@party.test", password: "nope", ip: "1.1.1.3" })).rejects.toMatchObject({ status: 401 });
  });

  it("expires sessions", async () => {
    await makeAdmin();
    const { token } = await login({ email: "boss@party.test", password: "super-secret-pass", ip: "1.1.1.4" });
    await Session.updateOne({ tokenHash: sha256(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await validateSessionToken(token)).toBeNull();
  });

  it("invalidates the session on logout and rejects garbage tokens", async () => {
    await makeAdmin();
    const { token } = await login({ email: "boss@party.test", password: "super-secret-pass", ip: "1.1.1.5" });
    await logout(token);
    expect(await validateSessionToken(token)).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
    expect(await validateSessionToken("x".repeat(500))).toBeNull();
  });

  it("rate limits repeated login attempts", async () => {
    await makeAdmin();
    for (let i = 0; i < LOGIN_MAX_ATTEMPTS; i++) {
      await expect(login({ email: "boss@party.test", password: "wrong", ip: "9.9.9.9" })).rejects.toMatchObject({ status: 401 });
    }
    // Even the right password is blocked once the limit is hit.
    await expect(login({ email: "boss@party.test", password: "super-secret-pass", ip: "9.9.9.9" })).rejects.toMatchObject({ status: 429 });
  });
});
