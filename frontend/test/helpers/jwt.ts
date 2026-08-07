import { SignJWT } from "jose";

/**
 * Test JWT minting helpers — mirror the backend's `JwtPayload` shape (ADR-3,
 * `sdd/auth-multitenancy/design`): `rol` is singular, `cliente_id` may be
 * `null` (root/master token), `membresias[]` feeds the tenant switcher.
 */

const TEST_JWT_SECRET =
  process.env.TEST_JWT_SECRET ?? "test-secret-for-unit-tests-only";
const secret = new TextEncoder().encode(TEST_JWT_SECRET);

export interface TestTokenPayload {
  sub: string;
  cliente_id: string | null;
  rol: string | null;
  permisos: string[];
  is_global_admin: boolean;
  cliente_nombre: string | null;
  membresias: { cliente_id: string; nombre: string; rol: string }[];
  [key: string]: unknown;
}

/** Mint a valid, non-expired JWT signed with TEST_JWT_SECRET. */
export async function mintToken(
  payload: TestTokenPayload,
  opts?: { expiresIn?: string },
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn ?? "15m")
    .sign(secret);
}

/** Mint an already-expired JWT. */
export async function mintExpired(payload: TestTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(new Date(Date.now() - 1000 * 60 * 30)) // issued 30min ago
    .setExpirationTime(new Date(Date.now() - 1000 * 60 * 15)) // expired 15min ago
    .sign(secret);
}

/** Mint a JWT signed with a wrong secret (invalid signature). */
export async function mintInvalid(
  payload?: Partial<TestTokenPayload>,
): Promise<string> {
  const wrongSecret = new TextEncoder().encode("wrong-secret-not-matching");
  return new SignJWT({
    sub: "1",
    cliente_id: "c1",
    rol: "USUARIO",
    permisos: [],
    is_global_admin: false,
    cliente_nombre: "Cliente Uno",
    membresias: [],
    ...payload,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(wrongSecret);
}
