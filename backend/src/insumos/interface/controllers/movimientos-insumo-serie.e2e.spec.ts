/**
 * movimientos-insumo-serie.e2e.spec.ts — levanta la app REAL y pega por HTTP a
 * las rutas de movimientos con un insumo `SERIE` (repuestos-numero-de-serie,
 * WU-8a). Como ningún insumo es `SERIE` por HTTP hasta WU-12a, el insumo se
 * prepara por SQL directo en el tenant efímero.
 *
 * Cubre lo que los unit tests no ven: el mapeo HTTP de cada error de unidades
 * (409 / 422), el 400 del serial por su largo NORMALIZADO, los permisos por
 * celda y la respuesta ampliada de la entrada (todos los movimientos).
 *
 * Mismo patrón de provisioning que `movimientos-insumo.e2e.spec.ts`; higiene en
 * el orden: limpiar filas -> `app.close()` -> `dropDatabase`.
 */
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
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
import { InsumosModule } from '../../insumos.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { CodigoAccion } from '../../../shared/domain/acciones';
import {
  MovimientosRegistradosResponseDto,
  MovimientoInsumoResponseDto,
  StockInsumoResponseDto,
} from '../dtos/movimientos-insumo.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_movserE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eMovSerieSecret!123';

/** URL del tenant efímero: la de la master de test con el nombre de la base cambiado. */
function urlDeTenant(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

type Headers = Record<string, string>;

/** POST con `.json().catch(() => null)`: un body vacío no debe romper el parseo. */
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

/** Hermano de `httpPost` para GET. */
async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

/** Sufijo corto y único, para que los códigos del catálogo no choquen entre casos. */
function sufijo(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

@Module({
  imports: [SharedModule, AuthModule, InsumosModule],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Movimientos de insumo SERIE e2e — borde HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;

  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const tenantPool = new Pool({ connectionString: urlDeTenant(TENANT_DB_NAME) });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
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

  // El cierre se traga el error a propósito para que `dropDatabase` corra
  // igual — si no, un cierre fallido deja una base efímera huérfana. Pero se
  // loguea: tragar en silencio convierte el próximo huérfano en un misterio.
  afterAll(async () => {
    try {
      await tenantPool.query(
        'TRUNCATE TABLE eventos_unidad_insumo, movimientos_insumo, unidades_insumo, insumos CASCADE',
      );
    } catch (error) {
      console.error('[teardown] limpieza de filas falló, sigo al cierre igual:', error);
    }
    try {
      await app?.close();
    } catch (error) {
      console.error('[teardown] app.close() falló, sigo al dropDatabase igual:', error);
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (error) {
      console.error('[teardown] onModuleDestroy() falló, sigo al dropDatabase igual:', error);
    }
    await tenantPool.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  // `usuario_cliente_permisos` NO tiene FK declarada, así que el CASCADE de las
  // otras tablas no la alcanza: va nombrada. La base del TENANT no se trunca —
  // cada caso siembra su propio insumo con un código único, y la base efímera
  // se dropea entera al final.
  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E MovSerie ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function crearRole(codigo: string): Promise<RoleEntity> {
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    return role;
  }

  async function crearUsuario(): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_movser_${randomBytes(4).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: 'Movimientos',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function login(email: string): Promise<string> {
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
      email,
      password: PLAINTEXT_PASSWORD,
    });
    return data.accessToken;
  }

  /**
   * Actor con rol `ADMINISTRADOR`, que bypassea tanto `AdminClienteGuard` como
   * `AccionesGuard`. Es el único que puede sembrar el catálogo (familia, unidad
   * e insumo son ABM por ROL, Entrega 1), y crea el cliente/tenant.
   */
  async function crearAdministrador(): Promise<{ token: string; clienteId: string }> {
    const cliente = await crearClienteTenant();
    const role = await crearRole('ADMINISTRADOR');
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    return { token: await login(usuario.email), clienteId: cliente.id };
  }

  /**
   * Actor con EXACTAMENTE las celdas pedidas, en el MISMO cliente que el
   * administrador. El rol RBAC viejo va vacío a propósito: lo que decide es la
   * matriz.
   *
   * `crearClienteTenant()` usa un `TENANT_DB_NAME` fijo por archivo, así que un
   * segundo cliente chocaría contra el `db_name` UNIQUE: por eso los actores
   * restringidos se agregan al cliente que ya existe.
   */
  async function agregarActor(
    clienteId: string,
    permisos: CodigoAccion[],
  ): Promise<{ token: string; usuarioId: string }> {
    const role = await crearRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, clienteId, permisos);
    return { token: await login(usuario.email), usuarioId: usuario.id };
  }

  /** Siembra familia + unidad + insumo con el administrador y devuelve el id del insumo. */
  async function sembrarInsumo(tokenAdmin: string, opciones: { serie: boolean }): Promise<string> {
    const marca = sufijo();

    const familia = await httpPost<{ id: string }>(
      `${baseUrl}/familias-insumo`,
      {
        codigo: `FAM_${marca}`,
        nombre: 'Familia de prueba',
        esRepuesto: false,
      },
      bearer(tokenAdmin),
    );
    expect(familia.status).toBe(201);

    const unidad = await httpPost<{ id: string }>(
      `${baseUrl}/unidades-medida`,
      { codigo: `UM_${marca}`, nombre: 'Unidad de prueba' },
      bearer(tokenAdmin),
    );
    expect(unidad.status).toBe(201);

    const insumo = await httpPost<{ id: string }>(
      `${baseUrl}/insumos`,
      {
        codigo: `INS_${marca}`,
        nombre: 'Tóner de prueba',
        familiaId: familia.data.id,
        unidadMedidaId: unidad.data.id,
        stockMinimo: null,
      },
      bearer(tokenAdmin),
    );
    expect(insumo.status).toBe(201);

    if (opciones.serie) {
      // Ningún insumo es SERIE por HTTP hasta WU-12a: se prepara por SQL directo.
      await tenantPool.query(`UPDATE unidades_medida SET entera = true WHERE id = $1`, [
        unidad.data.id,
      ]);
      await tenantPool.query(`UPDATE insumos SET seguimiento = 'SERIE' WHERE id = $1`, [
        insumo.data.id,
      ]);
    }

    return insumo.data.id;
  }

  async function prepararEscenario(
    opciones: { serie: boolean } = { serie: true },
  ): Promise<{ tokenAdmin: string; token: string; tokenLectura: string; insumoId: string }> {
    const administrador = await crearAdministrador();
    const insumoId = await sembrarInsumo(administrador.token, opciones);
    const actor = await agregarActor(administrador.clienteId, ['INSUMOS:ALTAS', 'INSUMOS:AJUSTAR']);
    const lector = await agregarActor(administrador.clienteId, ['INSUMOS:LECTURA']);
    return {
      tokenAdmin: administrador.token,
      token: actor.token,
      tokenLectura: lector.token,
      insumoId,
    };
  }

  function url(insumoId: string, ruta: 'entrada' | 'salida' | 'ajuste'): string {
    return `${baseUrl}/insumos/${insumoId}/movimientos/${ruta}`;
  }

  async function ingresar(
    e: { token: string; insumoId: string },
    seriales: string[],
  ): Promise<MovimientosRegistradosResponseDto> {
    const res = await httpPost<MovimientosRegistradosResponseDto>(
      url(e.insumoId, 'entrada'),
      { cantidad: seriales.length, seriales },
      bearer(e.token),
    );
    expect(res.status).toBe(201);
    return res.data;
  }

  describe('insumo SERIE', () => {
    it('la entrada con seriales responde TODOS los movimientos, uno por unidad', async () => {
      const e = await prepararEscenario();

      const data = await ingresar(e, ['SN-1', 'SN-2']);

      expect(data.movimientos).toHaveLength(2);
      expect(data.movimientos.map((m) => m.numeroSerie)).toEqual(['SN-1', 'SN-2']);
      expect(data.movimientos.every((m) => m.unidadId !== null && m.cantidad === 1)).toBe(true);
      expect(data.id).toBe(data.movimientos[0].id);

      const stock = await httpGet<StockInsumoResponseDto>(
        `${baseUrl}/insumos/${e.insumoId}/stock`,
        bearer(e.tokenLectura),
      );
      expect(stock.status).toBe(200);
      expect(stock.data.seguimiento).toBe('SERIE');
      expect(stock.data.stock).toBe(2);
      expect(stock.data.pendientesDeSerie).toBe(0);
    });

    it('la salida con unidadId saca esa unidad y la publica', async () => {
      const e = await prepararEscenario();
      const { movimientos } = await ingresar(e, ['SN-1', 'SN-2']);

      const salida = await httpPost<MovimientoInsumoResponseDto>(
        url(e.insumoId, 'salida'),
        { cantidad: 1, unidadId: movimientos[0].unidadId },
        bearer(e.token),
      );

      expect(salida.status).toBe(201);
      expect(salida.data.tipo).toBe('SALIDA');
      expect(salida.data.unidadId).toBe(movimientos[0].unidadId);
      expect(salida.data.numeroSerie).toBe('SN-1');
    });

    it('el ajuste negativo con unidadId da de baja esa unidad', async () => {
      const e = await prepararEscenario();
      const { movimientos } = await ingresar(e, ['SN-1']);

      const ajuste = await httpPost<MovimientosRegistradosResponseDto>(
        url(e.insumoId, 'ajuste'),
        {
          tipo: 'AJUSTE_NEGATIVO',
          cantidad: 1,
          motivo: 'Conteo físico',
          unidadId: movimientos[0].unidadId,
        },
        bearer(e.token),
      );

      expect(ajuste.status).toBe(201);
      expect(ajuste.data.tipo).toBe('AJUSTE_NEGATIVO');
      expect(ajuste.data.movimientos).toHaveLength(1);
      expect(ajuste.data.unidadId).toBe(movimientos[0].unidadId);
    });

    it('403: sin INSUMOS:ALTAS no entra, aunque tenga LECTURA', async () => {
      const e = await prepararEscenario();

      const res = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, seriales: ['SN-1'] },
        bearer(e.tokenLectura),
      );

      expect(res.status).toBe(403);
    });

    it('409: un serial duplicado (también en otra capitalización y con espacios)', async () => {
      const e = await prepararEscenario();
      await ingresar(e, ['SN-DUP']);

      const res = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, seriales: ['sn-dup'] },
        bearer(e.token),
      );

      expect(res.status).toBe(409);
    });

    it('422: SerialesNoCoinciden, CantidadNoEntera, UnidadRequerida y UnidadNoDisponible', async () => {
      const e = await prepararEscenario();
      const { movimientos } = await ingresar(e, ['SN-1']);

      const noCoinciden = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 3, seriales: ['SN-2'] },
        bearer(e.token),
      );
      const noEntera = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1.5, seriales: ['SN-3'] },
        bearer(e.token),
      );
      const sinUnidad = await httpPost(url(e.insumoId, 'salida'), { cantidad: 1 }, bearer(e.token));
      const primera = await httpPost(
        url(e.insumoId, 'salida'),
        { cantidad: 1, unidadId: movimientos[0].unidadId },
        bearer(e.token),
      );
      const yaSalio = await httpPost(
        url(e.insumoId, 'salida'),
        { cantidad: 1, unidadId: movimientos[0].unidadId },
        bearer(e.token),
      );

      expect(noCoinciden.status).toBe(422);
      expect(noEntera.status).toBe(422);
      expect(sinUnidad.status).toBe(422);
      expect(primera.status).toBe(201);
      expect(yaSalio.status).toBe(422);
    });

    it('UnidadNoAdmitida: la entrada con unidadId y la salida con seriales son 422', async () => {
      const e = await prepararEscenario();
      const { movimientos } = await ingresar(e, ['SN-1']);

      const entrada = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, unidadId: movimientos[0].unidadId },
        bearer(e.token),
      );
      const salida = await httpPost(
        url(e.insumoId, 'salida'),
        { cantidad: 1, seriales: ['SN-9'] },
        bearer(e.token),
      );

      expect(entrada.status).toBe(422);
      expect(salida.status).toBe(422);
    });

    it('400: un serial cuya forma normalizada pasa de 255 (128 "ß" -> 256)', async () => {
      const e = await prepararEscenario();

      const res = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, seriales: ['ß'.repeat(128)] },
        bearer(e.token),
      );

      expect(res.status).toBe(400);
    });

    it('400: más de 100 seriales, un serial vacío y un unidadId que no es uuid', async () => {
      const e = await prepararEscenario();

      const demasiados = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 101, seriales: Array.from({ length: 101 }, (_, i) => `SN-${i}`) },
        bearer(e.token),
      );
      const vacio = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, seriales: ['   '] },
        bearer(e.token),
      );
      const mal = await httpPost(
        url(e.insumoId, 'salida'),
        { cantidad: 1, unidadId: 'no-es-uuid' },
        bearer(e.token),
      );

      expect([demasiados.status, vacio.status, mal.status]).toEqual([400, 400, 400]);
    });
  });

  describe('insumo NINGUNO', () => {
    it('rechaza seriales y unidadId con 422, en entrada, salida y ajuste', async () => {
      const e = await prepararEscenario({ serie: false });
      const unidadId = '11111111-1111-4111-8111-111111111111';

      const entradaSeriales = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, seriales: ['SN-1'] },
        bearer(e.token),
      );
      const entradaUnidad = await httpPost(
        url(e.insumoId, 'entrada'),
        { cantidad: 1, unidadId },
        bearer(e.token),
      );
      await httpPost(url(e.insumoId, 'entrada'), { cantidad: 5 }, bearer(e.token));
      const salidaUnidad = await httpPost(
        url(e.insumoId, 'salida'),
        { cantidad: 1, unidadId },
        bearer(e.token),
      );
      const ajusteUnidad = await httpPost(
        url(e.insumoId, 'ajuste'),
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1, motivo: 'Conteo', unidadId },
        bearer(e.token),
      );
      const ajusteSeriales = await httpPost(
        url(e.insumoId, 'ajuste'),
        { tipo: 'AJUSTE_POSITIVO', cantidad: 1, motivo: 'Conteo', seriales: ['SN-1'] },
        bearer(e.token),
      );

      expect([
        entradaSeriales.status,
        entradaUnidad.status,
        salidaUnidad.status,
        ajusteUnidad.status,
        ajusteSeriales.status,
      ]).toEqual([422, 422, 422, 422, 422]);
    });

    it('la entrada de siempre sigue respondiendo el asiento, con unidadId y numeroSerie nulos', async () => {
      const e = await prepararEscenario({ serie: false });

      const res = await httpPost<MovimientosRegistradosResponseDto>(
        url(e.insumoId, 'entrada'),
        { cantidad: 4 },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data.cantidad).toBe(4);
      expect(res.data.unidadId).toBeNull();
      expect(res.data.numeroSerie).toBeNull();
      expect(res.data.movimientos).toHaveLength(1);
    });
  });
});
