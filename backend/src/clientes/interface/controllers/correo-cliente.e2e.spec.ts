/**
 * correo-cliente.e2e.spec.ts — e2e HTTP real de las 4 rutas de configuración
 * de correo por cliente (sdd/configuracion-correo-por-cliente D7):
 * GET/PATCH/DELETE `/clientes/:id/correo` y POST `/clientes/:id/correo/probar`.
 *
 * POR QUÉ EXISTE: la cobertura de guard hoy es solo ESTRUCTURAL
 * (`@UseGuards(JwtAuthGuard, GlobalAdminGuard)` a nivel de controller, ver
 * `clientes.controller.ts`) — ningún test ejercitaba el rechazo real vía
 * HTTP. Este spec sí: levanta un `INestApplication` real (`SharedModule` +
 * `ClientesModule`) contra Postgres real (`soporte_master_test`), firma JWT
 * reales (`ITokenService`) y pasa por `JwtAuthGuard`/`GlobalAdminGuard`
 * reales — ningún guard se mockea.
 *
 * ALCANCE deliberadamente liviano en infra: a diferencia de
 * `crear-cliente.e2e.spec.ts`, acá NO se provisiona ninguna DB tenant física
 * — la config SMTP vive enteramente en columnas de `master.clientes`
 * (WU2/WU3), así que sembrar la fila del cliente alcanza. El único seam es
 * `IEmailConnectionVerifier` (`EMAIL_CONNECTION_VERIFIER`): un handshake SMTP
 * real NUNCA debe correr en CI, así que se overridea con un fake controlable
 * (ok/fail) que sigue implementando el puerto real — sin castear el tipo
 * para apagar el chequeo (ver `scripts/check-casts-en-specs.mjs`).
 *
 * `EMAIL_CRYPTO_KEY` se setea acá (clave hex válida de 64 chars) porque
 * `AesGcmSecretCipher` la lee de `process.env` en CADA llamada, no al boot
 * (D2) — sin esto, cualquier `PATCH` fallaría con 503.
 *
 * Ref spec: sdd/configuracion-correo-por-cliente/spec.
 * Ref design: sdd/configuracion-correo-por-cliente D2, D6, D7.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { ClientesModule } from '../../clientes.module';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { AesGcmSecretCipher } from '../../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import {
  EMAIL_CONNECTION_VERIFIER,
  EmailConnectionConfig,
  IEmailConnectionVerifier,
  VerificationResult,
} from '../../../shared/domain/ports/i-email-connection-verifier.port';
import { TOKEN_SERVICE, ITokenService } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

/** Clave válida de 64 chars hex — nunca la real, solo para este proceso de test. */
const EMAIL_CRYPTO_KEY_DE_TEST = 'f'.repeat(64);

/**
 * Fake controlable de `IEmailConnectionVerifier` — implementa el puerto REAL
 * (no un mock parcial), así que ningún cambio de firma pasa desapercibido.
 * `outcome` se pisa por test para simular un handshake OK o fallido, SIN
 * tocar nunca un servidor SMTP real.
 */
class FakeEmailConnectionVerifier implements IEmailConnectionVerifier {
  outcome: VerificationResult = { ok: true, motivo: null };
  llamadas: EmailConnectionConfig[] = [];

  async verify(config: EmailConnectionConfig): Promise<VerificationResult> {
    this.llamadas.push(config);
    return this.outcome;
  }
}

type Headers = Record<string, string>;

