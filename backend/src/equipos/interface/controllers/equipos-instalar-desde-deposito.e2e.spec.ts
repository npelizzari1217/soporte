/**
 * equipos-instalar-desde-deposito.e2e.spec.ts — WU-4
 * (sdd/repuestos-instalar-desde-deposito, issue #153; retargeteado en el ciclo
 * catalogo-unico-componentes, ADR-1).
 *
 * Levanta la app REAL (Nest, sin mocks de infraestructura) y pega por HTTP a
 * `POST /equipos/:id/componentes` (con `descontarStock` omitido = descuenta). Mismo patrón que
 * `compras/interface/controllers/compras.e2e.spec.ts`: DB tenant efímera
 * provisionada (`soporte_prov_equiposInstalarE2E_<rand>_test`), fetch nativo,
 * `soporte_master_test` truncada en `beforeEach`, `usarLockMasterTest()` para
 * el turno exclusivo sobre esa base compartida.
 *
 * Es acá, contra Postgres REAL y no un mock, donde vive la prueba de la
 * ATOMICIDAD (mecanismo S36, ver JSDoc de `InstalarComponenteDesdeDepositoUseCase`):
 * un mock del stock "commitea" igual sin importar si el mecanismo de rollback
 * funciona — el punto entero es que Postgres deshaga la escritura del
 * componente cuando la salida de stock falla.
 *
 * Necesita, además de lo que `compras.e2e.spec.ts` siembra a mano
 * (familia/unidad de insumos), la familia de REPUESTO de fixture
 * (`crearFamiliaRepuesto`) — que YA NO siembra una fila gemela en el
 * catálogo MASTER de tipos de componente (sdd/repuestos-autoridad-catalogo,
 * ADR-1): la familia del tenant es la única autoridad del camino vinculado,
 * y `AgregarComponenteUseCase` (reusado por el use case bajo prueba) ya no
 * consulta MASTER para ese camino.
 *
 * Ref issue: #153. Ref precedente: `compras.e2e.spec.ts` (mismo patrón),
 * `registrar-operacion-compra.s36.integration.spec.ts` (mismo mecanismo).
 * Ref: sdd/repuestos-autoridad-catalogo (WU-2).
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
import { ComponenteResponseDto, EquipoDetalleResponseDto } from '../dtos/equipos.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_equiposInstalarE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eEquiposInstalarSecret!123';

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

async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, { method: 'GET', headers });
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

describe('Equipos e2e — instalar componente desde depósito (WU-4, issue #153)', () => {
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
      nombre: `E2E Equipos Instalar ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_equipos_instalar_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'EquiposInstalar',
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

  async function componentesDe(equipoId: string) {
    return tenantClient.componenteEquipo.findMany({ where: { equipoId } });
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

  function installUrl(equipoId: string): string {
    return `${baseUrl}/equipos/${equipoId}/componentes`;
  }

  // ─── Gating de acceso ─────────────────────────────────────────────────

  describe('Gating de acceso', () => {
    it('sin JWT → 401', async () => {
      const { status } = await httpPost(installUrl('00000000-0000-4000-8000-000000000001'), {
        insumoId: '00000000-0000-4000-8000-000000000002',
      });
      expect(status).toBe(401);
    });

    it('con JWT pero SIN EQUIPOS:ALTAS → 403 y NO registra ningún movimiento', async () => {
      const { familiaId, codigo } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:LECTURA']);
      await sembrarEntrada(insumoId, 5, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await movimientosDe(insumoId)).toHaveLength(1); // solo la entrada sembrada, ninguna salida
      expect(await componentesDe(equipoId)).toHaveLength(0);
      void codigo;
    });

    /**
     * La decisión de permisos del issue #153, fijada con un test para que un
     * cambio futuro no la revierta por accidente: `EQUIPOS:ALTAS` alcanza
     * SOLO, sin ningún permiso de INSUMOS. Mismo criterio ya vigente para
     * `RegistrarRecepcionDeItemUseCase` (COMPRAS:MODIFICACION suma stock sin
     * permiso de insumos).
     */
    it('con EQUIPOS:ALTAS y SIN ningún permiso de INSUMOS → permite instalar (decisión deliberada del issue #153)', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      await sembrarEntrada(insumoId, 5, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).not.toBe(403);
      expect(status).toBe(201);
    });
  });

  // ─── Flujo feliz ──────────────────────────────────────────────────────

  describe('Flujo feliz', () => {
    it('instala: crea EXACTAMENTE un componente vinculado + UN movimiento SALIDA de cantidad 1 con equipoId poblado, y el stock baja en 1', async () => {
      const { familiaId, nombre } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      // `EQUIPOS:LECTURA` además de `EQUIPOS:ALTAS`: el GET posterior de este
      // test necesita el mismo actor para leer el detalle recién creado.
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS', 'EQUIPOS:LECTURA']);
      await sembrarEntrada(insumoId, 5, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const { status, data } = await httpPost<ComponenteResponseDto>(
        installUrl(equipoId),
        { insumoId, descripcion: 'Instalado desde depósito E2E' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.insumoId).toBe(insumoId);
      expect(data.equipoId).toBe(equipoId);
      // La respuesta ya no expone el tipo (ADR-6); el derivado de la familia
      // se persiste igual y se verifica contra la base más abajo.
      expect(data).not.toHaveProperty('tipoComponenteCodigo');

      // sdd/repuestos-autoridad-catalogo (ADR-1/ADR-2): la familia NO tiene
      // fila en MASTER (`crearFamiliaRepuesto` ya no la siembra) y el detalle
      // igual muestra su nombre real con `tipoActivo: true` — nunca "dado de
      // baja" — porque resuelve por el catálogo del TENANT, no por MASTER.
      const detalle = await httpGet<EquipoDetalleResponseDto>(
        `${baseUrl}/equipos/${equipoId}`,
        bearer(actor.accessToken),
      );
      expect(detalle.status).toBe(200);
      const componenteDetalle = detalle.data.componentes.find((c) => c.insumoId === insumoId);
      expect(componenteDetalle?.tipoNombre).toBe(nombre);
      expect(componenteDetalle?.tipoActivo).toBe(true);

      const movimientos = await movimientosDe(insumoId);
      const salidas = movimientos.filter((m) => m.tipo === 'SALIDA');
      expect(salidas).toHaveLength(1);
      expect(Number(salidas[0].cantidad)).toBe(1);
      expect(salidas[0].equipoId).toBe(equipoId);
      // La atribucion sale del usuario autenticado (`JWT.sub`), NUNCA del body:
      // sin este assert, el endpoint podria estar anotando a cualquiera y la
      // trazabilidad de "quien instalo este repuesto" seria falsa.
      expect(salidas[0].usuarioId).toBe(actor.usuarioId);

      const componentes = await componentesDe(equipoId);
      expect(componentes).toHaveLength(1);
      expect(componentes[0].insumoId).toBe(insumoId);

      // Stock: 5 (entrada) - 1 (salida) = 4.
      const suma = movimientos.reduce(
        (acc, m) => acc + (m.tipo === 'SALIDA' ? -Number(m.cantidad) : Number(m.cantidad)),
        0,
      );
      expect(suma).toBe(4);
    });
  });

  // ─── Condición del saldo (stock-usado-componentes, WU-6) ──────────────

  describe('Condición del saldo del que sale la unidad', () => {
    async function prepararInsumo(entradas: { nuevo: number; usado: number }) {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      if (entradas.nuevo > 0) await sembrarEntrada(insumoId, entradas.nuevo, actor.usuarioId);
      if (entradas.usado > 0) {
        await sembrarEntrada(insumoId, entradas.usado, actor.usuarioId, 'USADO');
      }
      const equipoId = await crearEquipoDirecto();
      return { insumoId, actor, equipoId };
    }

    it('condicion USADO con saldo USADO: crea el componente y una SALIDA USADO vinculada', async () => {
      const { insumoId, actor, equipoId } = await prepararInsumo({ nuevo: 0, usado: 2 });

      const { status } = await httpPost<ComponenteResponseDto>(
        installUrl(equipoId),
        { insumoId, condicion: 'USADO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      const salidas = (await movimientosDe(insumoId)).filter((m) => m.tipo === 'SALIDA');
      expect(salidas).toHaveLength(1);
      expect(salidas[0].condicion).toBe('USADO');
      const componentes = await componentesDe(equipoId);
      expect(componentes).toHaveLength(1);
      expect(componentes[0].instalacionMovimientoId).toBe(salidas[0].id);
    });

    it('sin condicion, con NUEVO 0 y USADO 5: 422 y no se escribe nada', async () => {
      const { insumoId, actor, equipoId } = await prepararInsumo({ nuevo: 0, usado: 5 });

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(await componentesDe(equipoId)).toHaveLength(0);
      expect((await movimientosDe(insumoId)).filter((m) => m.tipo === 'SALIDA')).toHaveLength(0);
    });

    it('sin condicion con saldo NUEVO: la SALIDA es NUEVO y el componente queda vinculado', async () => {
      const { insumoId, actor, equipoId } = await prepararInsumo({ nuevo: 3, usado: 5 });

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      const salidas = (await movimientosDe(insumoId)).filter((m) => m.tipo === 'SALIDA');
      expect(salidas.map((m) => m.condicion)).toEqual(['NUEVO']);
      const componentes = await componentesDe(equipoId);
      expect(componentes[0].instalacionMovimientoId).toBe(salidas[0].id);
    });

    it('descontarStock false con condicion USADO: se ignora, sin movimiento y sin vínculo', async () => {
      const { insumoId, actor, equipoId } = await prepararInsumo({ nuevo: 0, usado: 0 });

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId, descontarStock: false, condicion: 'USADO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(await movimientosDe(insumoId)).toHaveLength(0);
      const componentes = await componentesDe(equipoId);
      expect(componentes).toHaveLength(1);
      expect(componentes[0].instalacionMovimientoId).toBeNull();
    });

    it('condicion fuera del catálogo: 400 y no se escribe nada', async () => {
      const { insumoId, actor, equipoId } = await prepararInsumo({ nuevo: 1, usado: 1 });

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId, condicion: 'REFURBISHED' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
      expect(await componentesDe(equipoId)).toHaveLength(0);
      expect((await movimientosDe(insumoId)).filter((m) => m.tipo === 'SALIDA')).toHaveLength(0);
    });
  });

  // ─── Atomicidad (S36) ─────────────────────────────────────────────────

  describe('Atomicidad — stock insuficiente rechaza TODA la operación (S36)', () => {
    it('sin stock (0 disponible): 422 StockInsuficienteError, NINGÚN componente se crea y NINGÚN movimiento de SALIDA queda persistido', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      // Sin sembrar ninguna entrada — el depósito está en cero.
      const equipoId = await crearEquipoDirecto();

      const { status, data } = await httpPost<{ message: string }>(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      expect(data.message).toContain(insumoId);

      expect(await componentesDe(equipoId)).toHaveLength(0);
      expect(await movimientosDe(insumoId)).toHaveLength(0);
    });

    it('agota el stock con una primera instalación exitosa; la segunda (sin stock) falla y deja EXACTAMENTE un componente y un movimiento', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      await sembrarEntrada(insumoId, 1, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const primera = await httpPost(installUrl(equipoId), { insumoId }, bearer(actor.accessToken));
      expect(primera.status).toBe(201);

      const segunda = await httpPost(installUrl(equipoId), { insumoId }, bearer(actor.accessToken));
      expect(segunda.status).toBe(422);

      expect(await componentesDe(equipoId)).toHaveLength(1);
      const movimientos = await movimientosDe(insumoId);
      expect(movimientos.filter((m) => m.tipo === 'SALIDA')).toHaveLength(1);
    });
  });

  // ─── descontarStock, ruta retirada y tipo derivado ────────────────────

  describe('descontarStock, ruta retirada y tipo derivado (ADR-1, ADR-2)', () => {
    it('descontarStock false: crea el componente y CERO movimientos, aunque no haya stock', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      const equipoId = await crearEquipoDirecto();

      const { status, data } = await httpPost<ComponenteResponseDto>(
        installUrl(equipoId),
        { insumoId, descontarStock: false },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.insumoId).toBe(insumoId);
      expect(await movimientosDe(insumoId)).toHaveLength(0);
      expect(await componentesDe(equipoId)).toHaveLength(1);
    });

    it('descontarStock omitido con stock disponible: crea el componente y UNA SALIDA', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      await sembrarEntrada(insumoId, 3, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      // 2 movimientos: la ENTRADA sembrada + la SALIDA del alta.
      const movimientos = await movimientosDe(insumoId);
      expect(movimientos).toHaveLength(2);
      expect(movimientos.filter((m) => m.tipo === 'SALIDA')).toHaveLength(1);
    });

    it('descontarStock en texto ("false") → 400 y no se escribe nada', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId, descontarStock: 'false' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
      expect(await componentesDe(equipoId)).toHaveLength(0);
    });

    it('sin insumoId → 400', async () => {
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(installUrl(equipoId), {}, bearer(actor.accessToken));

      expect(status).toBe(400);
      expect(await componentesDe(equipoId)).toHaveLength(0);
    });

    it('la ruta vieja instalar-desde-deposito ya no existe → 404', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      await sembrarEntrada(insumoId, 3, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(
        `${installUrl(equipoId)}/instalar-desde-deposito`,
        { insumoId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      expect(await componentesDe(equipoId)).toHaveLength(0);
      expect(await movimientosDe(insumoId)).toHaveLength(1);
    });

    it('GET /equipos/tipos-componente ya no existe (catálogo MASTER retirado) → 404', async () => {
      const actor = await crearActorConPermisos(['EQUIPOS:LECTURA']);

      const { status } = await httpGet(
        `${baseUrl}/equipos/tipos-componente`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
    });

    it('las 5 rutas raíz de /tipos-componente (ABM MASTER retirado) responden 404 incluso a ROOT', async () => {
      const root = await createUsuario(`root_${randomBytes(3).toString('hex')}`, true);
      const { accessToken } = await login(root.email);
      const id = '11111111-1111-4111-8111-111111111111';
      const rutas: Array<[string, string]> = [
        ['POST', `${baseUrl}/tipos-componente`],
        ['GET', `${baseUrl}/tipos-componente/admin`],
        ['PATCH', `${baseUrl}/tipos-componente/${id}`],
        ['POST', `${baseUrl}/tipos-componente/${id}/activar`],
        ['POST', `${baseUrl}/tipos-componente/${id}/desactivar`],
      ];

      for (const [method, url] of rutas) {
        const res = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...bearer(accessToken) },
          body: method === 'GET' ? undefined : JSON.stringify({}),
        });
        expect({ method, url, status: res.status }).toEqual({ method, url, status: 404 });
      }
    });

    it('un tipoComponenteCodigo sobrante se ignora: el alta sale igual, vinculada al insumo', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS']);
      const equipoId = await crearEquipoDirecto();

      const { status } = await httpPost(
        installUrl(equipoId),
        { insumoId, descontarStock: false, tipoComponenteCodigo: 'OTRO_TIPO' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      const componentes = await componentesDe(equipoId);
      expect(componentes).toHaveLength(1);
      expect(componentes[0].insumoId).toBe(insumoId);
    });
  });

  // ─── Retiro y reemplazo (verify W1/W2 de catalogo-unico-componentes) ───

  describe('Retiro sin stock y reemplazo como retiro más alta', () => {
    // El DELETE del componente se retiró (WU-8b): el retiro sin stock es `DESCARTE`.
    async function retirarDescartando(url: string, headers: Headers): Promise<number> {
      const { status } = await httpPost(
        `${url}/baja`,
        { destino: 'DESCARTE', motivo: 'Retiro sin devolución al stock' },
        headers,
      );
      return status;
    }

    it('Retiro sin stock: DESCARTE deja el componente borrado lógicamente y NO registra ningún movimiento', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoId = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos(['EQUIPOS:ALTAS', 'EQUIPOS:BORRADO']);
      await sembrarEntrada(insumoId, 5, actor.usuarioId);
      const equipoId = await crearEquipoDirecto();

      const alta = await httpPost<ComponenteResponseDto>(
        installUrl(equipoId),
        { insumoId },
        bearer(actor.accessToken),
      );
      expect(alta.status).toBe(201);
      // ENTRADA sembrada + SALIDA del alta con descuento.
      const antes = await movimientosDe(insumoId);
      expect(antes).toHaveLength(2);

      const status = await retirarDescartando(
        `${installUrl(equipoId)}/${alta.data.id}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      const [componente] = await componentesDe(equipoId);
      expect(componente.deletedAt).not.toBeNull();
      // Sin devolución: mismos movimientos, mismo saldo (5 - 1 = 4).
      const despues = await movimientosDe(insumoId);
      expect(despues.map((m) => m.id)).toEqual(antes.map((m) => m.id));
      const saldo = despues.reduce(
        (acc, m) => acc + (m.tipo === 'SALIDA' ? -Number(m.cantidad) : Number(m.cantidad)),
        0,
      );
      expect(saldo).toBe(4);
    });

    it('Reemplazo como retiro más alta: el A queda retirado con su insumo, el B activo y el detalle lista ambos', async () => {
      const { familiaId } = await crearFamiliaRepuesto();
      const unidadMedidaId = await crearUnidadMedida();
      const insumoA = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const insumoB = await crearInsumoRepuesto(familiaId, unidadMedidaId);
      const actor = await crearActorConPermisos([
        'EQUIPOS:ALTAS',
        'EQUIPOS:BORRADO',
        'EQUIPOS:LECTURA',
      ]);
      const equipoId = await crearEquipoDirecto();

      const altaA = await httpPost<ComponenteResponseDto>(
        installUrl(equipoId),
        { insumoId: insumoA, descontarStock: false },
        bearer(actor.accessToken),
      );
      expect(altaA.status).toBe(201);

      const retiro = await retirarDescartando(
        `${installUrl(equipoId)}/${altaA.data.id}`,
        bearer(actor.accessToken),
      );
      expect(retiro).toBe(200);

      const altaB = await httpPost<ComponenteResponseDto>(
        installUrl(equipoId),
        { insumoId: insumoB, descontarStock: false },
        bearer(actor.accessToken),
      );
      expect(altaB.status).toBe(201);

      const filas = await componentesDe(equipoId);
      const filaA = filas.find((c) => c.id === altaA.data.id);
      const filaB = filas.find((c) => c.id === altaB.data.id);
      expect(filaA?.insumoId).toBe(insumoA);
      expect(filaA?.deletedAt).not.toBeNull();
      expect(filaB?.insumoId).toBe(insumoB);
      expect(filaB?.deletedAt).toBeNull();

      const detalle = await httpGet<EquipoDetalleResponseDto>(
        `${baseUrl}/equipos/${equipoId}`,
        bearer(actor.accessToken),
      );
      expect(detalle.status).toBe(200);
      const ids = detalle.data.componentes.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([altaA.data.id, altaB.data.id]));
      // Ni el retiro ni el alta sin descuento tocaron el stock.
      expect(await movimientosDe(insumoA)).toHaveLength(0);
      expect(await movimientosDe(insumoB)).toHaveLength(0);
    });
  });

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_equiposInstalarE2E_.*_test$/);
  });
});
