/**
 * integraciones-claves.e2e.spec.ts — e2e HTTP real de `/integraciones/claves`
 * (sdd/api-publica, T3). Guards reales, Postgres real (`soporte_master_test`), JWT firmados por
 * el `ITokenService` real. Cubre CA3, CA4 y CA9: solo el ADMINISTRADOR del cliente (o ROOT)
 * administra claves, la clave en claro sale una sola vez y se guarda su sha256.
 */
import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { IntegracionesModule } from '../src/integraciones/integraciones.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../src/shared/infrastructure/persistence/prisma-clients';
import { TOKEN_SERVICE, ITokenService } from '../src/auth/domain/ports/i-token.service';
import { payloadDeTest } from '../src/auth/test-helpers/payload-de-test';
import { usarLockMasterTest } from '../src/testing/lock-master-test';
import { hashearClaveApi } from '../src/integraciones/domain/generar-clave-api';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

interface ClaveCreada {
  id: string;
  nombre: string;
  prefijo: string;
  permisos: string[];
  clave: string;
}

interface Tenant {
  clienteId: string;
  adminToken: string;
  usuarioToken: string;
}

describe('Integraciones e2e — /integraciones/claves', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tokenService: ITokenService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [SharedModule, IntegracionesModule],
    }).compile();

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
    // Otros specs truncan `roles`: el USUARIO de la integracion se crea aca.
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE api_claves, membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await masterClient.role.create({ data: { codigo: 'USUARIO', nombre: 'Usuario' } });
  });

  const rootToken = () =>
    tokenService.signJwt(
      payloadDeTest({ sub: `root-${randomBytes(4).toString('hex')}`, is_global_admin: true }),
    );

  /** Cliente con un ADMINISTRADOR real (la clave lo referencia como creador) y un usuario comun. */
  async function crearTenant(habilitarApi: boolean): Promise<Tenant> {
    const sufijo = randomBytes(3).toString('hex');
    const cliente = await masterClient.cliente.create({
      data: { nombre: `E2E claves ${sufijo}`, dbName: `soporte_e2e_claves_${sufijo}_test` },
    });
    if (habilitarApi) {
      const res = await fetch(`${baseUrl}/clientes/${cliente.id}/api`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rootToken()}` },
        body: JSON.stringify({ habilitada: true }),
      });
      expect(res.status).toBe(200);
    }
    const admin = await masterClient.usuario.create({
      data: {
        email: `admin-${sufijo}@e2e.test`,
        nombre: 'Admin',
        apellido: 'E2E',
        passwordHash: 'x',
      },
    });
    const firmar = (sub: string, rol: string) =>
      tokenService.signJwt(payloadDeTest({ sub, cliente_id: cliente.id, rol }));
    return {
      clienteId: cliente.id,
      adminToken: firmar(admin.id, 'ADMINISTRADOR'),
      usuarioToken: firmar(admin.id, 'USUARIO'),
    };
  }

  async function llamar(metodo: string, ruta: string, bearer?: string, body?: unknown) {
    const res = await fetch(`${baseUrl}/integraciones/claves${ruta}`, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as unknown };
  }

  const crear = (bearer: string, extra: Record<string, unknown> = {}) =>
    llamar('POST', '', bearer, { nombre: 'ERP', permisos: ['TICKETS:LECTURA'], ...extra });

  it('el ADMINISTRADOR crea una clave: 201, plaintext sop_ y solo el sha256 en la base', async () => {
    const a = await crearTenant(true);

    const { status, data } = await crear(a.adminToken, {
      permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
    });

    expect(status).toBe(201);
    const creada = data as ClaveCreada;
    expect(creada.clave).toMatch(/^sop_/);
    expect(creada).toMatchObject({
      nombre: 'ERP',
      permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS'],
      prefijo: creada.clave.slice(0, creada.prefijo.length),
    });
    const fila = await masterClient.apiClave.findUniqueOrThrow({ where: { id: creada.id } });
    expect(fila.hash).toBe(hashearClaveApi(creada.clave));
    expect(fila.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(fila)).not.toContain(creada.clave);
    expect(fila.clienteId).toBe(a.clienteId);
    const integracion = await masterClient.usuario.findUniqueOrThrow({
      where: { id: fila.usuarioId },
    });
    expect(integracion.esIntegracion).toBe(true);
  });

  it('el listado muestra el prefijo y nunca el hash ni la clave en claro', async () => {
    const a = await crearTenant(true);
    const creada = (await crear(a.adminToken)).data as ClaveCreada;

    const { status, data } = await llamar('GET', '', a.adminToken);

    expect(status).toBe(200);
    expect(data).toEqual([
      {
        id: creada.id,
        nombre: 'ERP',
        prefijo: creada.prefijo,
        permisos: ['TICKETS:LECTURA'],
        creadaAt: expect.any(String),
        ultimoUsoAt: null,
        revocadaAt: null,
      },
    ]);
    const texto = JSON.stringify(data);
    expect(texto).not.toContain(creada.clave);
    expect(texto).not.toContain(hashearClaveApi(creada.clave));
  });

  it('un usuario comun recibe 403 en las tres rutas; sin Bearer, 401', async () => {
    const a = await crearTenant(true);
    const creada = (await crear(a.adminToken)).data as ClaveCreada;

    expect((await llamar('GET', '', a.usuarioToken)).status).toBe(403);
    expect((await crear(a.usuarioToken)).status).toBe(403);
    expect((await llamar('DELETE', `/${creada.id}`, a.usuarioToken)).status).toBe(403);
    expect((await llamar('GET', '')).status).toBe(401);
    expect(await masterClient.apiClave.count()).toBe(1);
  });

  it('el ADMINISTRADOR de B no ve ni revoca las claves de A', async () => {
    const a = await crearTenant(true);
    const b = await crearTenant(true);
    const creada = (await crear(a.adminToken)).data as ClaveCreada;

    expect((await llamar('GET', '', b.adminToken)).data).toEqual([]);
    expect((await llamar('DELETE', `/${creada.id}`, b.adminToken)).status).toBe(404);
    const fila = await masterClient.apiClave.findUniqueOrThrow({ where: { id: creada.id } });
    expect(fila.revocadaAt).toBeNull();
  });

  it('con la API deshabilitada crear falla y no queda ninguna clave', async () => {
    const c = await crearTenant(false);

    const { status } = await crear(c.adminToken);

    expect(status).toBe(422);
    expect(await masterClient.apiClave.count()).toBe(0);
  });

  it('rechaza permisos fuera del subconjunto o vacios, y un nombre en blanco', async () => {
    const a = await crearTenant(true);

    expect((await crear(a.adminToken, { permisos: ['TICKETS:TRANSICIONAR'] })).status).toBe(422);
    expect((await crear(a.adminToken, { permisos: [] })).status).toBe(400);
    expect((await crear(a.adminToken, { nombre: '   ' })).status).toBe(422);
    expect(await masterClient.apiClave.count()).toBe(0);
  });

  it('revocar es idempotente y conserva la fecha de la primera vez; un id inexistente es 404', async () => {
    const a = await crearTenant(true);
    const creada = (await crear(a.adminToken)).data as ClaveCreada;

    expect((await llamar('DELETE', `/${creada.id}`, a.adminToken)).status).toBe(204);
    const primera = (await masterClient.apiClave.findUniqueOrThrow({ where: { id: creada.id } }))
      .revocadaAt;
    expect(primera).not.toBeNull();
    expect((await llamar('DELETE', `/${creada.id}`, a.adminToken)).status).toBe(204);
    const segunda = (await masterClient.apiClave.findUniqueOrThrow({ where: { id: creada.id } }))
      .revocadaAt;
    expect(segunda).toEqual(primera);

    const lista = (await llamar('GET', '', a.adminToken)).data as { revocadaAt: string | null }[];
    expect(lista[0].revocadaAt).not.toBeNull();
    expect(
      (await llamar('DELETE', '/00000000-0000-4000-8000-000000000000', a.adminToken)).status,
    ).toBe(404);
  });
});
