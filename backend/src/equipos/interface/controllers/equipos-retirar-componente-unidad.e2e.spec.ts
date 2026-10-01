/**
 * equipos-retirar-componente-unidad.e2e.spec.ts — WU-11 (sdd/repuestos-numero-de-serie).
 *
 * App real contra Postgres real: el retiro (`POST .../baja`) de un componente que
 * lleva una unidad `SERIE` y de un componente LEGADO de un insumo hoy `SERIE`.
 * Los componentes legados y las unidades se siembran por SQL: la API ya no
 * crea un componente de texto libre para un insumo `SERIE`. Mismo patrón que
 * `equipos-retirar-componente.e2e.spec.ts`:
 * tenant efímero, `soporte_master_test` truncada en `beforeEach` y
 * `usarLockMasterTest()`. Un solo actor por test: dos clientes con el mismo
 * `dbName` violan el UNIQUE de `clientes.db_name`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
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

const TENANT_DB_NAME = `soporte_prov_equiposRetiroUnidadE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eEquiposRetiroUnidadSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que compras.e2e.spec.ts) ─────

type Headers = Record<string, string>;

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

describe('Equipos e2e — retiro y reactivar con unidad (WU-11)', () => {
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
      nombre: `E2E Equipos Retiro Unidad ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_equipos_retiro_unidad_${suffix}@test.local`,
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

  // ─── Fixtures de unidades (SQL: la API ya no crea legados de un insumo SERIE) ──

  /** Insumo `SERIE` de una familia de repuesto, con unidad de medida `entera`. */
  async function crearInsumoSerie(): Promise<string> {
    const { familiaId } = await crearFamiliaRepuesto();
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: {
        codigo: `${RUN_PREFIX}E${randomBytes(2).toString('hex')}`,
        nombre: 'Unidad entera E2E',
        entera: true,
      },
    });
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${RUN_PREFIX}S${randomBytes(3).toString('hex')}`,
        nombre: 'Repuesto SERIE E2E',
        familiaId,
        unidadMedidaId: unidadMedida.id,
        seguimiento: 'SERIE',
        activo: true,
      },
    });
    return insumo.id;
  }

  async function sembrarUnidadInstalada(
    insumoId: string,
    equipoId: string,
    serial: string,
  ): Promise<string> {
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId,
        numeroSerie: serial,
        numeroSerieNormalizado: serial.toUpperCase(),
        condicion: 'NUEVO',
        estado: 'INSTALADA',
        equipoId,
      },
    });
    return unidad.id;
  }

  async function crearComponenteConUnidad(
    equipoId: string,
    insumoId: string,
    unidadId: string,
  ): Promise<string> {
    return (await tenantClient.componenteEquipo.create({ data: { equipoId, insumoId, unidadId } }))
      .id;
  }

  /** Componente LEGADO (texto libre, sin unidad) de un insumo hoy `SERIE`. */
  async function crearComponenteLegado(
    equipoId: string,
    insumoId: string,
    numeroSerie: string | null,
  ): Promise<string> {
    return (
      await tenantClient.componenteEquipo.create({ data: { equipoId, insumoId, numeroSerie } })
    ).id;
  }

  async function eventosDe(unidadId: string) {
    return tenantClient.eventoUnidadInsumo.findMany({
      where: { unidadId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function escenarioConUnidad(permisos: string[], serial = 'SN-E2E-1') {
    const insumoId = await crearInsumoSerie();
    const actor = await crearActorConPermisos(permisos);
    const equipoId = await crearEquipoDirecto();
    const unidadId = await sembrarUnidadInstalada(insumoId, equipoId, serial);
    const componenteId = await crearComponenteConUnidad(equipoId, insumoId, unidadId);
    return { actor, insumoId, equipoId, unidadId, componenteId };
  }

  function bajaUrl(equipoId: string, componenteId: string): string {
    return `${baseUrl}/equipos/${equipoId}/componentes/${componenteId}/baja`;
  }

  describe('Retiro de un componente con unidad', () => {
    it('STOCK_USADO con EQUIPOS:BORRADO y sin permisos de insumos -> la unidad vuelve USADO con su serial y queda la ENTRADA', async () => {
      const { actor, insumoId, equipoId, unidadId, componenteId } = await escenarioConUnidad([
        'EQUIPOS:BORRADO',
      ]);

      const { status, data } = await httpPost<ComponenteResponseDto>(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO', motivo: 'se cambio por otra' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.bajaDestino).toBe('STOCK_USADO');
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad).toMatchObject({
        estado: 'EN_DEPOSITO',
        condicion: 'USADO',
        equipoId: null,
        numeroSerie: 'SN-E2E-1',
      });
      const entradas = await tenantClient.movimientoInsumo.findMany({
        where: { insumoId, tipo: 'ENTRADA', condicion: 'USADO' },
      });
      expect(entradas).toHaveLength(1);
      expect(entradas[0].id).toBe(data.bajaMovimientoId);
      const eventos = await eventosDe(unidadId);
      expect(eventos.map((e) => e.tipo)).toEqual(['RETIRO_A_DEPOSITO']);
      expect(eventos[0]).toMatchObject({ componenteId, equipoId, usuarioId: actor.usuarioId });
    });

    it('DESCARTE -> la unidad queda DESCARTADA, sin movimiento, con el evento DESCARTE del componente', async () => {
      const { actor, insumoId, equipoId, unidadId, componenteId } = await escenarioConUnidad([
        'EQUIPOS:BORRADO',
      ]);

      const { status, data } = await httpPost<ComponenteResponseDto>(
        bajaUrl(equipoId, componenteId),
        { destino: 'DESCARTE', motivo: 'se rompio' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.bajaDestino).toBe('DESCARTE');
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad).toMatchObject({ estado: 'DESCARTADA', equipoId: null });
      expect(await tenantClient.movimientoInsumo.count({ where: { insumoId } })).toBe(0);
      const eventos = await eventosDe(unidadId);
      expect(eventos.map((e) => e.tipo)).toEqual(['DESCARTE']);
      expect(eventos[0]).toMatchObject({ componenteId, motivo: 'se rompio' });
    });

    it('un retiro repetido -> 422 y la unidad no cambia dos veces', async () => {
      const { actor, equipoId, unidadId, componenteId } = await escenarioConUnidad([
        'EQUIPOS:BORRADO',
      ]);
      const cuerpo = { destino: 'DESCARTE', motivo: 'se rompio' };
      await httpPost(bajaUrl(equipoId, componenteId), cuerpo, bearer(actor.accessToken));

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        cuerpo,
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(await eventosDe(unidadId)).toHaveLength(1);
    });
  });

  describe('Retiro de un componente con unidad de origen sin salida (D3)', () => {
    /** Alta por HTTP sin descuento (D3): nace la unidad INSTALADA, sin SALIDA vinculada. */
    async function escenarioD3(serial: string) {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS', 'EQUIPOS:BORRADO']);
      const equipoId = await crearEquipoDirecto();
      const alta = await httpPost<ComponenteResponseDto>(
        `${baseUrl}/equipos/${equipoId}/componentes`,
        { insumoId, descontarStock: false, numeroSerie: serial },
        bearer(actor.accessToken),
      );
      expect(alta.status).toBe(201);
      const unidad = await tenantClient.unidadInsumo.findFirstOrThrow({ where: { insumoId } });
      expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId });
      return { actor, insumoId, equipoId, unidadId: unidad.id, componenteId: alta.data.id };
    }

    it('STOCK_USADO con motivo -> la unidad queda EN_DEPOSITO USADO con su serial, existe la ENTRADA y se marca sin salida previa', async () => {
      const { actor, insumoId, equipoId, unidadId, componenteId } = await escenarioD3('K9');

      const { status, data } = await httpPost<ComponenteResponseDto>(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO', motivo: 'pieza del equipo comprado' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.bajaDestino).toBe('STOCK_USADO');
      expect(data.bajaSinSalidaPrevia).toBe(true);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad).toMatchObject({
        estado: 'EN_DEPOSITO',
        condicion: 'USADO',
        equipoId: null,
        numeroSerie: 'K9',
      });
      const entradas = await tenantClient.movimientoInsumo.findMany({
        where: { insumoId, tipo: 'ENTRADA', condicion: 'USADO', unidadId },
      });
      expect(entradas).toHaveLength(1);
      expect(entradas[0].cantidad.toString()).toBe('1');
      expect(entradas[0].id).toBe(data.bajaMovimientoId);
      expect(
        await tenantClient.movimientoInsumo.count({ where: { insumoId, tipo: 'SALIDA' } }),
      ).toBe(0);
    });

    it('STOCK_USADO sin motivo -> 422 y la unidad sigue INSTALADA', async () => {
      const { actor, insumoId, equipoId, unidadId, componenteId } = await escenarioD3('K9');

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId });
      expect(await tenantClient.movimientoInsumo.count({ where: { insumoId } })).toBe(0);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
    });
  });

  describe('Retiro de un componente LEGADO de un insumo SERIE', () => {
    it('STOCK_USADO con serial -> 200 y nace una unidad USADO en depósito con ese serial', async () => {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO']);
      const equipoId = await crearEquipoDirecto();
      const componenteId = await crearComponenteLegado(equipoId, insumoId, 'LEGADO-1');

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO', motivo: 'venia sin salida', numeroSerie: '  LEGADO-1 ' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      const unidades = await tenantClient.unidadInsumo.findMany({ where: { insumoId } });
      expect(unidades).toHaveLength(1);
      expect(unidades[0]).toMatchObject({
        numeroSerie: 'LEGADO-1',
        estado: 'EN_DEPOSITO',
        condicion: 'USADO',
        equipoId: null,
      });
      expect((await eventosDe(unidades[0].id)).map((e) => e.tipo)).toEqual(['INGRESO']);
    });

    it('STOCK_USADO sin serial -> 422 y no cambia nada', async () => {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO']);
      const equipoId = await crearEquipoDirecto();
      const componenteId = await crearComponenteLegado(equipoId, insumoId, 'LEGADO-2');

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO', motivo: 'venia sin salida' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(await tenantClient.unidadInsumo.count({ where: { insumoId } })).toBe(0);
      expect(await tenantClient.movimientoInsumo.count({ where: { insumoId } })).toBe(0);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
    });

    it('STOCK_USADO con un serial que ya tiene otra unidad -> 409 y el componente sigue activo', async () => {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO']);
      const equipoId = await crearEquipoDirecto();
      await sembrarUnidadInstalada(insumoId, equipoId, 'REPETIDO-1');
      const componenteId = await crearComponenteLegado(equipoId, insumoId, 'REPETIDO-1');

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO', motivo: 'venia sin salida', numeroSerie: 'repetido-1' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(409);
      expect(await tenantClient.unidadInsumo.count({ where: { insumoId } })).toBe(1);
      expect(await tenantClient.movimientoInsumo.count({ where: { insumoId } })).toBe(0);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
    });

    it('DESCARTE sin serial -> 200: no hay unidad que dar de baja ni stock que tocar', async () => {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO']);
      const equipoId = await crearEquipoDirecto();
      const componenteId = await crearComponenteLegado(equipoId, insumoId, 'LEGADO-3');

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'DESCARTE', motivo: 'se rompio' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(await tenantClient.unidadInsumo.count({ where: { insumoId } })).toBe(0);
    });

    it('un numeroSerie demasiado largo -> 400', async () => {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO']);
      const equipoId = await crearEquipoDirecto();
      const componenteId = await crearComponenteLegado(equipoId, insumoId, 'LEGADO-4');

      const { status } = await httpPost(
        bajaUrl(equipoId, componenteId),
        { destino: 'STOCK_USADO', motivo: 'x', numeroSerie: 'a'.repeat(300) },
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
    });
  });

  // ─── Reactivar ──────────────────────────────────────────────────────────

  function reactivarUrl(equipoId: string, componenteId: string): string {
    return `${baseUrl}/equipos/${equipoId}/componentes/${componenteId}/reactivar`;
  }

  /**
   * Componente ya retirado y su unidad, sembrados por SQL como los deja cada camino:
   * `DESCARTE` (unidad DESCARTADA, ultimo evento DESCARTE de este componente) o
   * `STOCK_USADO` (unidad EN_DEPOSITO, con su ENTRADA).
   */
  async function escenarioRetirado(
    permisos: string[],
    destino: 'DESCARTE' | 'STOCK_USADO' = 'DESCARTE',
  ) {
    const insumoId = await crearInsumoSerie();
    const actor = await crearActorConPermisos(permisos);
    const equipoId = await crearEquipoDirecto();
    const unidadId = await sembrarUnidadInstalada(insumoId, equipoId, 'SN-REACT-1');
    const componenteId = await crearComponenteConUnidad(equipoId, insumoId, unidadId);

    let bajaMovimientoId: string | null = null;
    if (destino === 'STOCK_USADO') {
      bajaMovimientoId = (
        await tenantClient.movimientoInsumo.create({
          data: {
            insumoId,
            tipo: 'ENTRADA',
            condicion: 'USADO',
            cantidad: 1,
            usuarioId: actor.usuarioId,
            equipoId,
            unidadId,
          },
        })
      ).id;
    }
    await tenantClient.unidadInsumo.update({
      where: { id: unidadId },
      data:
        destino === 'DESCARTE'
          ? { estado: 'DESCARTADA', equipoId: null }
          : { estado: 'EN_DEPOSITO', condicion: 'USADO', equipoId: null },
    });
    await tenantClient.eventoUnidadInsumo.create({
      data: {
        unidadId,
        tipo: destino === 'DESCARTE' ? 'DESCARTE' : 'RETIRO_A_DEPOSITO',
        equipoId,
        componenteId,
        usuarioId: actor.usuarioId,
        movimientoId: bajaMovimientoId,
        motivo: 'sembrado',
      },
    });
    await tenantClient.componenteEquipo.update({
      where: { id: componenteId },
      data: {
        deletedAt: new Date(),
        bajaDestino: destino,
        bajaMotivo: 'sembrado',
        bajaMovimientoId,
        bajaUsuarioId: actor.usuarioId,
      },
    });
    return { actor, insumoId, equipoId, unidadId, componenteId };
  }

  describe('Reactivar un componente con unidad', () => {
    it('tras DESCARTE, con EQUIPOS:MODIFICACION y sin permisos de insumos -> 200, unidad INSTALADA en el equipo y evento REACTIVACION', async () => {
      const { actor, equipoId, unidadId, componenteId } = await escenarioRetirado([
        'EQUIPOS:MODIFICACION',
      ]);

      const { status, data } = await httpPatch<ComponenteResponseDto>(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.bajaDestino).toBeNull();
      expect(data.numeroSerie).toBe('SN-REACT-1');
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad).toMatchObject({ estado: 'INSTALADA', equipoId });
      const eventos = await eventosDe(unidadId);
      expect(eventos.map((e) => e.tipo)).toEqual(['DESCARTE', 'REACTIVACION']);
      expect(eventos[1]).toMatchObject({ componenteId, equipoId, usuarioId: actor.usuarioId });
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).toBeNull();
    });

    it('sin EQUIPOS:MODIFICACION -> 403 y nada cambia', async () => {
      const { actor, equipoId, unidadId, componenteId } = await escenarioRetirado([
        'EQUIPOS:LECTURA',
        'INSUMOS:AJUSTAR',
      ]);

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await eventosDe(unidadId)).toHaveLength(1);
    });

    it('tras devolverlo al stock como USADO -> 422 (asimetria vigente) y la unidad sigue en deposito', async () => {
      const { actor, equipoId, unidadId, componenteId } = await escenarioRetirado(
        ['EQUIPOS:MODIFICACION'],
        'STOCK_USADO',
      );

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad.estado).toBe('EN_DEPOSITO');
    });

    it('con la unidad descartada por OTRO evento (no por este componente) -> 422 y nada cambia', async () => {
      const { actor, equipoId, unidadId, componenteId } = await escenarioRetirado([
        'EQUIPOS:MODIFICACION',
      ]);
      await tenantClient.eventoUnidadInsumo.create({
        data: {
          unidadId,
          tipo: 'DESCARTE',
          equipoId,
          componenteId: randomUUID(),
          usuarioId: actor.usuarioId,
          motivo: 'otro componente',
        },
      });

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad.estado).toBe('DESCARTADA');
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).not.toBeNull();
    });

    it('con la pieza recuperada (ADR-14) -> 422 y el componente sigue dado de baja', async () => {
      const { actor, equipoId, unidadId, componenteId } = await escenarioRetirado([
        'EQUIPOS:MODIFICACION',
      ]);
      // Estado que deja la recuperacion: unidad de nuevo en deposito, ultimo evento RECUPERACION.
      await tenantClient.unidadInsumo.update({
        where: { id: unidadId },
        data: { estado: 'EN_DEPOSITO', condicion: 'USADO' },
      });
      await tenantClient.eventoUnidadInsumo.create({
        data: {
          unidadId,
          tipo: 'RECUPERACION',
          usuarioId: actor.usuarioId,
          motivo: 'se recupero',
        },
      });

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
        where: { id: componenteId },
      });
      expect(fila.deletedAt).not.toBeNull();
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad.estado).toBe('EN_DEPOSITO');
    });

    it('con el insumo vuelto a NINGUNO -> 422 y no se reinstala nada', async () => {
      const { actor, insumoId, equipoId, unidadId, componenteId } = await escenarioRetirado([
        'EQUIPOS:MODIFICACION',
      ]);
      await tenantClient.insumo.update({
        where: { id: insumoId },
        data: { seguimiento: 'NINGUNO' },
      });

      const { status } = await httpPatch(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({ where: { id: unidadId } });
      expect(unidad.estado).toBe('DESCARTADA');
    });
  });

  describe('Reactivar un componente LEGADO', () => {
    it('retiro legado (sin unidad) de un insumo SERIE -> 200, como siempre, sin eventos de unidad', async () => {
      const insumoId = await crearInsumoSerie();
      const actor = await crearActorConPermisos(['EQUIPOS:MODIFICACION']);
      const equipoId = await crearEquipoDirecto();
      const componenteId = await crearComponenteLegado(equipoId, insumoId, 'LEGADO-R1');
      await tenantClient.componenteEquipo.update({
        where: { id: componenteId },
        data: { deletedAt: new Date() },
      });

      const { status, data } = await httpPatch<ComponenteResponseDto>(
        reactivarUrl(equipoId, componenteId),
        {},
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.numeroSerie).toBe('LEGADO-R1');
      expect(await tenantClient.eventoUnidadInsumo.count({ where: { unidad: { insumoId } } })).toBe(
        0,
      );
    });
  });
});
