/**
 * verifyAccessToken — jose-based JWT verification for the middleware (Edge Runtime).
 *
 * jose is isomorphic and Edge-ready (no Node.js-only APIs).
 * Abstraction note: swap `TextEncoder` secret for `importSPKI`/`createRemoteJWKSet`
 * here (one line) if the backend ever migrates from HS256 to RS256.
 *
 * Spec: [SPEC:frontend-route-protection/jose-verificacion]
 *       [SPEC:frontend-route-protection/jose-verificacion no jsonwebtoken]
 */
import { jwtVerify, errors } from "jose";
import type { JwtPayload } from "@/shared/api/types";

export type VerifyResult = JwtPayload | "expired" | "invalid";

/**
 * Verify an access token.
 *
 * Returns:
 *   - `JwtPayload` — token is valid and not expired
 *   - `'expired'`  — token is well-formed but past its `exp` claim (JWTExpired)
 *   - `'invalid'`  — token is malformed, has a bad signature, or any other error
 *
 * Reads `JWT_SECRET` from `process.env` at call time so that the test environment
 * can set it in `beforeAll` without race conditions.
 */
export async function verifyAccessToken(token: string): Promise<VerifyResult> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    return payload as unknown as JwtPayload;
  } catch (err) {
    if (err instanceof errors.JWTExpired) {
      return "expired";
    }
    return "invalid";
  }
}
