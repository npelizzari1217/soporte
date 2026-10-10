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

  const configuracion: IConfiguracionSso = {
    obtener: (proveedor) =>
      proveedor === 'GOOGLE'
        ? {
            clientId: CLIENT_ID,
            clientSecret: 'secreto-e2e',
            urlAutorizacion: 'https://idp.example/authorize',
            urlToken: idp.urlToken,
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
    opciones: { email?: string; activo?: boolean; borrado?: boolean; membresia?: boolean } = {},
  ): Promise<{ id: string; email: string }> {
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
    if (opciones.membresia !== false) {
      const cliente = ClienteEntity.create({
        nombre: `Sso ${usuario.id} ${SUFIJO}`,
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
        data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: rol.id, activo: true },
      });
    }
    return { id: usuario.id, email };
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
  async function ingresar(email: string, sobrescribir: Record<string, unknown> = {}) {
    const { state, nonce, bindingToken } = await iniciar();
    await idpResponde(email, nonce, sobrescribir);
    return callback(state, bindingToken);
  }

  const vinculosDe = async (ids: string[]) =>
    (
      await pool.query(
        'SELECT usuario_id, subject FROM usuarios_identidades_sso WHERE usuario_id = ANY($1)',
        [ids],
      )
    ).rows;

  const callback = (state: string, binding: string, slug = 'google') =>
    http('POST', `/auth/sso/${slug}/callback`, { code: 'codigo', state, binding });

  beforeAll(async () => {
    process.env.DATABASE_URL_MASTER ??= URL_MASTER;
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
      await pool.query('DELETE FROM membresias WHERE usuario_id = $1', [id]);
      await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    }
    if (clienteIds.length)
      await pool.query('DELETE FROM clientes WHERE id = ANY($1)', [clienteIds]);
    await pool.end();
    await prismaService.onModuleDestroy();
    await app?.close();
    await idp?.cerrar();
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
});
