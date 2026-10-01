/**
 * equipos-incluir-bajas.e2e.spec.ts — WU-14 (baja-equipo-completo, R8, R11).
 *
 * App real contra Postgres real: `GET /equipos` y `GET /equipos/export` con y sin
 * `?incluirBajas=`, y los guards de un equipo dado de baja (editar, agregar componente con y sin
 * descuento, reactivar un componente retirado). Mismo patrón que `dar-de-baja-equipo.e2e.spec.ts`:
 * tenant efímero, `soporte_master_test` truncada en `beforeEach` y `usarLockMasterTest()`. El
 * equipo se da de baja por HTTP (`POST /equipos/:id/baja`), no por SQL.
 */
import { randomBytes } from 'node:crypto';
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
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_incluirBajasE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eIncluirBajasSecret!123';

type Headers = Record<string, string>;
type Respuesta<T> = { status: number; data: T };

interface EquipoLista {
  id: string;
  nombre: string;
  activo: boolean;
  baja: { destino: string; categoria: string; motivo: string | null; fecha: string } | null;
}

async function http<T>(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Headers,
  body?: unknown,
): Promise<Respuesta<T>> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const texto = await res.text();
  let data: unknown = texto;
  try {
    data = JSON.parse(texto);
  } catch {
    /* el CSV no es JSON: se devuelve el texto */
  }
  return { status: res.status, data: data as T };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, AuthModule, EquiposModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Equipos e2e — lista y exportacion con incluirBajas (WU-14)', () => {
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
  const RUN_PREFIX = randomBytes(3).toString('hex').toUpperCase();

  let insumoNingunoId: string;
  let token: string;

  const PERMISOS = ['EQUIPOS:LECTURA', 'EQUIPOS:BORRADO', 'EQUIPOS:ALTAS', 'EQUIPOS:MODIFICACION'];

  async function limpiarFilas(): Promise<void> {
    await tenantClient.eventoUnidadInsumo.deleteMany();
    await tenantClient.componenteEquipo.deleteMany();
    await tenantClient.movimientoInsumo.deleteMany();
    await tenantClient.unidadInsumo.deleteMany();
    await tenantClient.equipoInformatico.deleteMany();
  }

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

    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${RUN_PREFIX}F`, nombre: 'Familia E2E bajas', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${RUN_PREFIX}U`, nombre: 'Entera E2E bajas', entera: true },
    });
    insumoNingunoId = (
      await tenantClient.insumo.create({
        data: {
          codigo: `${RUN_PREFIX}N`,
          nombre: 'Repuesto N E2E bajas',
          familiaId: familia.id,
          unidadMedidaId: unidadMedida.id,
        },
      })
    ).id;

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
    // Orden CRITICO: filas -> app.close() -> dropDatabase. Al reves, el DROP falla en silencio.
    try {
      await limpiarFilas();
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
    await limpiarFilas();
    token = (await crearActorConPermisos(PERMISOS)).accessToken;
  });

  // ─── Fixtures (master) ──────────────────────────────────────────────────

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Incluir bajas ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createRole(codigo: string): Promise<RoleEntity> {
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    return role;
  }

  async function createUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_incluir_bajas_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'IncluirBajas',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  /**
   * Actor con exactamente las celdas pedidas: rol con código DISTINTO de 'ADMINISTRADOR' para que
   * `resolverScope` no le dé el catálogo completo sin importar qué se sembró.
   */
  async function crearActorConPermisos(
    permisos: string[],
  ): Promise<{ accessToken: string; usuarioId: string }> {
    const cliente = await crearClienteTenant();
    const role = await createRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const { data } = await http<{ accessToken: string }>(
      'POST',
      `${baseUrl}/auth/login`,
      {},
      {
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      },
    );
    return { accessToken: data.accessToken, usuarioId: usuario.id };
  }

  // ─── Fixtures (tenant) ──────────────────────────────────────────────────

  async function crearEquipoConPieza(
    nombre: string,
  ): Promise<{ id: string; componenteId: string }> {
    const equipo = await tenantClient.equipoInformatico.create({
      data: {
        nombre: `${nombre} ${RUN_PREFIX}`,
        numeroSerie: `SN-${randomBytes(3).toString('hex')}`,
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: { equipoId: equipo.id, insumoId: insumoNingunoId },
    });
    return { id: equipo.id, componenteId: componente.id };
  }

  /** Da de baja por HTTP (DESCARTE: no mueve stock) y exige el 200. */
  async function darDeBaja(equipoId: string): Promise<void> {
    const res = await http<unknown>('POST', `${baseUrl}/equipos/${equipoId}/baja`, bearer(token), {
      destino: 'DESCARTE',
      categoria: 'VEJEZ',
    });
    expect(res.status).toBe(200);
  }

  /** Un equipo vigente y otro dado de baja, para las pruebas de la lista y la exportacion. */
  async function vigenteYDadoDeBaja(): Promise<{ vigente: string; deBaja: string }> {
    const vigente = await crearEquipoConPieza('Vigente');
    const deBaja = await crearEquipoConPieza('Retirado');
    await darDeBaja(deBaja.id);
    return { vigente: vigente.id, deBaja: deBaja.id };
  }

  const listar = (query = '') =>
    http<EquipoLista[]>('GET', `${baseUrl}/equipos${query}`, bearer(token));
  const exportar = (query = '') =>
    http<string>('GET', `${baseUrl}/equipos/export${query}`, bearer(token));

  /** Lo que un guard debe dejar intacto: el equipo, sus componentes y el stock. */
  async function foto(equipoId: string): Promise<string[]> {
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    const componentes = await tenantClient.componenteEquipo.findMany({ orderBy: { id: 'asc' } });
    return [
      `equipo:${equipo.nombre}:${equipo.activo}:${equipo.bajaDestino}`,
      ...componentes.map((c) => `comp:${c.id}:${c.deletedAt}:${c.bajaDestino}`),
      `movimientos:${await tenantClient.movimientoInsumo.count()}`,
      `unidades:${await tenantClient.unidadInsumo.count()}`,
    ];
  }

  // ─── R11: lista ─────────────────────────────────────────────────────────

  describe('GET /equipos', () => {
    it('por defecto solo trae el equipo vigente (baja: null)', async () => {
      const { vigente } = await vigenteYDadoDeBaja();

      const res = await listar();

      expect(res.status).toBe(200);
      expect(res.data.map((e) => e.id)).toEqual([vigente]);
      expect(res.data[0].baja).toBeNull();
    });

    it('incluirBajas=false equivale al default', async () => {
      const { vigente } = await vigenteYDadoDeBaja();

      expect((await listar('?incluirBajas=false')).data.map((e) => e.id)).toEqual([vigente]);
    });

    it('incluirBajas=true trae ambos, y el dado de baja lleva su baja', async () => {
      const { vigente, deBaja } = await vigenteYDadoDeBaja();

      const res = await listar('?incluirBajas=true');

      expect(res.status).toBe(200);
      expect(res.data.map((e) => e.id).sort()).toEqual([vigente, deBaja].sort());
      const retirado = res.data.find((e) => e.id === deBaja);
      expect(retirado?.activo).toBe(false);
      expect(retirado?.baja).toMatchObject({ destino: 'DESCARTE', categoria: 'VEJEZ' });
      expect(res.data.find((e) => e.id === vigente)?.baja).toBeNull();
    });

    it('un equipo con borrado logico no aparece ni con incluirBajas=true', async () => {
      const { vigente } = await vigenteYDadoDeBaja();
      const borrado = await crearEquipoConPieza('Borrado');
      await tenantClient.componenteEquipo.deleteMany({ where: { equipoId: borrado.id } });
      await tenantClient.equipoInformatico.update({
        where: { id: borrado.id },
        data: { deletedAt: new Date() },
      });

      const ids = (await listar('?incluirBajas=true')).data.map((e) => e.id);

      expect(ids).toContain(vigente);
      expect(ids).not.toContain(borrado.id);
    });

    it('un valor que no es booleano da 400', async () => {
      expect((await listar('?incluirBajas=quizas')).status).toBe(400);
    });

    it('sin EQUIPOS:LECTURA da 403, con o sin el filtro', async () => {
      // Un solo actor por test (UNIQUE de clientes.db_name): se reemplaza el del beforeEach.
      await masterClient.$executeRawUnsafe(
        'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
      );
      const sinLectura = await crearActorConPermisos(['EQUIPOS:BORRADO']);
      const res = await http<unknown>(
        'GET',
        `${baseUrl}/equipos?incluirBajas=true`,
        bearer(sinLectura.accessToken),
      );
      expect(res.status).toBe(403);
    });
  });

  // ─── R11: exportacion ───────────────────────────────────────────────────

  describe('GET /equipos/export', () => {
    it('por defecto el CSV solo trae el equipo vigente', async () => {
      await vigenteYDadoDeBaja();

      const res = await exportar();

      expect(res.status).toBe(200);
      expect(res.data).toContain(`Vigente ${RUN_PREFIX}`);
      expect(res.data).not.toContain(`Retirado ${RUN_PREFIX}`);
      expect(res.data).not.toContain('Baja');
    });

    it('con incluirBajas=true trae ambos y el dado de baja dice "Baja" en Estado', async () => {
      await vigenteYDadoDeBaja();

      const res = await exportar('?incluirBajas=true');

      expect(res.status).toBe(200);
      const filas = res.data.split('\r\n');
      expect(filas.find((f) => f.startsWith(`Vigente ${RUN_PREFIX};`))).toMatch(/;Activo$/);
      expect(filas.find((f) => f.startsWith(`Retirado ${RUN_PREFIX};`))).toMatch(/;Baja$/);
    });
  });

  // ─── R8: un equipo dado de baja no admite cambios ───────────────────────

  describe('guards del equipo dado de baja', () => {
    it('PATCH /equipos/:id -> 422 y el equipo no cambia', async () => {
      const { deBaja } = await vigenteYDadoDeBaja();
      const antes = await foto(deBaja);

      const res = await http<unknown>('PATCH', `${baseUrl}/equipos/${deBaja}`, bearer(token), {
        nombre: 'Nombre nuevo',
      });

      expect(res.status).toBe(422);
      expect(await foto(deBaja)).toEqual(antes);
    });

    it.each([
      ['con descuento', true],
      ['sin descuento', false],
    ])(
      'POST /equipos/:id/componentes %s -> 422, sin componente ni stock',
      async (_, descontarStock) => {
        const { deBaja } = await vigenteYDadoDeBaja();
        const antes = await foto(deBaja);

        const res = await http<unknown>(
          'POST',
          `${baseUrl}/equipos/${deBaja}/componentes`,
          bearer(token),
          { insumoId: insumoNingunoId, descontarStock },
        );

        expect(res.status).toBe(422);
        expect(await foto(deBaja)).toEqual(antes);
      },
    );

    it('PATCH reactivar un componente retirado por la baja -> 422 y sigue retirado', async () => {
      const equipo = await crearEquipoConPieza('ParaReactivar');
      await darDeBaja(equipo.id);
      const antes = await foto(equipo.id);

      const res = await http<unknown>(
        'PATCH',
        `${baseUrl}/equipos/${equipo.id}/componentes/${equipo.componenteId}/reactivar`,
        bearer(token),
      );

      expect(res.status).toBe(422);
      expect(await foto(equipo.id)).toEqual(antes);
    });
  });
});
