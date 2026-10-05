/**
 * emitir-qr-equipo.e2e.spec.ts — `POST /equipos/:id/qr` (sdd/formulario-publico-qr, WU-4; D8).
 *
 * App real contra Postgres real y guards reales (JWT, tenant, acciones): tenant efímero,
 * `soporte_master_test` truncada en `beforeEach` y `usarLockMasterTest()`. Un actor por test:
 * dos clientes con el mismo `dbName` violan el UNIQUE de `clientes.db_name`. Cubre 401/403, la
 * emisión (token en claro y hash en la base), la lectura `GET /equipos/:id/qr` (issue #356), la regeneración, el congelamiento del slug y la carrera
 * entre emitir y cambiar el slug (ADR-2).
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../../auth/auth.module';
import { EquiposModule } from '../../equipos.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { entorno } from '../../../config/entorno';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_emitirQrE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eEmitirQrEquipoSecret!123';

interface Respuesta<T> {
  status: number;
  data: T;
}

interface CuerpoQr {
  estado?: string;
  url?: string | null;
  emitidoAt?: string;
  statusCode?: number;
  message?: string;
  code?: string;
}

async function post(url: string, token?: string): Promise<Respuesta<CuerpoQr>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: '{}',
  });
  return { status: res.status, data: (await res.json().catch(() => null)) as CuerpoQr };
}

async function get(url: string, token?: string): Promise<Respuesta<CuerpoQr>> {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, data: (await res.json().catch(() => null)) as CuerpoQr };
}

const sha256 = (valor: string): string => createHash('sha256').update(valor).digest('hex');

@Module({ imports: [SharedModule, AuthModule, EquiposModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Equipos e2e — POST /equipos/:id/qr (WU-4)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    // Orden CRÍTICO: filas → app.close() → dropDatabase. Al revés, el DROP falla en silencio.
    try {
      await tenantClient.equipoInformatico.deleteMany();
    } catch {
      /* no-op */
    }
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
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await tenantClient.equipoInformatico.deleteMany();
  });

  async function crearActor(
    permisos: string[],
    slug: string | null,
  ): Promise<{ accessToken: string; clienteId: string }> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Emitir QR ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
      slug,
    });
    await clienteRepo.save(cliente);
    if (slug !== null) {
      // `save()` no escribe el slug (solo los CAS lo hacen): se carga por el camino real.
      await clienteRepo.cambiarSlugSiNoCongelado(cliente.id, slug);
    }
    const role = RoleEntity.create({
      codigo: `ROL_E2E_${randomBytes(3).toString('hex')}`,
      nombre: 'rol',
      descripcion: null,
      permisos: [],
    });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    const usuario = UsuarioEntity.create({
      email: `e2e_emitir_qr_${randomBytes(3).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: 'EmitirQr',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: usuario.email, password: PLAINTEXT_PASSWORD }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    return { accessToken, clienteId: cliente.id };
  }

  async function crearEquipo(extra: { activo?: boolean } = {}): Promise<string> {
    return (await tenantClient.equipoInformatico.create({ data: { nombre: 'PC-QR', ...extra } }))
      .id;
  }

  const tokenDe = (url: string): string => new URL(url).searchParams.get('e') ?? '';
  const slugCongelado = async (id: string): Promise<boolean> =>
    (await clienteRepo.findById(id))?.slugCongeladoAt != null;

  it('sin sesión responde 401 y no emite nada', async () => {
    const equipoId = await crearEquipo();
    const r = await post(`${baseUrl}/equipos/${equipoId}/qr`);
    expect(r.status).toBe(401);
    const fila = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(fila.qrTokenHash).toBeNull();
  });

  it('sin EQUIPOS:MODIFICACION responde 403, no emite y no congela el slug', async () => {
    const actor = await crearActor(['EQUIPOS:LECTURA'], 'acme');
    const equipoId = await crearEquipo();

    const r = await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);

    expect(r.status).toBe(403);
    const fila = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(fila.qrTokenHash).toBeNull();
    expect(await slugCongelado(actor.clienteId)).toBe(false);
  });

  it('emite la URL, guarda token en claro y hash, y congela el slug', async () => {
    const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
    const equipoId = await crearEquipo();

    const r = await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);

    expect(r.status).toBe(201);
    const token = tokenDe(r.data.url ?? '');
    expect(r.data.url).toBe(`${entorno.APP_BASE_URL.replace(/\/+$/, '')}/c/acme/pedido?e=${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const fila = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(fila.qrTokenHash).toBe(sha256(token));
    expect(fila.qrToken).toBe(token);
    expect(fila.qrEmitidoAt).not.toBeNull();
    expect(await slugCongelado(actor.clienteId)).toBe(true);
  });

  it('regenerar reemplaza token y hash: el token anterior ya no corresponde a ningún equipo', async () => {
    const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
    const equipoId = await crearEquipo();

    const primero = tokenDe(
      (await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken)).data.url ?? '',
    );
    const segundo = tokenDe(
      (await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken)).data.url ?? '',
    );

    expect(segundo).not.toBe(primero);
    expect(
      await tenantClient.equipoInformatico.count({ where: { qrTokenHash: sha256(primero) } }),
    ).toBe(0);
    expect(
      await tenantClient.equipoInformatico.count({ where: { qrTokenHash: sha256(segundo) } }),
    ).toBe(1);
    const fila = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(fila.qrToken).toBe(segundo);
  });

  describe('GET /equipos/:id/qr (issue #356)', () => {
    it('sin sesión 401; sin EQUIPOS:MODIFICACION 403', async () => {
      const equipoId = await crearEquipo();
      expect((await get(`${baseUrl}/equipos/${equipoId}/qr`)).status).toBe(401);

      const actor = await crearActor(['EQUIPOS:LECTURA'], 'acme');
      expect((await get(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken)).status).toBe(403);
    });

    it('devuelve el mismo QR que emitió, las veces que se pida, y regenerar lo reemplaza', async () => {
      const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
      const equipoId = await crearEquipo();
      const emitido = await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);

      const a = await get(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);
      const b = await get(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);

      expect(a.status).toBe(200);
      expect(a.data).toEqual({
        estado: 'VIGENTE',
        url: emitido.data.url,
        emitidoAt: emitido.data.emitidoAt,
      });
      expect(b.data).toEqual(a.data);

      const nuevo = await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);
      const c = await get(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);
      expect(c.data.url).toBe(nuevo.data.url);
      expect(c.data.url).not.toBe(a.data.url);
    });

    it('equipo sin QR es 200 SIN_EMITIR; con hash pero sin token (anterior al cambio) es REQUIERE_REGENERAR', async () => {
      const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
      const sinQr = await crearEquipo();
      const legado = await crearEquipo();
      await tenantClient.equipoInformatico.update({
        where: { id: legado },
        data: { qrTokenHash: sha256('viejo'), qrEmitidoAt: new Date() },
      });

      const a = await get(`${baseUrl}/equipos/${sinQr}/qr`, actor.accessToken);
      const b = await get(`${baseUrl}/equipos/${legado}/qr`, actor.accessToken);

      expect(a.status).toBe(200);
      expect(a.data).toEqual({ estado: 'SIN_EMITIR', url: null, emitidoAt: null });
      expect(b.status).toBe(200);
      expect(b.data).toEqual({ estado: 'REQUIERE_REGENERAR', url: null, emitidoAt: null });
    });

    it('equipo inexistente o id inválido es 404; equipo de baja es 422', async () => {
      const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
      const deBaja = await crearEquipo({ activo: false });

      const inexistente = await get(
        `${baseUrl}/equipos/00000000-0000-4000-8000-000000000000/qr`,
        actor.accessToken,
      );
      const invalido = await get(`${baseUrl}/equipos/no-uuid/qr`, actor.accessToken);
      const baja = await get(`${baseUrl}/equipos/${deBaja}/qr`, actor.accessToken);

      expect(inexistente.status).toBe(404);
      expect(invalido.status).toBe(404);
      expect(baja.status).toBe(422);
    });
  });

  it('un cliente sin slug recibe 409 QR_REQUIERE_SLUG y no se escribe nada', async () => {
    const actor = await crearActor(['EQUIPOS:MODIFICACION'], null);
    const equipoId = await crearEquipo();

    const r = await post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken);

    expect(r.status).toBe(409);
    expect(r.data).toMatchObject({ statusCode: 409, code: 'QR_REQUIERE_SLUG' });
    const fila = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(fila.qrTokenHash).toBeNull();
  });

  it('equipo inexistente o id inválido es 404; equipo de baja es 422 y no congela el slug', async () => {
    const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
    const deBaja = await crearEquipo({ activo: false });

    const inexistente = await post(
      `${baseUrl}/equipos/00000000-0000-4000-8000-000000000000/qr`,
      actor.accessToken,
    );
    const invalido = await post(`${baseUrl}/equipos/no-uuid/qr`, actor.accessToken);
    const baja = await post(`${baseUrl}/equipos/${deBaja}/qr`, actor.accessToken);

    expect(inexistente.status).toBe(404);
    expect(invalido.status).toBe(404);
    expect(baja.status).toBe(422);
    expect(await slugCongelado(actor.clienteId)).toBe(false);
  });

  it('carrera entre emitir y cambiar el slug: el QR emitido siempre lleva el slug final, ya congelado', async () => {
    const actor = await crearActor(['EQUIPOS:MODIFICACION'], 'acme');
    const equipoId = await crearEquipo();
    const combinaciones = new Set<string>();

    for (let i = 0; i < 12; i++) {
      await masterClient.$executeRawUnsafe(
        `UPDATE clientes SET slug = 'acme', slug_congelado_at = NULL WHERE id = '${actor.clienteId}'`,
      );
      await tenantClient.equipoInformatico.update({
        where: { id: equipoId },
        data: { qrToken: null, qrTokenHash: null, qrEmitidoAt: null },
      });

      const [emision, cambio] = await Promise.all([
        post(`${baseUrl}/equipos/${equipoId}/qr`, actor.accessToken),
        clienteRepo.cambiarSlugSiNoCongelado(actor.clienteId, 'acme-nuevo'),
      ]);

      const cliente = await clienteRepo.findById(actor.clienteId);
      combinaciones.add(`${emision.status}/${cambio}`);
      if (emision.status === 201) {
        // Emitir lee el slug y lo congela con un CAS: el QR lleva el slug que quedó vigente.
        expect(new URL(emision.data.url ?? '').pathname).toBe(`/c/${cliente?.slug}/pedido`);
        expect(cliente?.slugCongeladoAt).not.toBeNull();
        // Un cambio que llegó después de congelar se rechaza: el slug no puede divergir del QR.
        if (cambio === 'CONGELADO') expect(cliente?.slug).toBe('acme');
      } else {
        // El slug cambió entre la lectura y el CAS: no se escribió ningún hash.
        expect(emision.data.code).toBe('QR_SLUG_CAMBIADO');
        expect(cambio).toBe('CAMBIADO');
        const fila = await tenantClient.equipoInformatico.findUniqueOrThrow({
          where: { id: equipoId },
        });
        expect(fila.qrTokenHash).toBeNull();
      }
    }

    // Toda combinación observada es una de las tres que respetan la invariante.
    for (const c of combinaciones) {
      expect(['201/CONGELADO', '201/CAMBIADO', '409/CAMBIADO']).toContain(c);
    }
  }, 60_000);
});