async function request<T = unknown>(
  method: string,
  url: string,
  opts: { body?: unknown; headers?: Headers } = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method,
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

/** Forma de la respuesta ya parseada de JSON (Date → string ISO). */
interface CorreoResponseDto {
  configurado: boolean;
  host: string | null;
  port: number | null;
  user: string | null;
  secure: boolean | null;
  from: string | null;
  verificadoAt: string | null;
  verificacionError: string | null;
}

interface CorreoDtoInput {
  host: string;
  port: number;
  user: string;
  secure: boolean;
  from: string;
  password?: string;
}

function buildDtoCompleto(password = 'Sup3rSecreta!123'): CorreoDtoInput {
  return {
    host: 'smtp.acme.test',
    port: 587,
    user: 'notificaciones@acme.test',
    secure: false,
    from: 'no-reply@acme.test',
    password,
  };
}

interface RutaCorreo {
  nombre: string;
  method: string;
  path: (id: string) => string;
  body?: CorreoDtoInput;
}

/** Las 4 rutas de `ClientesController` bajo prueba (D7). */
const RUTAS: RutaCorreo[] = [
  { nombre: 'GET /clientes/:id/correo', method: 'GET', path: (id) => `/clientes/${id}/correo` },
  {
    nombre: 'PATCH /clientes/:id/correo',
    method: 'PATCH',
    path: (id) => `/clientes/${id}/correo`,
    body: buildDtoCompleto(),
  },
  {
    nombre: 'DELETE /clientes/:id/correo',
    method: 'DELETE',
    path: (id) => `/clientes/${id}/correo`,
  },
  {
    nombre: 'POST /clientes/:id/correo/probar',
    method: 'POST',
    path: (id) => `/clientes/${id}/correo/probar`,
  },
];

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Correo por cliente e2e — GET/PATCH/DELETE .../correo, POST .../probar (D7)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;
  let fakeVerifier: FakeEmailConnectionVerifier;
  let emailCryptoKeyOriginal: string | undefined;
  const cipher = new AesGcmSecretCipher();

  beforeAll(async () => {
    emailCryptoKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = EMAIL_CRYPTO_KEY_DE_TEST;

    fakeVerifier = new FakeEmailConnectionVerifier();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, ClientesModule],
    })
      .overrideProvider(EMAIL_CONNECTION_VERIFIER)
      .useValue(fakeVerifier)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    prismaService = moduleRef.get(PrismaService);
    masterClient = prismaService.getMasterClient();
    tokenService = moduleRef.get(TOKEN_SERVICE);
  }, 60_000);

  afterAll(async () => {
    if (emailCryptoKeyOriginal === undefined) {
      delete process.env.EMAIL_CRYPTO_KEY;
    } else {
      process.env.EMAIL_CRYPTO_KEY = emailCryptoKeyOriginal;
    }
    try {
      await app?.close();
    } catch (_err) {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }
  }, 60_000);

  beforeEach(async () => {
    fakeVerifier.outcome = { ok: true, motivo: null };
    fakeVerifier.llamadas = [];
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
  });

  // ─── Helpers ──────────────────────────────────────────────────────────

  function signRootToken(): string {
    return tokenService.signJwt(
      payloadDeTest({
        sub: `e2e-root-${randomBytes(4).toString('hex')}`,
        is_global_admin: true,
      }),
    );
  }

  function signNormalToken(): string {
    return tokenService.signJwt(
      payloadDeTest({
        sub: `e2e-normal-${randomBytes(4).toString('hex')}`,
        is_global_admin: false,
      }),
    );
  }

  async function crearCliente(suffix: string): Promise<string> {
    const cliente = await masterClient.cliente.create({
      data: {
        nombre: `E2E Correo ${suffix}`,
        dbName: `soporte_e2e_correo_${suffix}_test`,
      },
    });
    return cliente.id;
  }

  function leerFilaSmtp(clienteId: string) {
    return masterClient.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpSecure: true,
        smtpFrom: true,
        smtpPasswordCifrada: true,
        smtpConfigUpdatedAt: true,
        smtpVerificadoAt: true,
        smtpVerificacionError: true,
      },
    });
  }

  /** Configura la config completa vía la API real (PATCH), como ROOT. */
  async function configurarViaApi(clienteId: string, password: string): Promise<CorreoResponseDto> {
    const { status, data } = await request<CorreoResponseDto>(
      'PATCH',
      `${baseUrl}/clientes/${clienteId}/correo`,
      { body: buildDtoCompleto(password), headers: bearer(signRootToken()) },
    );
    expect(status).toBe(200);
    return data;
  }

  // ─── Auth — las 4 rutas, guard real ─────────────────────────────────────

  describe('Auth — JwtAuthGuard + GlobalAdminGuard reales', () => {
    it.each(RUTAS)('$nombre — sin Bearer token → 401, nada se escribe', async (ruta) => {
      const clienteId = await crearCliente(`auth-401-${randomBytes(3).toString('hex')}`);
      const antes = await leerFilaSmtp(clienteId);

      const { status } = await request(ruta.method, `${baseUrl}${ruta.path(clienteId)}`, {
        body: ruta.body,
      });

      expect(status).toBe(401);
      expect(await leerFilaSmtp(clienteId)).toEqual(antes);
    });

    it.each(RUTAS)('$nombre — token de usuario NO-root → 403, nada se escribe', async (ruta) => {
      const clienteId = await crearCliente(`auth-403-${randomBytes(3).toString('hex')}`);
      const antes = await leerFilaSmtp(clienteId);

      const { status } = await request(ruta.method, `${baseUrl}${ruta.path(clienteId)}`, {
        body: ruta.body,
        headers: bearer(signNormalToken()),
      });

      expect(status).toBe(403);
      expect(await leerFilaSmtp(clienteId)).toEqual(antes);
    });
  });

  // ─── 404 — cliente inexistente, en las 4 rutas ──────────────────────────

  describe('404 — cliente inexistente (ROOT)', () => {
    it.each(RUTAS)('$nombre — 404 si el cliente no existe', async (ruta) => {
      const idInexistente = randomUUID();

      const { status } = await request(ruta.method, `${baseUrl}${ruta.path(idInexistente)}`, {
        body: ruta.body,
        headers: bearer(signRootToken()),
      });

      expect(status).toBe(404);
    });
  });

  // ─── PATCH — alta completa ───────────────────────────────────────────────

  describe('PATCH — alta completa (ROOT)', () => {
    it('200; la respuesta NUNCA incluye la contraseña; la DB guarda ciphertext (no plaintext)', async () => {
      const clienteId = await crearCliente(`patch-alta-${randomBytes(3).toString('hex')}`);
      const password = 'Sup3rSecreta!123';

      const { status, data } = await request<CorreoResponseDto>(
        'PATCH',
        `${baseUrl}/clientes/${clienteId}/correo`,
        { body: buildDtoCompleto(password), headers: bearer(signRootToken()) },
      );

      expect(status).toBe(200);
      expect(data.configurado).toBe(true);
      expect(data.host).toBe('smtp.acme.test');
      expect(data.port).toBe(587);
      expect(data.user).toBe('notificaciones@acme.test');
      expect(data.from).toBe('no-reply@acme.test');

      const crudo = JSON.stringify(data);
      expect(crudo).not.toContain(password);
      expect(Object.keys(data)).not.toContain('password');

      const fila = await leerFilaSmtp(clienteId);
      expect(fila.smtpPasswordCifrada).not.toBeNull();
      expect(fila.smtpPasswordCifrada).not.toBe(password);
      expect(fila.smtpPasswordCifrada).not.toContain(password);
      expect(fila.smtpPasswordCifrada?.startsWith('v1:')).toBe(true);
      // La única forma de confirmar que ES la contraseña correcta sin volver
      // a exponerla en un assert legible: descifrarla con el mismo cipher/AAD.
      expect(cipher.decrypt(fila.smtpPasswordCifrada as string, clienteId)).toBe(password);
    });
  });

  // ─── GET — detalle ────────────────────────────────────────────────────────

  describe('GET — detalle (ROOT)', () => {
    it('200 con host/port/user/from + estado de verificación, nunca la contraseña', async () => {
      const clienteId = await crearCliente(`get-detalle-${randomBytes(3).toString('hex')}`);
      const password = 'Otra-Secreta!456';
      await configurarViaApi(clienteId, password);

      const { status, data } = await request<CorreoResponseDto>(
        'GET',
        `${baseUrl}/clientes/${clienteId}/correo`,
        { headers: bearer(signRootToken()) },
      );

      expect(status).toBe(200);
      expect(data.configurado).toBe(true);
      expect(data.host).toBe('smtp.acme.test');
      expect(data.port).toBe(587);
      expect(data.user).toBe('notificaciones@acme.test');
      expect(data.from).toBe('no-reply@acme.test');
      // El PATCH previo ya disparó verify() con el fake en ok:true (default).
      expect(data.verificadoAt).not.toBeNull();
      expect(data.verificacionError).toBeNull();

      expect(JSON.stringify(data)).not.toContain(password);
      expect(Object.keys(data)).not.toContain('password');
    });
  });

  // ─── PATCH — password omitida (D7) ─────────────────────────────────────

  describe('PATCH — password omitida en cliente YA configurado (D7)', () => {
    it('200; la contraseña se preserva (mismo plaintext), aunque el ciphertext cambie de bytes', async () => {
      const clienteId = await crearCliente(`patch-omitida-${randomBytes(3).toString('hex')}`);
      const password = 'Preservada!789';
      await configurarViaApi(clienteId, password);
      const filaAntes = await leerFilaSmtp(clienteId);

      const { host, user, secure, from } = buildDtoCompleto();
      const { status, data } = await request<CorreoResponseDto>(
        'PATCH',
        `${baseUrl}/clientes/${clienteId}/correo`,
        { body: { host, port: 2525, user, secure, from }, headers: bearer(signRootToken()) },
      );

      expect(status).toBe(200);
      // El resto de la config SÍ se actualiza — solo la contraseña se preserva.
      expect(data.port).toBe(2525);

      const filaDespues = await leerFilaSmtp(clienteId);
      expect(filaDespues.smtpPasswordCifrada).not.toBeNull();
      // AesGcmSecretCipher.encrypt() usa un IV aleatorio en CADA llamada (ver
      // aes-gcm-secret-cipher.ts): save() siempre re-cifra el plaintext
      // recuperado, así que el ciphertext NO es idéntico byte a byte al
      // anterior — pero decodifica exactamente al MISMO plaintext, que es lo
      // que "omitted password preserves ciphertext" (D7) promete.
      expect(filaDespues.smtpPasswordCifrada).not.toBe(filaAntes.smtpPasswordCifrada);
      expect(cipher.decrypt(filaDespues.smtpPasswordCifrada as string, clienteId)).toBe(password);
    });
  });

  // ─── PATCH — 400 (contrato de password) ─────────────────────────────────

  describe('PATCH — 400 (contrato de password, D7)', () => {
    it('password omitida en cliente NO configurado → 400 (nada que preservar)', async () => {
      const clienteId = await crearCliente(`patch-sin-config-${randomBytes(3).toString('hex')}`);
      const { host, port, user, secure, from } = buildDtoCompleto();

      const { status } = await request('PATCH', `${baseUrl}/clientes/${clienteId}/correo`, {
        body: { host, port, user, secure, from },
        headers: bearer(signRootToken()),
      });

      expect(status).toBe(400);
    });

    it('password vacía ("") → 400 — un string vacío NUNCA es "borrar"', async () => {
      const clienteId = await crearCliente(`patch-vacia-${randomBytes(3).toString('hex')}`);

      const { status } = await request('PATCH', `${baseUrl}/clientes/${clienteId}/correo`, {
        body: buildDtoCompleto(''),
        headers: bearer(signRootToken()),
      });

      expect(status).toBe(400);
    });
  });

  // ─── POST /correo/probar — handshake bajo demanda ───────────────────────

  describe('POST /correo/probar — handshake bajo demanda (fake verifier)', () => {
    it('verifier OK → 200, el resultado persiste, la config NO se toca', async () => {
      const clienteId = await crearCliente(`probar-ok-${randomBytes(3).toString('hex')}`);
      await configurarViaApi(clienteId, 'Password!Ok1');
      const filaAntes = await leerFilaSmtp(clienteId);
      fakeVerifier.outcome = { ok: true, motivo: null };

      const { status, data } = await request<CorreoResponseDto>(
        'POST',
        `${baseUrl}/clientes/${clienteId}/correo/probar`,
        { headers: bearer(signRootToken()) },
      );

      expect(status).toBe(200);
      expect(data.verificacionError).toBeNull();
      expect(data.verificadoAt).not.toBeNull();

      const filaDespues = await leerFilaSmtp(clienteId);
      expect(filaDespues.smtpHost).toBe(filaAntes.smtpHost);
      expect(filaDespues.smtpPasswordCifrada).toBe(filaAntes.smtpPasswordCifrada);
      expect(filaDespues.smtpConfigUpdatedAt).toEqual(filaAntes.smtpConfigUpdatedAt);
    });

    it('verifier FALLA → 200, el motivo saneado persiste, la config no se toca', async () => {
      const clienteId = await crearCliente(`probar-fail-${randomBytes(3).toString('hex')}`);
      await configurarViaApi(clienteId, 'Password!Fail1');
      const filaAntes = await leerFilaSmtp(clienteId);
      fakeVerifier.outcome = { ok: false, motivo: 'Credenciales rechazadas por el servidor' };

      const { status, data } = await request<CorreoResponseDto>(
        'POST',
        `${baseUrl}/clientes/${clienteId}/correo/probar`,
        { headers: bearer(signRootToken()) },
      );

      expect(status).toBe(200);
      expect(data.verificacionError).toBe('Credenciales rechazadas por el servidor');

      const filaDespues = await leerFilaSmtp(clienteId);
      expect(filaDespues.smtpHost).toBe(filaAntes.smtpHost);
      expect(filaDespues.smtpPasswordCifrada).toBe(filaAntes.smtpPasswordCifrada);
    });

    it('cliente sin config guardada → 400, sin invocar el verifier', async () => {
      const clienteId = await crearCliente(`probar-sin-config-${randomBytes(3).toString('hex')}`);
      fakeVerifier.llamadas = [];

      const { status } = await request('POST', `${baseUrl}/clientes/${clienteId}/correo/probar`, {
        headers: bearer(signRootToken()),
      });

      expect(status).toBe(400);
      expect(fakeVerifier.llamadas).toHaveLength(0);
    });
  });

  // ─── DELETE — remoción explícita ─────────────────────────────────────────

  describe('DELETE — remoción explícita (ROOT)', () => {
    it('200 con configurado=false; limpia las 9 columnas SMTP; un probar posterior → 400', async () => {
      const clienteId = await crearCliente(`delete-${randomBytes(3).toString('hex')}`);
      await configurarViaApi(clienteId, 'Password!Delete1');

      const { status, data } = await request<CorreoResponseDto>(
        'DELETE',
        `${baseUrl}/clientes/${clienteId}/correo`,
        { headers: bearer(signRootToken()) },
      );

      expect(status).toBe(200);
      expect(data.configurado).toBe(false);
      expect(data.host).toBeNull();

      const fila = await leerFilaSmtp(clienteId);
      expect(fila.smtpHost).toBeNull();
      expect(fila.smtpPort).toBeNull();
      expect(fila.smtpUser).toBeNull();
      expect(fila.smtpSecure).toBeNull();
      expect(fila.smtpFrom).toBeNull();
      expect(fila.smtpPasswordCifrada).toBeNull();
      expect(fila.smtpConfigUpdatedAt).toBeNull();
      expect(fila.smtpVerificadoAt).toBeNull();
      expect(fila.smtpVerificacionError).toBeNull();

      const probarRes = await request('POST', `${baseUrl}/clientes/${clienteId}/correo/probar`, {
        headers: bearer(signRootToken()),
      });
      expect(probarRes.status).toBe(400);
    });
  });
});
