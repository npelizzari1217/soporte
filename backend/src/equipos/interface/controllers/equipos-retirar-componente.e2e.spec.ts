/**
 * equipos-retirar-componente.e2e.spec.ts — WU-8a (sdd/stock-usado-componentes).
 *
 * App real contra Postgres real: `POST /equipos/:id/componentes/:componenteId/baja`
 * con sus dos desenlaces (`STOCK_USADO` y `DESCARTE`), el gating de permisos
 * (`EQUIPOS:BORRADO` alcanza SOLO, sin permisos de insumos) y la reactivación
 * posterior. Mismo patrón que `equipos-instalar-desde-deposito.e2e.spec.ts`:
 * tenant efímero, `soporte_master_test` truncada en `beforeEach` y
 * `usarLockMasterTest()`. Un solo actor por test: dos clientes con el mismo
 * `dbName` violan el UNIQUE de `clientes.db_name`.
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
import { ComponenteResponseDto } from '../dtos/equipos.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_equiposRetiroE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eEquiposRetiroSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que compras.e2e.spec.ts) ─────

type Headers = Record<string, string>;

async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
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

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Equipos e2e — retirar componente con destino (WU-8a)', () => {
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
  let contadorFamilia = 0;

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
    // Orden CRÍTICO (bug real documentado en compras.e2e.spec.ts): app.close()
    // SIEMPRE antes de dropDatabase.
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
  });

  // ─── Fixtures (master) ──────────────────────────────────────────────────

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Equipos Retiro ${randomBytes(3).toString('hex')}`,
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

  async function createUsuario(suffix: string, isGlobalAdmin = false): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_equipos_retiro_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'EquiposRetiro',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function createMembresia(
    usuarioId: string,
    clienteId: string,
    rolId: string,
  ): Promise<void> {
    await masterClient.membresia.create({ data: { usuarioId, clienteId, rolId, activo: true } });
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
      email,
      password: PLAINTEXT_PASSWORD,
    });
    return data;
  }

  /**
   * Actor con exactamente las celdas pedidas — mismo criterio que
   * `compras.e2e.spec.ts`: rol con código DISTINTO de 'ADMINISTRADOR' para
   * que `resolverScope` no le dé el catálogo completo sin importar qué se
   * sembró.
   */
  async function crearActorConPermisos(
    permisos: string[],
  ): Promise<{ accessToken: string; clienteId: string; usuarioId: string }> {
    const cliente = await crearClienteTenant();
    const role = await createRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, cliente.id, role.id);
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id, usuarioId: usuario.id };
  }

  /**
   * Familia de REPUESTO (`esRepuesto: true`, `activo: true`) — SIN fila
   * gemela en el catálogo MASTER de tipos de componente
   * (sdd/repuestos-autoridad-catalogo, ADR-1): la familia del tenant es la
   * ÚNICA autoridad del camino vinculado, y `AgregarComponenteUseCase` ya no
   * consulta MASTER para derivar ni validar el tipo de un componente
   * vinculado. Antes de este cambio (WU-3/WU-5) esta fábrica sembraba esa
   * fila gemela para esquivar el gate; ahora el gate no existe y sembrarla
   * sería probar un caso que ya no pasa por ese camino.
   */
  async function crearFamiliaRepuesto(): Promise<{
    familiaId: string;
    codigo: string;
    nombre: string;
  }> {
    contadorFamilia += 1;
    const codigo = `${RUN_PREFIX}F${contadorFamilia}`;
    const nombre = `Familia repuesto E2E ${contadorFamilia}`;
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo, nombre, esRepuesto: true, activo: true },
    });
    return { familiaId: familia.id, codigo, nombre };
  }

  async function crearUnidadMedida(): Promise<string> {
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${RUN_PREFIX}U${randomBytes(2).toString('hex')}`, nombre: 'Unidad E2E' },
    });
    return unidad.id;
  }

  async function crearInsumoRepuesto(familiaId: string, unidadMedidaId: string): Promise<string> {
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${RUN_PREFIX}I${randomBytes(3).toString('hex')}`,
        nombre: 'Repuesto E2E',
        familiaId,
        unidadMedidaId,
        activo: true,
      },
    });
    return insumo.id;
  }

  /** Siembra existencia directo en la bitácora — sin pasar por HTTP (fuera de alcance de este spec). */
  async function sembrarEntrada(
    insumoId: string,
    cantidad: number,
    usuarioId: string,
    condicion: 'NUEVO' | 'USADO' = 'NUEVO',
  ): Promise<void> {
    await tenantClient.movimientoInsumo.create({
      data: { insumoId, tipo: 'ENTRADA', condicion, cantidad, usuarioId },
    });
  }

  async function movimientosDe(insumoId: string) {
    return tenantClient.movimientoInsumo.findMany({
      where: { insumoId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Equipo de fixture creado DIRECTO contra la base (no vía HTTP): este spec
   * ejercita `POST .../componentes`, no `POST /equipos`, y crear
   * el equipo por HTTP obligaría a un SEGUNDO actor/cliente en tests donde el
   * actor bajo prueba no tiene `EQUIPOS:ALTAS` — dos clientes con el MISMO
   * `dbName` (esta única DB tenant efímera) violan el UNIQUE de
   * `clientes.db_name`. Mismo criterio que familia/unidad/insumo, ya
   * sembrados directo acá arriba.
   */
  async function crearEquipoDirecto(): Promise<string> {
    const equipo = await tenantClient.equipoInformatico.create({
      data: { nombre: `Equipo E2E ${randomBytes(3).toString('hex')}` },
    });
    return equipo.id;
  }

  /** Saldo de una condición: ENTRADAs menos SALIDAs de esa condición. */
  async function saldoDe(insumoId: string, condicion: 'NUEVO' | 'USADO'): Promise<number> {
    return (await movimientosDe(insumoId))
      .filter((m) => m.condicion === condicion)
      .reduce(
        (acc, m) => acc + (m.tipo === 'SALIDA' ? -Number(m.cantidad) : Number(m.cantidad)),
        0,
      );
  }

  /**
   * Componente instalado con su SALIDA vinculada (como lo deja la instalación
   * con descuento), armado directo contra la base: este spec ejercita el retiro.
   */
  async function crearComponenteInstalado(
    equipoId: string,
    insumoId: string,
    usuarioId: string,
  ): Promise<string> {
    const salida = await tenantClient.movimientoInsumo.create({
      data: { insumoId, tipo: 'SALIDA', condicion: 'NUEVO', cantidad: 1, usuarioId, equipoId },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId, instalacionMovimientoId: salida.id },
    });
    return componente.id;
  }

  async function escenarioBase(permisos: string[]) {
    const { familiaId } = await crearFamiliaRepuesto();
    const unidadMedidaId = await crearUnidadMedida();
    const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
    const actor = await crearActorConPermisos(permisos);
    await sembrarEntrada(insumoId, 5, actor.usuarioId);
    const equipoId = await crearEquipoDirecto();
    const componenteId = await crearComponenteInstalado(equipoId, insumoId, actor.usuarioId);
    return { actor, insumoId, equipoId, componenteId };
  }

  function bajaUrl(equipoId: string, componenteId: string): string {
    return `${baseUrl}/equipos/${equipoId}/componentes/${componenteId}/baja`;
  }

  function reactivarUrl(equipoId: string, componenteId: string): string {
    return `${baseUrl}/equipos/${equipoId}/componentes/${componenteId}/reactivar`;
  }

  describe('Gating de acceso', () => {
    it('sin JWT -> 401', async () => {
      const { status } = await httpPost(
        bajaUrl('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'),
        { destino: 'STOCK_USADO' },
      );
      expect(status).toBe(401);
    });

    it('con permisos de insumos pero SIN EQUIPOS:BORRADO -> 403 y nada cambia', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase([
        'EQUIPOS:LECTURA',
        'INSUMOS:LECTURA',
        'INSUMOS:ALTAS',
        'INSUMOS:AJUSTAR',
      ]);
      const antes = await movimientosDe(insumoId);

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await movimientosDe(insumoId)).toHaveLength(antes.length);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
      expect(fila.bajaDestino).toBeNull();
    });
  });

  describe('Retiro con destino', () => {
    it('STOCK_USADO con EQUIPOS:BORRADO y SIN permisos de insumos -> 200, ENTRADA USADO y saldo USADO +1', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase(['EQUIPOS:BORRADO']);
      expect(await saldoDe(insumoId, 'USADO')).toBe(0);

      const { status, data } = await httpPost<ComponenteResponseDto>(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.bajaDestino).toBe('STOCK_USADO');
      expect(data.bajaUsuarioId).toBe(actor.usuarioId);
      expect(data.bajaSinSalidaPrevia).toBe(false);
      expect(await saldoDe(insumoId, 'USADO')).toBe(1);
      const entradas = (await movimientosDe(insumoId)).filter(
        (m) => m.tipo === 'ENTRADA' && m.condicion === 'USADO',
      );
      expect(entradas).toHaveLength(1);
      expect(entradas[0].id).toBe(data.bajaMovimientoId);
      expect(entradas[0].equipoId).toBe(equipoId);
    });

    it('DESCARTE con motivo -> 200 y NINGUN movimiento nuevo', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase(['EQUIPOS:BORRADO']);
      const antes = (await movimientosDe(insumoId)).length;

      const { status, data } = await httpPost<ComponenteResponseDto>(
        bajaUrl(equipoId, componenteId),
        { destino: 'DESCARTE', motivo: 'Quemado' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.bajaDestino).toBe('DESCARTE');
      expect(data.bajaMotivo).toBe('Quemado');
      expect(data.bajaMovimientoId).toBeNull();
      expect(await movimientosDe(insumoId)).toHaveLength(antes);
    });

    it('DESCARTE sin motivo -> 422 y el componente sigue activo', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase(['EQUIPOS:BORRADO']);
      const antes = (await movimientosDe(insumoId)).length;

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'DESCARTE' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(await movimientosDe(insumoId)).toHaveLength(antes);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
    });

    it.each([
      { label: 'sin destino', body: {} },
      { label: 'destino invalido', body: { destino: 'OTRO' } },
    ])('$label -> 400 y nada cambia', async ({ body }) => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase(['EQUIPOS:BORRADO']);
      const antes = (await movimientosDe(insumoId)).length;

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        body,
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
      expect(await movimientosDe(insumoId)).toHaveLength(antes);
    });

    it.each(['STOCK_USADO', 'DESCARTE'])(
      'motivo de 501 caracteres con destino %s -> 400 (nunca 500) y nada cambia',
      async (destino) => {
        const { actor, insumoId, equipoId, componenteId } = await escenarioBase([
          'EQUIPOS:BORRADO',
        ]);
        const antes = (await movimientosDe(insumoId)).length;

        const { status } = await httpPost(
          bajaUrl(equipoId, componenteId),
          { destino, motivo: 'a'.repeat(501) },
          bearer(actor.accessToken),
        );

        expect(status).toBe(400);
        expect(await movimientosDe(insumoId)).toHaveLength(antes);
      },
    );

    it('componente ya retirado -> 422 y sin segundo movimiento', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase(['EQUIPOS:BORRADO']);
      const primero = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO' },
        bearer(actor.accessToken),
      );
      expect(primero.status).toBe(200);
      const antes = (await movimientosDe(insumoId)).length;

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(await movimientosDe(insumoId)).toHaveLength(antes);
      expect(await saldoDe(insumoId, 'USADO')).toBe(1);
    });
  });

  describe('Reactivar tras el retiro', () => {
    it('tras STOCK_USADO -> 422 y el saldo no cambia', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase([
        'EQUIPOS:BORRADO',
        'EQUIPOS:MODIFICACION',
      ]);
      await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO' },
        bearer(actor.accessToken),
      );

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(await saldoDe(insumoId, 'USADO')).toBe(1);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).not.toBeNull();
    });

    it('tras DESCARTE -> activo, con el registro limpio y el saldo sin cambios', async () => {
      const { actor, insumoId, equipoId, componenteId } = await escenarioBase([
        'EQUIPOS:BORRADO',
        'EQUIPOS:MODIFICACION',
      ]);
      await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'DESCARTE', motivo: 'Roto' },
        bearer(actor.accessToken),
      );
      const antes = (await movimientosDe(insumoId)).length;

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
      expect(fila.bajaDestino).toBeNull();
      expect(await movimientosDe(insumoId)).toHaveLength(antes);
    });

    it('de un retiro legado (sin destino) -> activo y saldo sin cambios', async () => {
      const { actor, insumoId, equipoId } = await escenarioBase([
        'EQUIPOS:BORRADO',
        'EQUIPOS:MODIFICACION',
      ]);
      const legado = await tenantClient.componenteEquipo.create({
        data: { equipoId, insumoId, deletedAt: new Date() },
      });
      const antes = (await movimientosDe(insumoId)).length;

      const { status } = await httpPatch(
        reactivarUrl(equipoId, legado.id),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: legado.id },
      });
      expect(fila.deletedAt).toBeNull();
      expect(await movimientosDe(insumoId)).toHaveLength(antes);
    });
  });
});
