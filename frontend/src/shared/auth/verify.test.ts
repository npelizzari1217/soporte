// @vitest-environment node
// Reason: verify.ts uses jose (Uint8Array-based crypto). The jsdom environment
// introduces a Uint8Array realm mismatch that breaks TextEncoder output checks
// inside jose's sign/verify path. Node environment uses a single realm.
/**
 * Tests for verifyAccessToken.
 * Spec: [R26] Middleware Edge (jose) — MUST verify with jose (HS256), never jsonwebtoken.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mintToken, mintExpired, mintInvalid } from "../../../test/helpers/jwt";
import { verifyAccessToken } from "./verify";

beforeAll(() => {
  // verify.ts reads JWT_SECRET at call time (not module-eval time).
  process.env.JWT_SECRET =
    process.env.TEST_JWT_SECRET ?? "test-secret-for-unit-tests-only";
});

const BASE_PAYLOAD = {
  sub: "1",
  cliente_id: "c1",
  rol: "ADMINISTRADOR",
  permisos: ["ticket:crear"],
  is_global_admin: false,
  cliente_nombre: "Cliente Uno",
  membresias: [{ cliente_id: "c1", nombre: "Cliente Uno", rol: "ADMINISTRADOR" }],
};

describe("verifyAccessToken", () => {
  it("returns the decoded JwtPayload for a valid, non-expired token", async () => {
    const token = await mintToken(BASE_PAYLOAD);
    const result = await verifyAccessToken(token);
    expect(result).toMatchObject(BASE_PAYLOAD);
  });

  it("returns the root-master shape (cliente_id/rol null, permisos empty) unchanged", async () => {
    const rootPayload = {
      sub: "root-1",
      cliente_id: null,
      rol: null,
      permisos: [],
      is_global_admin: true,
      cliente_nombre: null,
      membresias: [],
    };
    const token = await mintToken(rootPayload);
    const result = await verifyAccessToken(token);
    expect(result).toMatchObject(rootPayload);
  });

  it("returns 'expired' for a token past its exp claim", async () => {
    const token = await mintExpired(BASE_PAYLOAD);
    const result = await verifyAccessToken(token);
    expect(result).toBe("expired");
  });

  it("returns 'invalid' for a token signed with the wrong secret", async () => {
    const token = await mintInvalid();
    const result = await verifyAccessToken(token);
    expect(result).toBe("invalid");
  });

  it("returns 'invalid' for a malformed string (not a JWT)", async () => {
    const result = await verifyAccessToken("not-a-jwt-at-all");
    expect(result).toBe("invalid");
  });
});
