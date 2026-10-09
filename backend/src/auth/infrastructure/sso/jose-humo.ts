import { SignJWT, jwtVerify, generateKeyPair } from 'jose';

/**
 * Spike del gate ESM de `jose` (ADR-2): firma y verifica un token RS256 con un par de claves
 * generado. Solo imports nombrados, nunca un import por defecto. Se borra en la WU-2b, cuando
 * `JoseProveedorOidc` lo reemplaza.
 */
export async function humo(): Promise<string> {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({ humo: 'ok' })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setExpirationTime('1m')
    .sign(privateKey);
  const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
  return String(payload.humo);
}
