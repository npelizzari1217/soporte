/**
 * sso.e2e.spec.ts — WU-5a (sdd/login-sso, SC2, SC3, SL9, SL13).
 *
 * `SsoController` por HTTP real contra un IdP falso (`src/testing/idp-falso.ts`) inyectado por
 * `CONFIGURACION_SSO`. GOOGLE esta habilitado; MICROSOFT solo dentro de los tests que lo
 * encienden con `conMicrosoft`. No trunca `soporte_master_test`: filas con
 * sufijo aleatorio, borradas al final.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createServer, Server } from 'node:http';
import { Pool } from 'pg';
import { LOGGER } from '../src/shared/domain/ports/i-logger.port';
import { SharedModule } from '../src/shared/shared.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { ClienteEntity } from '../src/clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { AuthModule } from '../src/auth/auth.module';
import { UsuarioEntity } from '../src/auth/domain/entities/usuario.entity';
import {
  CONFIGURACION_SSO,
  IConfiguracionSso,
} from '../src/auth/domain/ports/configuracion-sso.port';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { activarTfaDeTest, codigoDeTest } from '../src/auth/test-helpers/tfa-de-test';
import { iniciarIdpFalso, IdpFalso } from '../src/testing/idp-falso';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../src/testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const CLIENT_ID = 'client-id-e2e';
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

usarLockMasterTest();

describe('Login SSO: SsoController', () => {
  let app: INestApplication;
  let baseUrl: string;
  let idp: IdpFalso;
  let pool: InstanceType<typeof Pool>;
  let prismaService: PrismaService;
  const usuarioIds: string[] = [];
  const clienteIds: string[] = [];
  const stateHashes: string[] = [];
  const logs: string[] = [];
  let microsoftHabilitado = false;
  let emailKeyOriginal: string | undefined;
  /** `/token` alterno que responde por `code`; se usa solo en los tests concurrentes. */
  let idpPorCodigo: { servidor: Server; url: string; tokens: Map<string, string> } | null = null;

  const configuracion: IConfiguracionSso = {
    obtener: (proveedor) =>
      proveedor === 'GOOGLE'
        ? {
            clientId: CLIENT_ID,
            clientSecret: 'secreto-e2e',
            urlAutorizacion: 'https://idp.example/authorize',
            urlToken: idpPorCodigo?.url ?? idp.urlToken,
            urlJwks: idp.urlJwks,
            redirectUri: 'https://app.example/api/auth/sso/google/callback',
            emisores: ['https://accounts.google.com'],
          }
        : proveedor === 'MICROSOFT' && microsoftHabilitado
          ? {
              clientId: CLIENT_ID,
              clientSecret: 'secreto-e2e',
              urlAutorizacion: 'https://idp.example/authorize',
              urlToken: idp.urlToken,
              urlJwks: idp.urlJwks,
              redirectUri: 'https://app.example/api/auth/sso/microsoft/callback',
              plantillaEmisor: 'https://login.microsoftonline.com/{tid}/v2.0',
            }
          : null,
  };

  async function conMicrosoft(prueba: () => Promise<void>) {
    microsoftHabilitado = true;
    try {
      await prueba();
    } finally {
      microsoftHabilitado = false;
    }
  }

  async function http(metodo: 'GET' | 'POST', ruta: string, body?: object) {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const cuerpo: Record<string, unknown> = await res.json().catch(() => ({}));
    return { status: res.status, body: cuerpo };
  }

  /** Crea un usuario (activo, con una membresia salvo que se pida lo contrario). */
  async function crearUsuario(
    opciones: {
      email?: string;
      activo?: boolean;
      borrado?: boolean;
      membresia?: boolean;
      root?: boolean;
    } = {},
  ): Promise<{ id: string; email: string; clienteId: string | null }> {
    const email = opciones.email ?? `sso-${randomUUID().slice(0, 8)}-${SUFIJO}@auth.test`;
    const usuario = UsuarioEntity.create({
      email,
      nombre: 'Sso',
      apellido: 'E2e',
      passwordHash: 'x',
      activo: opciones.activo ?? true,
      isGlobalAdmin: false,
    });
    await new PrismaUsuarioRepository(prismaService).save(usuario);
    usuarioIds.push(usuario.id);
    if (opciones.borrado) {
      await pool.query('UPDATE usuarios SET deleted_at = now() WHERE id = $1', [usuario.id]);
    }
    if (opciones.root) {
      await pool.query('UPDATE usuarios SET is_global_admin = true WHERE id = $1', [usuario.id]);
    }
    const clienteId = opciones.membresia === false ? null : await crearMembresia(usuario.id);
    return { id: usuario.id, email, clienteId };
  }

  /** Cliente nuevo y membresia activa del usuario en el; devuelve el id del cliente. */
  async function crearMembresia(usuarioId: string): Promise<string> {
    const cliente = ClienteEntity.create({
      nombre: `Sso ${usuarioId} ${randomUUID().slice(0, 8)} ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_sso_${randomUUID().slice(0, 8)}_${SUFIJO}`,
      activo: true,
    });
    await new PrismaClienteRepository(prismaService).save(cliente);
    clienteIds.push(cliente.id);
    const master = prismaService.getMasterClient();
    const rol =
      (await master.role.findFirst({ where: { codigo: 'TECNICO' } })) ??
      (await master.role.create({ data: { codigo: 'TECNICO', nombre: 'TECNICO' } }));
    await master.membresia.create({
      data: { usuarioId, clienteId: cliente.id, rolId: rol.id, activo: true },
    });
    return cliente.id;
  }

  const usuarioConMembresia = async () => (await crearUsuario()).email;

  /** `iniciar` por HTTP; extrae `state` y `nonce` de la URL de autorizacion. */
  async function iniciar(slug = 'google') {
    const res = await http('POST', `/auth/sso/${slug}/iniciar`, {});
    const authorizeUrl = String(res.body.authorizeUrl);
    const parametros = new URL(authorizeUrl).searchParams;
    const state = String(parametros.get('state'));
    stateHashes.push(sha256(state));
    return {
      res,
      state,
      nonce: String(parametros.get('nonce')),
      bindingToken: String(res.body.bindingToken),
    };
  }

  /** Hace que el `/token` del IdP devuelva un ID token valido para `email` y `nonce`. */
  async function idpResponde(
    email: string,
    nonce: string,
    sobrescribir: Record<string, unknown> = {},
  ) {
    idp.responderToken({
      idToken: await idp.firmar({
        iss: 'https://accounts.google.com',
        aud: CLIENT_ID,
        sub: `sub-${randomUUID()}`,
        nonce,
        email,
        email_verified: true,
        ...sobrescribir,
      }),
    });
  }

  /** Flujo completo de Google: `iniciar`, IdP que responde con `sobrescribir` y `callback`. */
  async function ingresar(
    email: string,
    sobrescribir: Record<string, unknown> = {},
    extra: object = {},
  ) {
    const { state, nonce, bindingToken } = await iniciar();
    await idpResponde(email, nonce, sobrescribir);
    return callback(state, bindingToken, 'google', extra);
  }

  /** Ingreso de Microsoft con claims validos salvo `sobrescribir` (claves en `undefined` se omiten). */
  async function ingresarMicrosoft(email: string, sobrescribir: Record<string, unknown> = {}) {
    const { state, nonce, bindingToken } = await iniciar('microsoft');
    idp.responderToken({
      idToken: await idp.firmar({
        iss: 'https://login.microsoftonline.com/tenant-1/v2.0',
        aud: CLIENT_ID,
        tid: 'tenant-1',
        oid: `oid-${randomUUID()}`,
        ver: '2.0',
        nonce,
        email,
        xms_edov: true,
        ...sobrescribir,
      }),
    });
    return callback(state, bindingToken, 'microsoft');
  }

  const vinculosDe = async (ids: string[]) =>
    (
      await pool.query(
        'SELECT usuario_id, subject FROM usuarios_identidades_sso WHERE usuario_id = ANY($1)',
        [ids],
      )
    ).rows;

  const callback = (state: string, binding: string, slug = 'google', extra: object = {}) =>
    http('POST', `/auth/sso/${slug}/callback`, { code: 'codigo', state, binding, ...extra });

  beforeAll(async () => {
    process.env.DATABASE_URL_MASTER ??= URL_MASTER;
    emailKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY ??= 'f'.repeat(64);
    idp = await iniciarIdpFalso();
    const moduleRef = await Test.createTestingModule({ imports: [SharedModule, AuthModule] })
      .overrideProvider(CONFIGURACION_SSO)
      .useValue(configuracion)
      .overrideProvider(LOGGER)
      .useValue({ log: (m: string) => logs.push(m), error: () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    pool = new Pool({ connectionString: URL_MASTER });
    prismaService = new PrismaService(URL_MASTER);
  }, 60_000);

  beforeEach(() => {
    idp.llamadasToken.length = 0;
    logs.length = 0;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sso_estados WHERE state_hash = ANY($1)', [stateHashes]);
    await pool.query("DELETE FROM auth_intentos_fallidos WHERE clave LIKE 'sso:%'");
    for (const id of usuarioIds) {
      await pool.query('DELETE FROM refresh_tokens WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM membresias WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    }
    if (clienteIds.length)
      await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clienteIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
    await app?.close();
    await idp?.cerrar();
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
  }, 30_000);

  it('proveedores lista solo los habilitados y nada mas (SC3)', async () => {
    const res = await http('GET', '/auth/sso/proveedores');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ proveedores: ['google'] });
  });

  it('proveedor deshabilitado o slug desconocido: 404 en iniciar; el callback deshabilitado es el 401 generico (SC2)', async () => {
    for (const slug of ['microsoft', 'okta']) {
      expect((await http('POST', `/auth/sso/${slug}/iniciar`, {})).status).toBe(404);
    }
    expect((await callback('s', 'b', 'okta')).status).toBe(404);
    expect((await callback('s', 'b', 'microsoft')).status).toBe(401);
    expect(idp.llamadasToken).toHaveLength(0);
  });

  it('iniciar devuelve authorizeUrl y bindingToken y persiste solo hashes (SL9)', async () => {
    const { res, state, bindingToken } = await iniciar();
    expect(res.status).toBe(200);
    expect(bindingToken.length).toBeGreaterThan(20);
    const filas = await pool.query(
      'SELECT state_hash, navegador_hash FROM sso_estados WHERE state_hash = $1',
      [sha256(state)],
    );
    expect(filas.rows).toEqual([
      { state_hash: sha256(state), navegador_hash: sha256(bindingToken) },
    ]);
  });

  it('el callback valido entrega ticket y el replay del mismo state es 401 sin tocar el IdP (SL9)', async () => {
    const email = await usuarioConMembresia();
    const { state, nonce, bindingToken } = await iniciar();
    await idpResponde(email, nonce);

    const primero = await callback(state, bindingToken);
    expect(primero.status).toBe(200);
    expect(primero.body.ticket).toEqual(expect.any(String));
    expect(idp.llamadasToken).toHaveLength(1);

    const replay = await callback(state, bindingToken);
    expect(replay.status).toBe(401);
    expect(idp.llamadasToken).toHaveLength(1);
    // SL13: replay, state inventado y binding ajeno responden lo mismo.
    const inventado = await callback('state-inventado', bindingToken);
    expect(inventado).toEqual(replay);
  });

  it('sso_st de otro flujo es 401 y el flujo propio sigue consumible (SL9)', async () => {
    const email = await usuarioConMembresia();
    const a = await iniciar();
    const b = await iniciar();
    await idpResponde(email, a.nonce);

    const ajeno = await callback(a.state, b.bindingToken);
    expect(ajeno.status).toBe(401);
    expect(ajeno.body).toEqual((await callback('state-inventado', b.bindingToken)).body);
    expect(idp.llamadasToken).toHaveLength(0);
    expect((await callback(a.state, a.bindingToken)).status).toBe(200);
  });

  it('estado vencido es 401 sin llamar al IdP, igual que cualquier otro rechazo (SL9, SL13)', async () => {
    const email = await usuarioConMembresia();
    const { state, nonce, bindingToken } = await iniciar();
    await idpResponde(email, nonce);
    await pool.query(
      "UPDATE sso_estados SET expira_at = now() - interval '1 minute' WHERE state_hash = $1",
      [sha256(state)],
    );

    const vencido = await callback(state, bindingToken);
    expect(vencido.status).toBe(401);
    expect(vencido.body).toEqual((await callback('state-inventado', bindingToken)).body);
    expect(idp.llamadasToken).toHaveLength(0);
  });

  it('el flujo de GOOGLE en la ruta de microsoft es 401 y la fila sigue consumible (SL9)', async () => {
    await conMicrosoft(async () => {
      const email = await usuarioConMembresia();
      const { state, nonce, bindingToken } = await iniciar();
      await idpResponde(email, nonce);

      const cruzado = await callback(state, bindingToken, 'microsoft');
      expect(cruzado.status).toBe(401);
      expect(cruzado.body).toEqual((await callback('state-inventado', bindingToken)).body);
      expect(idp.llamadasToken).toHaveLength(0);
      const fila = await pool.query('SELECT usado_at FROM sso_estados WHERE state_hash = $1', [
        sha256(state),
      ]);
      expect(fila.rows).toEqual([{ usado_at: null }]);
      expect((await callback(state, bindingToken)).status).toBe(200);
    });
  });

  it('un siguiente de mas de 300 caracteres es 400 en iniciar y no persiste nada (SL9)', async () => {
    const res = await http('POST', '/auth/sso/google/iniciar', { siguiente: 'a'.repeat(301) });
    expect(res.status).toBe(400);
    expect(
      (await http('POST', '/auth/sso/google/iniciar', { siguiente: 'a'.repeat(300) })).status,
    ).toBe(200);
  });

  it('primer ingreso por email vincula; el segundo entra por sujeto aunque el email cambie (SL1, SV3)', async () => {
    const usuario = await crearUsuario();
    const sub = `sub-${randomUUID()}`;

    expect((await ingresar(usuario.email, { sub })).status).toBe(200);
    expect(await vinculosDe([usuario.id])).toEqual([{ usuario_id: usuario.id, subject: sub }]);

    await pool.query('UPDATE usuarios SET email = $2 WHERE id = $1', [
      usuario.id,
      `nuevo-${usuario.email}`,
    ]);
    const segundo = await ingresar(usuario.email, { sub });
    expect(segundo.status).toBe(200);
    expect(segundo.body.ticket).toEqual(expect.any(String));
    expect(await vinculosDe([usuario.id])).toHaveLength(1);
  });

  it('otro sujeto con el mismo email es 401 y no crea un vinculo nuevo (SV2, SV4)', async () => {
    const usuario = await crearUsuario();
    const sub = `sub-${randomUUID()}`;
    expect((await ingresar(usuario.email, { sub })).status).toBe(200);

    const intruso = await ingresar(usuario.email, { sub: `otro-${randomUUID()}` });
    expect(intruso.status).toBe(401);
    expect(logs.join('\n')).toContain('motivo=OTRA_CUENTA');
    expect(await vinculosDe([usuario.id])).toEqual([{ usuario_id: usuario.id, subject: sub }]);
  });

  it('una variante de mayusculas del email entra y vincula (SL2)', async () => {
    const usuario = await crearUsuario();
    const res = await ingresar(usuario.email.toUpperCase());
    expect(res.status).toBe(200);
    expect(await vinculosDe([usuario.id])).toHaveLength(1);
  });

  it('una cuenta vinculada a U1 que llega con el email de U2 entra como U1 (SV6)', async () => {
    const u1 = await crearUsuario();
    const u2 = await crearUsuario();
    const sub = `sub-${randomUUID()}`;
    expect((await ingresar(u1.email, { sub })).status).toBe(200);
    await pool.query('DELETE FROM auth_desafios WHERE usuario_id = $1', [u1.id]);

    const res = await ingresar(u2.email, { sub });
    expect(res.status).toBe(200);
    const desafios = await pool.query(
      'SELECT usuario_id FROM auth_desafios WHERE usuario_id = ANY($1)',
      [[u1.id, u2.id]],
    );
    expect(desafios.rows).toEqual([{ usuario_id: u1.id }]);
    expect(await vinculosDe([u1.id, u2.id])).toEqual([{ usuario_id: u1.id, subject: sub }]);
  });

  describe('rechazos: respuesta identica, motivo solo en el log (SL3, SL5, SL7, SL13)', () => {
    const casos: Array<[string, string, () => Promise<{ id: string; email: string }>]> = [
      ['usuario inactivo', 'INACTIVO', () => crearUsuario({ activo: false })],
      ['usuario borrado', 'INACTIVO', () => crearUsuario({ borrado: true })],
      ['sin membresias', 'SIN_MEMBRESIA', () => crearUsuario({ membresia: false })],
    ];

    async function verificarRechazo(
      res: { status: number; body: object },
      motivo: string,
      proveedor = 'GOOGLE',
    ) {
      const generico = await callback('state-inventado', 'binding-inventado');
      expect(res.status).toBe(401);
      expect(res).toEqual(generico);
      expect(logs.join('\n')).toContain(
        `SSO_RECHAZADO | proveedor=${proveedor} | motivo=${motivo}`,
      );
      expect(JSON.stringify(res.body)).not.toContain(motivo);
    }

    it.each(casos)('%s', async (_nombre, motivo, crear) => {
      const usuario = await crear();
      await verificarRechazo(await ingresar(usuario.email), motivo);
      expect(await vinculosDe([usuario.id])).toEqual([]);
    });

    it('email ambiguo (dos filas que difieren en mayusculas)', async () => {
      const base = `ambiguo-${randomUUID().slice(0, 8)}-${SUFIJO}@auth.test`;
      const a = await crearUsuario({ email: base });
      const b = await crearUsuario({ email: base.toUpperCase() });
      await verificarRechazo(await ingresar(base), 'AMBIGUO');
      expect(await vinculosDe([a.id, b.id])).toEqual([]);
    });

    it('email no verificado de Google', async () => {
      const usuario = await crearUsuario();
      await verificarRechazo(
        await ingresar(usuario.email, { email_verified: false }),
        'EMAIL_NO_VERIFICADO',
      );
      expect(await vinculosDe([usuario.id])).toEqual([]);
    });

    it('token de Microsoft con iss distinto del tid', async () => {
      await conMicrosoft(async () => {
        const usuario = await crearUsuario();
        const { state, nonce, bindingToken } = await iniciar('microsoft');
        idp.responderToken({
          idToken: await idp.firmar({
            iss: 'https://login.microsoftonline.com/otro-tenant/v2.0',
            aud: CLIENT_ID,
            tid: 'tenant-1',
            oid: 'oid-1',
            ver: '2.0',
            nonce,
            email: usuario.email,
            xms_edov: true,
          }),
        });
        await verificarRechazo(
          await callback(state, bindingToken, 'microsoft'),
          'TOKEN_INVALIDO',
          'MICROSOFT',
        );
        expect(await vinculosDe([usuario.id])).toEqual([]);
      });
    });
  });

  describe('segundo paso y selector (SL11, SL12, L1, L7, D3)', () => {
    it('con 2FA activo pide el codigo propio aunque el proveedor haya verificado en dos pasos', async () => {
      const usuario = await crearUsuario();
      await activarTfaDeTest(prismaService, usuario.id);

      const res = await ingresar(usuario.email, { amr: ['mfa'] });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ kind: 'needs2fa', desafio: expect.any(String) });
      expect(res.body.ticket).toBeUndefined();

      const verificado = await http('POST', '/auth/2fa/verificar', {
        desafio: res.body.desafio,
        codigo: codigoDeTest(usuario.id),
      });
      expect(verificado.status).toBe(200);
      expect(verificado.body.ticket).toEqual(expect.any(String));
    });

    it('un cliente que exige 2FA y un usuario sin 2FA: needsEnrolamiento2fa', async () => {
      const usuario = await crearUsuario();
      await pool.query('UPDATE clientes SET requiere_2fa = true WHERE id = $1', [
        usuario.clienteId,
      ]);

      const res = await ingresar(usuario.email);
      expect(res.body).toMatchObject({ kind: 'needsEnrolamiento2fa', desafio: expect.any(String) });
      expect(res.body.ticket).toBeUndefined();
    });

    it('un dispositivo confiable vigente omite el desafio y se renueva; uno ajeno no', async () => {
      const usuario = await crearUsuario();
      await activarTfaDeTest(prismaService, usuario.id);
      const token = randomBytes(32).toString('hex');
      await pool.query(
        "INSERT INTO tfa_dispositivos_confiables (usuario_id, token_hash, expira_at) VALUES ($1, $2, now() + interval '1 day')",
        [usuario.id, sha256(token)],
      );

      const sub = `sub-${randomUUID()}`;
      const res = await ingresar(usuario.email, { sub }, { dispositivoConfiable: token });
      expect(res.body).toMatchObject({ kind: 'ticket', dispositivoConfiable: token });
      const fila = await pool.query(
        "SELECT expira_at > now() + interval '20 days' AS renovado FROM tfa_dispositivos_confiables WHERE token_hash = $1",
        [sha256(token)],
      );
      expect(fila.rows).toEqual([{ renovado: true }]);

      const ajeno = await ingresar(
        usuario.email,
        { sub },
        { dispositivoConfiable: 'f'.repeat(64) },
      );
      expect(ajeno.body.kind).toBe('needs2fa');
    });

    it('con una membresia, continuar entrega los tokens y consume el ticket', async () => {
      const usuario = await crearUsuario();
      const res = await ingresar(usuario.email);
      expect(res.body.kind).toBe('ticket');

      const sesion = await http('POST', '/auth/login/continuar', { ticket: res.body.ticket });
      expect(sesion.status).toBe(200);
      expect(sesion.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      });
      expect(
        (await http('POST', '/auth/login/continuar', { ticket: res.body.ticket })).status,
      ).toBe(401);
    });

    it('con dos membresias muestra el selector y el ticket se canjea una sola vez', async () => {
      const usuario = await crearUsuario();
      const segundoCliente = await crearMembresia(usuario.id);
      const res = await ingresar(usuario.email);

      const selector = await http('POST', '/auth/login/continuar', { ticket: res.body.ticket });
      expect(selector.body).toMatchObject({ needsClienteSelection: true, ticket: res.body.ticket });
      expect(selector.body.membresias).toHaveLength(2);

      const elegido = { ticket: res.body.ticket, clienteId: segundoCliente };
      const sesion = await http('POST', '/auth/login/seleccionar', elegido);
      expect(sesion.status).toBe(200);
      expect(sesion.body.accessToken).toEqual(expect.any(String));
      expect((await http('POST', '/auth/login/seleccionar', elegido)).status).toBe(401);
    });
  });

  describe('concurrencia, limites y ausencia de altas (SV5, I9, SL15)', () => {
    /** Levanta un `/token` que responde un ID token por `code`, para flujos simultaneos. */
    async function conIdpPorCodigo(prueba: (tokens: Map<string, string>) => Promise<void>) {
      const tokens = new Map<string, string>();
      const servidor = createServer((req, res) => {
        const partes: Buffer[] = [];
        req.on('data', (parte: Buffer) => partes.push(parte));
        req.on('end', () => {
          const code = new URLSearchParams(Buffer.concat(partes).toString('utf8')).get('code');
          const idToken = tokens.get(String(code));
          res.writeHead(idToken ? 200 : 400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id_token: idToken, token_type: 'Bearer' }));
        });
      });
      await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
      const { port } = servidor.address() as { port: number };
      idpPorCodigo = { servidor, url: `http://127.0.0.1:${port}/token`, tokens };
      try {
        await prueba(tokens);
      } finally {
        idpPorCodigo = null;
        servidor.closeAllConnections();
        await new Promise((resolve) => servidor.close(resolve));
      }
    }

    /** Dos flujos `iniciar` cuyos tokens (email comun) llegan con los sujetos dados. */
    async function dosFlujos(tokens: Map<string, string>, email: string, subs: [string, string]) {
      return Promise.all(
        subs.map(async (sub, i) => {
          const flujo = await iniciar();
          tokens.set(
            `codigo-${i}`,
            await idp.firmar({
              iss: 'https://accounts.google.com',
              aud: CLIENT_ID,
              sub,
              nonce: flujo.nonce,
              email,
              email_verified: true,
            }),
          );
          return { ...flujo, code: `codigo-${i}` };
        }),
      );
    }

    const callbackDe = (f: { state: string; bindingToken: string; code: string }) =>
      http('POST', '/auth/sso/google/callback', {
        code: f.code,
        state: f.state,
        binding: f.bindingToken,
      });

    it('dos primeros ingresos a la vez con sujetos distintos: un solo vinculo y un solo ganador', async () => {
      const usuario = await crearUsuario();
      await conIdpPorCodigo(async (tokens) => {
        const flujos = await dosFlujos(tokens, usuario.email, [
          'sub-a-' + randomUUID(),
          'sub-b-' + randomUUID(),
        ]);
        const respuestas = await Promise.all(flujos.map(callbackDe));
        expect(respuestas.map((r) => r.status).sort()).toEqual([200, 401]);
      });
      expect(await vinculosDe([usuario.id])).toHaveLength(1);
    });

    it('dos primeros ingresos a la vez con el mismo sujeto: ambos entran y hay un vinculo', async () => {
      const usuario = await crearUsuario();
      const sub = `sub-${randomUUID()}`;
      await conIdpPorCodigo(async (tokens) => {
        const flujos = await dosFlujos(tokens, usuario.email, [sub, sub]);
        const respuestas = await Promise.all(flujos.map(callbackDe));
        expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
      });
      expect(await vinculosDe([usuario.id])).toEqual([{ usuario_id: usuario.id, subject: sub }]);
    });

    const claveDe = (sub: string) => `sso:GOOGLE:${sha256(sub)}:sin-ip`;
    const fallosDe = async (sub: string) =>
      (
        await pool.query('SELECT fallos FROM auth_intentos_fallidos WHERE clave = $1', [
          claveDe(sub),
        ])
      ).rows;

    it('tras agotar la clave por sujeto e IP bloquea, tambien con un token valido (I9)', async () => {
      const usuario = await crearUsuario();
      const sub = `sub-${randomUUID()}`;
      for (let i = 0; i < 5; i++) {
        expect((await ingresar(`nadie-${i}-${SUFIJO}@auth.test`, { sub })).status).toBe(401);
      }
      expect(await fallosDe(sub)).toEqual([{ fallos: 5 }]);

      logs.length = 0;
      const bloqueado = await ingresar(usuario.email, { sub });
      expect(bloqueado.status).toBe(401);
      expect(logs.join('\n')).toContain('motivo=BLOQUEADO');
      expect(await vinculosDe([usuario.id])).toEqual([]);
    });

    it('un exito libera la clave: el contador vuelve a cero (I9)', async () => {
      const usuario = await crearUsuario();
      const sub = `sub-${randomUUID()}`;
      for (let i = 0; i < 4; i++) await ingresar(`nadie-${i}-${SUFIJO}@auth.test`, { sub });
      expect(await fallosDe(sub)).toEqual([{ fallos: 4 }]);

      expect((await ingresar(usuario.email, { sub })).status).toBe(200);
      expect(await fallosDe(sub)).toEqual([]);
    });

    it('ningun ingreso crea usuarios, membresias ni clientes (SL15)', async () => {
      const desconocido = `desconocido-${SUFIJO}@auth.test`;
      const sinMembresia = await crearUsuario({ membresia: false });
      const conMembresia = await crearUsuario();
      const cuentas = async (): Promise<unknown[]> =>
        (
          await pool.query(
            `SELECT
               (SELECT count(*) FROM usuarios WHERE email = $1) AS desconocido,
               (SELECT count(*) FROM membresias WHERE usuario_id = $2) AS sin_membresia,
               (SELECT count(*) FROM membresias WHERE usuario_id = $3) AS con_membresia,
               (SELECT count(*) FROM clientes WHERE nombre LIKE $4) AS clientes`,
            [desconocido, sinMembresia.id, conMembresia.id, `%${SUFIJO}`],
          )
        ).rows;
      const antes = await cuentas();

      expect((await ingresar(desconocido)).status).toBe(401);
      expect((await ingresar(sinMembresia.email)).status).toBe(401);
      expect((await ingresar(conMembresia.email)).status).toBe(200);
      expect(await cuentas()).toEqual(antes);
    });
  });

  describe('ROOT y Microsoft sin email verificado (SL5, SL6)', () => {
    it('ROOT con email verificado es 401, tambien si ya estaba vinculado, y no deja filas', async () => {
      const root = await crearUsuario({ root: true });
      const rechazado = await ingresar(root.email);
      expect(rechazado.status).toBe(401);
      expect(logs.join('\n')).toContain('motivo=ROOT');

      const sub = `sub-${randomUUID()}`;
      const vinculado = await crearUsuario();
      expect((await ingresar(vinculado.email, { sub })).status).toBe(200);
      await pool.query('UPDATE usuarios SET is_global_admin = true WHERE id = $1', [vinculado.id]);
      expect((await ingresar(vinculado.email, { sub })).status).toBe(401);

      expect(await vinculosDe([root.id])).toEqual([]);
      const desafios = await pool.query('SELECT 1 FROM auth_desafios WHERE usuario_id = $1', [
        root.id,
      ]);
      expect(desafios.rowCount).toBe(0);
    });

    it('Microsoft exige xms_edov === true; y con el entra', async () => {
      await conMicrosoft(async () => {
        const usuario = await crearUsuario();
        const sinEdov = await ingresarMicrosoft(usuario.email, { xms_edov: undefined });
        expect(sinEdov.status).toBe(401);
        expect(logs.join('\n')).toContain('proveedor=MICROSOFT | motivo=EMAIL_NO_VERIFICADO');
        expect(await vinculosDe([usuario.id])).toEqual([]);

        expect((await ingresarMicrosoft(usuario.email)).status).toBe(200);
        expect(await vinculosDe([usuario.id])).toHaveLength(1);
      });
    });
  });
});
