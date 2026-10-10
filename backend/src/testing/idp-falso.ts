import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, JWK, SignJWT } from 'jose';

/** Como se firma el ID token: `RS256` con la clave del IdP, con otra clave, `HS256` o sin firma. */
export type FirmaIdToken = 'RS256' | 'RS256-clave-ajena' | 'HS256' | 'none';

export interface IdpFalso {
  /** `http://127.0.0.1:<puerto>/token` y `/jwks`. */
  readonly urlToken: string;
  readonly urlJwks: string;
  /** Cuerpos (form-urlencoded, ya parseados) de cada llamada al `/token`, en orden. */
  readonly llamadasToken: URLSearchParams[];
  /** Firma un ID token; `iat` y `exp` (5 min) se completan salvo que `claims` los traiga. */
  firmar(claims: Record<string, unknown>, firma?: FirmaIdToken): Promise<string>;
  /** Lo que el `/token` devuelve a partir de ahora: un `id_token` con 200, o un estado de error. */
  responderToken(respuesta: { idToken: string } | { estado: number }): void;
  cerrar(): Promise<void>;
}

const KID = 'idp-falso-1';

function leerCuerpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')));
    req.on('error', reject);
  });
}

function base64Url(texto: string): string {
  return Buffer.from(texto).toString('base64url');
}

/**
 * IdP OIDC falso en `127.0.0.1` con puerto efimero (sdd/login-sso, ADR-2). Sirve `/jwks` y
 * `/token`; queda fuera del build (`tsconfig.build.json` excluye `src/testing/**`).
 */
export async function iniciarIdpFalso(): Promise<IdpFalso> {
  const par = await generateKeyPair('RS256');
  const ajena = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(par.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  const secretoHmac = new TextEncoder().encode('secreto-hmac-del-idp-falso-32-bytes!!');
  const llamadasToken: URLSearchParams[] = [];
  let respuesta: { idToken: string } | { estado: number } = { estado: 500 };

  const servidor: Server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/jwks') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwk] }));
      } else if (req.url === '/token' && req.method === 'POST') {
        llamadasToken.push(new URLSearchParams(await leerCuerpo(req)));
        if ('idToken' in respuesta) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id_token: respuesta.idToken, token_type: 'Bearer' }));
        } else {
          res.writeHead(respuesta.estado);
          res.end();
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    })();
  });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  return {
    urlToken: `${base}/token`,
    urlJwks: `${base}/jwks`,
    llamadasToken,
    async firmar(claims, firma = 'RS256') {
      const ahora = Math.floor(Date.now() / 1000);
      const payload = { iat: ahora, exp: ahora + 300, ...claims };
      if (firma === 'none') {
        return `${base64Url('{"alg":"none"}')}.${base64Url(JSON.stringify(payload))}.`;
      }
      const jwt = new SignJWT(payload);
      if (firma === 'HS256') return jwt.setProtectedHeader({ alg: 'HS256' }).sign(secretoHmac);
      const clave: CryptoKey = firma === 'RS256' ? par.privateKey : ajena.privateKey;
      return jwt.setProtectedHeader({ alg: 'RS256', kid: KID }).sign(clave);
    },
    responderToken(nueva) {
      respuesta = nueva;
    },
    cerrar: () =>
      new Promise<void>((resolve, reject) => {
        servidor.close((error) => (error ? reject(error) : resolve()));
        servidor.closeAllConnections();
      }),
  };
}
