/**
 * recuperacion-password.e2e.spec.ts — E2E real de punta a punta (HTTP →
 * `RecuperacionPasswordThrottlerGuard` → `RecuperacionPasswordController` →
 * `SolicitarResetPasswordUseCase` → Prisma REAL contra `soporte_master_test`)
 * de `POST /auth/forgot-password` (WU-7, tarea 7.4).
 *
 * Arma su propio `TestHarnessModule` importando `RecuperacionPasswordModule`
 * directamente — molde `csat.e2e.spec.ts:91` (ADR-1: el módulo NO se
 * registra en `app.module.ts` hasta WU-11). `POST /auth/reset-password`
 * (confirmación, WU-8) reusa el mismo harness: `RecuperacionPasswordModule`
 * importa `AuthModule`, así que `POST /auth/login` (`AuthController`,
 * también declarado ahí) queda montado gratis en este mismo `app` — hace
 * falta para probar que el login usa la clave nueva tras el reset.
 *
 * Cubre la "Superficie de abuso" del design que le toca a WU-7 y WU-8: la
 * respuesta de la solicitud llega con el mail bloqueado sin esperarlo; las 7
 * ramas dan una respuesta idéntica byte a byte; el tracker es SOLO el email
 * o el token (sin bypass por `x-forwarded-for`, sin cupo compartido entre
 * identificadores); el link nunca refleja un `Host` manipulado (carry-over
 * de WU-3); un token vencido y uno inexistente dan el mismo 400; dos
 * confirmaciones concurrentes con el mismo token cambian la clave a lo sumo
 * una vez.
 *
 * Sin DB de tenant: `ICorreoDeCliente` nunca ejecuta una query real contra
 * el tenant (`TenantContext.run` es solo `AsyncLocalStorage`, y
 * `EMAIL_SENDER` se overridea acá). `soporte_master_test` (COMPARTIDA) se
 * trunca en `beforeEach` — requiere `usarLockMasterTest()`. Emails/tokens
 * DISTINTOS por test: el storage del throttler vive mientras vive la app.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme", "La solicitud no filtra
 * información por tiempo de respuesta", "El link de reset se construye solo
 * desde APP_BASE_URL", "Confirmar cambia la contraseña como máximo una vez
 * bajo concurrencia", "Confirmar con un token inválido responde igual sin
 * importar la causa", "La contraseña nueva respeta el mínimo de alta y usa
 * el hasher del login", "Las sesiones se revocan tras un reset exitoso sin
 * condicionar la respuesta", "Un reset exitoso dispara un mail de
 * confirmación", "Ambas rutas aplican rate limiting propio". Ref design:
 * ADR-1, ADR-2, ADR-3, ADR-5, ADR-7. Tarea: 7.4, 8.3.
 */
import { createHash, randomBytes } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { RecuperacionPasswordModule } from '../../recuperacion-password.module';
import {
  EMAIL_SENDER,
  EmailMessage,
  IEmailSender,
} from '../../../shared/domain/ports/i-email-sender';
import { TAREAS_SEGUNDO_PLANO } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
// Tipo CONCRETO (no `ITareasSegundoPlano`): `esperarPendientes()` es un
// detalle de `TareasSegundoPlano`, no del puerto — hace falta para esperar
// el trabajo diferido sin `sleep`.
import { TareasSegundoPlano } from '../../../shared/infrastructure/segundo-plano/tareas-segundo-plano';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { Argon2HashProvider } from '../../infrastructure/argon2-hash.provider';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import { entorno } from '../../../config/entorno';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// `entorno.APP_BASE_URL`, no un literal: el valor real de test viene de
// `.env.test` — leerlo de `entorno` es lo que prueba de verdad que el link
// nunca sale del header `Host`.
const APP_BASE_URL = entorno.APP_BASE_URL;

class FakeEmailSender implements IEmailSender {
  enviados: EmailMessage[] = [];
  private impl: (msg: EmailMessage) => Promise<void> = async (msg) => {
    this.enviados.push(msg);
  };

  /** Cambia el comportamiento de `send` para el próximo/los próximos envíos. */
  setImpl(impl: (msg: EmailMessage) => Promise<void>): void {
    this.impl = impl;
  }

  reset(): void {
    this.enviados = [];
    this.impl = async (msg) => {
      this.enviados.push(msg);
    };
  }

