// @vitest-environment node
// Reason: verify.ts uses jose (Uint8Array-based crypto). The jsdom environment
// introduces a Uint8Array realm mismatch that breaks TextEncoder output checks
// inside jose's FlattenedSign constructor. Node environment uses a single realm.
/**
 * Tests for verifyAccessToken
 * Spec: [SPEC:frontend-route-protection/jose-verificacion]
 *       [SPEC:frontend-route-protection/jose-verificacion no jsonwebtoken]
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mintToken, mintExpired, mintInvalid } from "../../../test/helpers/jwt";
import { verifyAccessToken } from "./verify";

beforeAll(() => {
  // verify.ts reads JWT_SECRET at call time (not module-eval time).
  // Set it to match the test helper's default secret so tokens mint and verify
  // with the same key.
  process.env.JWT_SECRET =
    process.env.TEST_JWT_SECRET ?? "test-secret-for-unit-tests-only";
});

const BASE_PAYLOAD = {
  sub: "1",
  cliente_id: "c1",
  email: "test@example.com",
  roles: ["USER"],
  permisos: ["ticket:ver"],
};

describe("verifyAccessToken", () => {
  it("returns JwtPayload for a valid, non-expired token", async () => {
    const token = await mintToken(BASE_PAYLOAD);
    const result = await verifyAccessToken(token);
    expect(result).toMatchObject(BASE_PAYLOAD);
  });

  it("returns 'expired' for a token past its expiry", async () => {
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