  async send(msg: EmailMessage): Promise<void> {
    return this.impl(msg);
  }
}

// `http.request` crudo, NO `fetch`: undici fuerza el `Host` real de la
// conexión y descarta cualquier `Host` explícito en silencio (header
// "forbidden" del spec fetch) — el test de abuso "link con Host" necesita
// mandarlo tal cual.
interface HttpResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

/** POST genérico contra `baseUrl + path`; reusado por las tres rutas del harness (forgot/reset/login). */
async function postJson(
  baseUrl: string,
  path: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  const url = new URL(path, baseUrl);
  const body = JSON.stringify(payload);

  return new Promise<HttpResult>((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...extraHeaders,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString('utf8');
        });
        res.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === 'string') headers[key] = value;
          }
          delete headers.date;
          resolve({ status: res.statusCode ?? 0, body: data, headers });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function postForgotPassword(
  baseUrl: string,
  email: string,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  return postJson(baseUrl, '/auth/forgot-password', { email }, extraHeaders);
}

/** WU-8, tarea 8.3. */
function postResetPassword(
  baseUrl: string,
  token: string,
  passwordNueva: string,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResult> {
  return postJson(baseUrl, '/auth/reset-password', { token, passwordNueva }, extraHeaders);
}

/** WU-8, tarea 8.3 — `AuthController` llega gratis vía `AuthModule` (ver JSDoc del archivo). */
function postLogin(baseUrl: string, email: string, password: string): Promise<HttpResult> {
  return postJson(baseUrl, '/auth/login', { email, password });
}

function emailUnico(sufijo: string): string {
  return `reset-e2e-${sufijo}-${randomBytes(4).toString('hex')}@integration.test`;
}

/** WU-8: extrae el token crudo del link `#token=<hex>` de un mail enviado. */
function extraerToken(mensaje: EmailMessage): string {
  const fuente = mensaje.html ?? mensaje.text;
  const match = /#token=([0-9a-f]{64})/.exec(fuente);
  if (!match) throw new Error('No se encontró el token en el mensaje enviado.');
  return match[1];
}

function sha256Hex(valor: string): string {
  return createHash('sha256').update(valor).digest('hex');
}

/** WU-8: hash real (no `'hash-fake'`) para poder loguear antes/después del reset. */
const hashProvider = new Argon2HashProvider();

@Module({ imports: [SharedModule, RecuperacionPasswordModule] })
class TestHarnessModule {}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('POST /auth/forgot-password e2e (WU-7, 7.4)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let tareas: TareasSegundoPlano;
  let fakeEmailSender: FakeEmailSender;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    fakeEmailSender = new FakeEmailSender();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(fakeEmailSender)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    tareas = moduleRef.get<TareasSegundoPlano>(TAREAS_SEGUNDO_PLANO);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
  }, 30_000);

  beforeEach(async () => {
    // `password_reset_tokens` tiene FK CASCADE a `usuarios` — el TRUNCATE de
    // `usuarios` la alcanza sin nombrarla, mismo criterio que `auth.e2e.spec.ts:207`.
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuarios, clientes, roles, usuario_cliente_permisos RESTART IDENTITY CASCADE',
    );
    fakeEmailSender.reset();
  });

  // ─── Fixtures ────────────────────────────────────────────────────────────

  async function crearCliente(
    suffix: string,
    overrides: Partial<{ activo: boolean; conSmtp: boolean }> = {},
  ): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Reset ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_reset_e2e_${suffix}_${randomBytes(3).toString('hex')}`,
      activo: overrides.activo ?? true,
    });
    await clienteRepo.save(cliente);

    if (overrides.conSmtp) {
      // Todo-o-nada (CHECK de `schema.prisma`): las 5 columnas SMTP viajan
      // juntas. Nunca se descifra en este test: `EMAIL_SENDER` está overrideado.
      await masterClient.cliente.update({
        where: { id: cliente.id },
        data: {
          smtpHost: 'smtp.integration.test',
          smtpPort: 587,
          smtpUser: 'reset@integration.test',
          smtpFrom: 'no-reply@integration.test',
          smtpPasswordCifrada: 'v1:fake:fake:fake',
        },
      });
    }

    return cliente;
  }

  async function crearRole(suffix: string): Promise<string> {
    const role = await masterClient.role.create({
      data: { codigo: `RESET_E2E_${suffix}`, nombre: `RESET_E2E_${suffix}` },
    });
    return role.id;
  }

  async function crearUsuario(
    suffix: string,
    overrides: Partial<{ activo: boolean }> = {},
  ): Promise<{ id: string; email: string }> {
    const email = emailUnico(suffix);
    const usuario = UsuarioEntity.create({
      email,
      nombre: 'Reset',
      apellido: 'E2E',
      passwordHash: 'hash-fake',
      activo: overrides.activo ?? true,
    });
    await usuarioRepo.save(usuario);
    return { id: usuario.id, email };
  }

  async function crearMembresia(
    usuarioId: string,
    clienteId: string,
    rolId: string,
  ): Promise<void> {
    await masterClient.membresia.create({ data: { usuarioId, clienteId, rolId, activo: true } });
  }

  /** 1 membresía activa en un cliente con SMTP configurado (rama LISTO). */
  async function crearUsuarioListo(suffix: string, rolId: string): Promise<string> {
    const { id, email } = await crearUsuario(suffix);
    const cliente = await crearCliente(suffix, { conSmtp: true });
    await crearMembresia(id, cliente.id, rolId);
    return email;
  }

  /**
   * WU-8: variante de `crearUsuarioListo` con un `passwordHash` REAL (Argon2,
   * no `'hash-fake'`) — hace falta para el e2e de confirmación, que loguea
   * antes y después del reset.
   */
  async function crearUsuarioListoConPassword(
    suffix: string,
    rolId: string,
    password: string,
  ): Promise<{ id: string; email: string }> {
    const email = emailUnico(suffix);
    const usuario = UsuarioEntity.create({
      email,
      nombre: 'Reset',
      apellido: 'E2E',
      passwordHash: await hashProvider.hash(password),
      activo: true,
    });
    await usuarioRepo.save(usuario);
    const cliente = await crearCliente(suffix, { conSmtp: true });
    await crearMembresia(usuario.id, cliente.id, rolId);
    return { id: usuario.id, email };
  }

  /** WU-8: solicita el reset, espera el mail y devuelve el token crudo capturado. */
  async function solicitarYCapturarToken(
    suffix: string,
    rolId: string,
    password: string,
  ): Promise<{ id: string; email: string; token: string }> {
    const { id, email } = await crearUsuarioListoConPassword(suffix, rolId, password);
    const { status } = await postForgotPassword(baseUrl, email);
    expect(status).toBe(204);
    await tareas.esperarPendientes();
    const mensaje = fakeEmailSender.enviados[fakeEmailSender.enviados.length - 1];
    if (!mensaje) throw new Error('mail de solicitud no enviado');
    return { id, email, token: extraerToken(mensaje) };
  }

  // ─── 1. Las 7 ramas dan una respuesta idéntica byte a byte ─────────────

  it('[abuso: respuesta difiere por rama] las 7 ramas (6 sin mail + 1 con mail) dan 204 idéntico: mismo status, cuerpo y headers (sin Date)', async () => {
    const rol = await crearRole('branches');
    const emails: string[] = [emailUnico('inexistente')]; // CUENTA_INEXISTENTE

    emails.push((await crearUsuario('inactivo', { activo: false })).email); // CUENTA_NO_DISPONIBLE
    emails.push((await crearUsuario('cero-membresias')).email); // MEMBRESIAS_0

    {
      const { id, email } = await crearUsuario('dos-membresias'); // MEMBRESIAS_N
      const [ca, cb] = [await crearCliente('n-a'), await crearCliente('n-b')];
      await crearMembresia(id, ca.id, rol);
      await crearMembresia(id, cb.id, rol);
      emails.push(email);
    }

    {
      const { id, email } = await crearUsuario('sin-correo'); // CLIENTE_SIN_CORREO
      const cliente = await crearCliente('sin-correo');
      await crearMembresia(id, cliente.id, rol);
      emails.push(email);
    }

    {
      const { id, email } = await crearUsuario('cliente-baja'); // CLIENTE_NO_DISPONIBLE
      const cliente = await crearCliente('baja', { activo: false });
      await crearMembresia(id, cliente.id, rol);
      emails.push(email);
    }

    emails.push(await crearUsuarioListo('listo', rol)); // MAIL_DESPACHADO

    const respuestas = await Promise.all(emails.map((email) => postForgotPassword(baseUrl, email)));
    const [primera, ...resto] = respuestas;
    expect(primera.status).toBe(204);
    expect(primera.body).toBe('');
    for (const respuesta of resto) {
      expect(respuesta.status).toBe(primera.status);
      expect(respuesta.body).toBe(primera.body);
      expect(respuesta.headers).toEqual(primera.headers);
    }

    // Solo la rama LISTO despacha mail — confirma que el fixture ejercitó de
    // verdad esa rama, no que las 7 "casualmente" no la alcanzaron.
    await tareas.esperarPendientes();
    expect(fakeEmailSender.enviados).toHaveLength(1);
  });

  // ─── 2. Envío bloqueado no retrasa la respuesta + el link nunca refleja Host ──

  it('[abuso: trabajo de rama antes de responder + link con Host] 204 llega con el mail bloqueado, y el link nunca refleja el Host manipulado', async () => {
    const rol = await crearRole('bh');
    const email = await crearUsuarioListo('bloqueado-host', rol);

    let liberar: (() => void) | undefined;
    const bloqueado = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    fakeEmailSender.setImpl(async (msg) => {
      await bloqueado;
      fakeEmailSender.enviados.push(msg);
    });

    const hostMalicioso = 'evil.attacker.example';
    const { status, body } = await postForgotPassword(baseUrl, email, { Host: hostMalicioso });
    expect(status).toBe(204);
    expect(body).toBe('');
    // Todavía bloqueado: si la respuesta hubiera esperado el envío, no
    // habría llegado — la aserción de arriba ya lo prueba.
    expect(fakeEmailSender.enviados).toHaveLength(0);

    liberar?.();
    await tareas.esperarPendientes();

    const [mensaje] = fakeEmailSender.enviados;
    expect(mensaje.html).toContain(`${APP_BASE_URL}/restablecer-password#token=`);
    expect(mensaje.text).toContain(`${APP_BASE_URL}/restablecer-password#token=`);
    expect(mensaje.html ?? '').not.toContain(hostMalicioso);
    expect(mensaje.text).not.toContain(hostMalicioso);
  });

  // ─── 3. Throttle: solo el email cuenta ──────────────────────────────────

  it('[abuso: bypass del límite + tracker con xff] el 4.º intento del mismo email da 429 pase lo que pase con x-forwarded-for; otro email no comparte cupo', async () => {
    const email = emailUnico('throttle');
    const otroEmail = emailUnico('throttle-otro');

    // Secuencial a propósito: el cupo es 3/15min y lo que importa acá es el
    // ORDEN de consumo, no la concurrencia (eso ya lo cubre WU-2 sobre el CAS
    // del token, el borde concurrente real de este cambio).
    for (const xff of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      const { status } = await postForgotPassword(baseUrl, email, { 'x-forwarded-for': xff });
      expect(status).toBe(204);
    }

    const cuarto = await postForgotPassword(baseUrl, email, { 'x-forwarded-for': '10.0.0.4' });
    expect(cuarto.status).toBe(429);

    const otro = await postForgotPassword(baseUrl, otroEmail);
    expect(otro.status).toBe(204);
  });

  it('email mal formado: 400 de validación', async () => {
    const { status } = await postForgotPassword(baseUrl, 'no-es-un-email');
    expect(status).toBe(400);
  });

  // ─── WU-8 — POST /auth/reset-password (tarea 8.3) ───────────────────────

  describe('POST /auth/reset-password e2e (WU-8, 8.3)', () => {
    it('flujo completo: login con la clave nueva y falla con la vieja; reusar el token da 400; sesiones revocadas; mail de confirmación enviado', async () => {
      const rol = await crearRole('flujo');
      const passwordVieja = 'ViejaClave123';
      const passwordNueva = 'NuevaClaveReset123';
      const { id, email, token } = await solicitarYCapturarToken('flujo', rol, passwordVieja);

      const loginPrevio = await postLogin(baseUrl, email, passwordVieja);
      expect(loginPrevio.status).toBe(200);

      const confirmacion = await postResetPassword(baseUrl, token, passwordNueva);
      expect(confirmacion.status).toBe(204);
      expect(confirmacion.body).toBe('');

      // Sesiones revocadas ANTES de loguear de nuevo (un login post-reset
      // crea su propio refresh token vigente, y falsearía este conteo).
      const tokensVigentes = await masterClient.refreshToken.findMany({
        where: { usuarioId: id, revokedAt: null },
      });
      expect(tokensVigentes).toHaveLength(0);

      // Mail de confirmación: la tarea de fondo del reset ya se encoló.
      await tareas.esperarPendientes();
      const mailConfirmacion = fakeEmailSender.enviados.find(
        (m) => m.to === email && !/#token=/.test(m.html ?? m.text),
      );
      expect(mailConfirmacion).toBeDefined();

      // Login funciona con la clave nueva y falla con la vieja.
      expect((await postLogin(baseUrl, email, passwordNueva)).status).toBe(200);
      expect((await postLogin(baseUrl, email, passwordVieja)).status).toBe(401);

      // [abuso: doble reset] reusar el mismo token ya consumido da 400.
      const reuso = await postResetPassword(baseUrl, token, 'OtraClaveMas123');
      expect(reuso.status).toBe(400);
    });

    it('[W1] passwordNueva con menos de 8 caracteres → 400 (ValidationPipe), sin tocar password_hash ni consumir el token', async () => {
      const rol = await crearRole('corta');
      const { id, token } = await solicitarYCapturarToken('corta', rol, 'ClaveOriginal123');
      const hashAntes = (await masterClient.usuario.findUnique({ where: { id } }))?.passwordHash;

      const { status } = await postResetPassword(baseUrl, token, 'corta');

      expect(status).toBe(400);
      expect((await masterClient.usuario.findUnique({ where: { id } }))?.passwordHash).toBe(
        hashAntes,
      );
      const fila = await masterClient.passwordResetToken.findUnique({
        where: { tokenHash: sha256Hex(token) },
      });
      expect(fila?.usedAt).toBeNull();
    });

    it('[abuso: causa del rechazo expuesta] un token vencido y uno inexistente dan 400 byte a byte idénticos', async () => {
      const rol = await crearRole('vencido');
      const { token } = await solicitarYCapturarToken('vencido', rol, 'ClaveOriginal123');

      await masterClient.passwordResetToken.updateMany({
        where: { tokenHash: sha256Hex(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const tokenDesconocido = randomBytes(32).toString('hex');
      const [vencido, desconocido] = await Promise.all([
        postResetPassword(baseUrl, token, 'ClaveNuevaX123'),
        postResetPassword(baseUrl, tokenDesconocido, 'ClaveNuevaX123'),
      ]);

      expect(vencido.status).toBe(400);
      expect(desconocido.status).toBe(400);
      expect(vencido.body).toBe(desconocido.body);
      expect(vencido.headers).toEqual(desconocido.headers);
    });

    it('[abuso: doble reset] dos confirmaciones concurrentes con el mismo token: exactamente una da 204', async () => {
      const rol = await crearRole('concurrente');
      const { email, token } = await solicitarYCapturarToken(
        'concurrente',
        rol,
        'ClaveOriginal123',
      );

      const [a, b] = await Promise.all([
        postResetPassword(baseUrl, token, 'ClaveGanadoraA1'),
        postResetPassword(baseUrl, token, 'ClaveGanadoraB1'),
      ]);

      const exitosas = [a, b].filter((r) => r.status === 204);
      const rechazadas = [a, b].filter((r) => r.status === 400);
      expect(exitosas).toHaveLength(1);
      expect(rechazadas).toHaveLength(1);

      // Solo la clave de la respuesta ganadora verifica login (CAS real).
      const claveGanadora = a.status === 204 ? 'ClaveGanadoraA1' : 'ClaveGanadoraB1';
      const claveDescartada = a.status === 204 ? 'ClaveGanadoraB1' : 'ClaveGanadoraA1';
      expect((await postLogin(baseUrl, email, claveGanadora)).status).toBe(200);
      expect((await postLogin(baseUrl, email, claveDescartada)).status).toBe(401);
    });

    it('[abuso: bypass del límite] el 6.º intento con el mismo token da 429', async () => {
      const tokenNuncaEmitido = randomBytes(32).toString('hex');

      for (let intento = 0; intento < 5; intento += 1) {
        const { status } = await postResetPassword(baseUrl, tokenNuncaEmitido, 'ClaveX1234567');
        expect(status).toBe(400);
      }

      const sexto = await postResetPassword(baseUrl, tokenNuncaEmitido, 'ClaveX1234567');
      expect(sexto.status).toBe(429);
    });
  });
});
