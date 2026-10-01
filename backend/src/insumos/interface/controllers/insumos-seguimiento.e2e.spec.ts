/**
 * insumos-seguimiento.e2e.spec.ts — levanta la app REAL y pega por HTTP a
 * `PATCH /insumos/:id/seguimiento`, la llave que vuelve alcanzable el modo
 * `SERIE` (repuestos-numero-de-serie, WU-12a).
 *
 * Cubre activar y volver a `NINGUNO` con sus reglas (saldo, unidad no entera,
 * unidades vivas), el alta con `seguimiento`, el gate de administrador, la
 * carrera contra un movimiento en vuelo, que un `EditarInsumo` con la entidad
 * vieja no revierta `seguimiento` (W3) y, al final, el flujo completo por HTTP
 * (activar, entrada con seriales, instalar, retirar, descartar y recuperar) que
 * cierra la cadena de backend.
 *
 * `entera` se prepara por SQL: su edición por HTTP llega en WU-12b. Higiene en
 * el orden: limpiar filas -> `app.close()` -> `dropDatabase`.
 */
import { randomBytes, randomUUID } from 'node:crypto';
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
import { EquiposModule } from '../../../equipos/equipos.module';
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
import { InsumoResponseDto } from '../dtos/insumos.dto';
import { EventoUnidadResponseDto, UnidadInsumoResponseDto } from '../dtos/unidades-insumo.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_seguimientoE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eSeguimientoSecret!123';

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

/** Hermano de `httpPost` para PATCH. */
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
  imports: [SharedModule, AuthModule, InsumosModule, EquiposModule],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Seguimiento por serie e2e — borde HTTP', () => {
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
        'TRUNCATE TABLE eventos_unidad_insumo, componentes_equipo, equipos_informaticos, movimientos_insumo, unidades_insumo, insumos CASCADE',
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
      nombre: `E2E Seguimiento ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_seguim_${randomBytes(4).toString('hex')}@test.local`,
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

  /** Familia + unidad de medida (entera o no) + insumo `NINGUNO`, sembrados con el administrador. */
  async function sembrarInsumo(
    tokenAdmin: string,
    opciones: { entera: boolean; repuesto?: boolean } = { entera: true },
  ): Promise<{ insumoId: string; unidadMedidaId: string; familiaId: string }> {
    const marca = sufijo();
    const familia = await httpPost<{ id: string }>(
      `${baseUrl}/familias-insumo`,
      {
        codigo: `FAM_${marca}`,
        nombre: 'Familia de prueba',
        esRepuesto: opciones.repuesto ?? false,
      },
      bearer(tokenAdmin),
    );
    expect(familia.status).toBe(201);
    const unidadMedidaId = await sembrarUnidadMedida(tokenAdmin, opciones.entera);
    const insumo = await httpPost<InsumoResponseDto>(
      `${baseUrl}/insumos`,
      {
        nombre: 'Pieza de prueba',
        familiaId: familia.data.id,
        unidadMedidaId,
        stockMinimo: null,
      },
      bearer(tokenAdmin),
    );
    expect(insumo.status).toBe(201);
    expect(insumo.data.seguimiento).toBe('NINGUNO');
    return { insumoId: insumo.data.id, unidadMedidaId, familiaId: familia.data.id };
  }

  async function sembrarUnidadMedida(tokenAdmin: string, entera: boolean): Promise<string> {
    const marca = sufijo();
    const unidad = await httpPost<{ id: string }>(
      `${baseUrl}/unidades-medida`,
      { codigo: `UM_${marca}`, nombre: 'Unidad de prueba' },
      bearer(tokenAdmin),
    );
    expect(unidad.status).toBe(201);
    if (entera) {
      await tenantPool.query('UPDATE unidades_medida SET entera = true WHERE id = $1', [
        unidad.data.id,
      ]);
    }
    return unidad.data.id;
  }

  function urlSeguimiento(insumoId: string): string {
    return `${baseUrl}/insumos/${insumoId}/seguimiento`;
  }

  async function cambiarSeguimiento(token: string, insumoId: string, seguimiento: string) {
    return httpPatch<InsumoResponseDto & { message?: string }>(
      urlSeguimiento(insumoId),
      { seguimiento },
      bearer(token),
    );
  }

  async function seguimientoEnBase(insumoId: string): Promise<string> {
    const { rows } = await tenantPool.query('SELECT seguimiento FROM insumos WHERE id = $1', [
      insumoId,
    ]);
    return rows[0].seguimiento as string;
  }

  async function ingresar(
    token: string,
    insumoId: string,
    seriales: string[],
  ): Promise<MovimientosRegistradosResponseDto> {
    const res = await httpPost<MovimientosRegistradosResponseDto>(
      `${baseUrl}/insumos/${insumoId}/movimientos/entrada`,
      { cantidad: seriales.length, seriales },
      bearer(token),
    );
    expect(res.status).toBe(201);
    return res.data;
  }

  async function sembrarUnidadEnEstado(insumoId: string, estado: string): Promise<void> {
    // Solo una unidad EN_DEPOSITO puede estar pendiente de serie (CHECK): el resto lleva serial.
    const serial = `SN-${sufijo()}`;
    await tenantPool.query(
      `INSERT INTO unidades_insumo (insumo_id, numero_serie, numero_serie_normalizado, condicion, estado, updated_at)
       VALUES ($1, $2, $2, 'NUEVO', $3, now())`,
      [insumoId, serial, estado],
    );
  }

  describe('activar (NINGUNO -> SERIE)', () => {
    it('con saldo cero y unidad entera: 200, el insumo queda SERIE y el listado lo refleja', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token);

      const res = await cambiarSeguimiento(token, insumoId, 'SERIE');

      expect(res.status).toBe(200);
      expect(res.data.id).toBe(insumoId);
      expect(res.data.seguimiento).toBe('SERIE');
      expect(await seguimientoEnBase(insumoId)).toBe('SERIE');
      const listado = await httpGet<InsumoResponseDto[]>(`${baseUrl}/insumos`, bearer(token));
      expect(listado.data.find((i) => i.id === insumoId)?.seguimiento).toBe('SERIE');
    });

    it('con saldo distinto de cero: 422 y el insumo sigue NINGUNO', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token);
      const entrada = await httpPost(
        `${baseUrl}/insumos/${insumoId}/movimientos/entrada`,
        { cantidad: 3 },
        bearer(token),
      );
      expect(entrada.status).toBe(201);

      const res = await cambiarSeguimiento(token, insumoId, 'SERIE');

      expect(res.status).toBe(422);
      expect(await seguimientoEnBase(insumoId)).toBe('NINGUNO');
    });

    it('con unidad de medida no entera: 422 y el insumo sigue NINGUNO', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token, { entera: false });

      const res = await cambiarSeguimiento(token, insumoId, 'SERIE');

      expect(res.status).toBe(422);
      expect(await seguimientoEnBase(insumoId)).toBe('NINGUNO');
    });

    it('un insumo inexistente: 404; un valor fuera de NINGUNO/SERIE o un id mal formado: 400', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token);

      const inexistente = await cambiarSeguimiento(token, randomUUID(), 'SERIE');
      const invalido = await cambiarSeguimiento(token, insumoId, 'LOTE');
      const sinCuerpo = await httpPatch(urlSeguimiento(insumoId), {}, bearer(token));
      const idMalo = await cambiarSeguimiento(token, 'no-es-uuid', 'SERIE');

      expect(inexistente.status).toBe(404);
      expect(invalido.status).toBe(400);
      expect(sinCuerpo.status).toBe(400);
      expect(idMalo.status).toBe(400);
      expect(await seguimientoEnBase(insumoId)).toBe('NINGUNO');
    });

    it('un insumo NINGUNO que pide NINGUNO: 200 sin cambios', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token);

      const res = await cambiarSeguimiento(token, insumoId, 'NINGUNO');

      expect(res.status).toBe(200);
      expect(res.data.seguimiento).toBe('NINGUNO');
    });

    it('sin administrador de cliente: 403 y no cambia nada', async () => {
      const administrador = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(administrador.token);
      const actor = await agregarActor(administrador.clienteId, [
        'INSUMOS:AJUSTAR',
        'INSUMOS:ALTAS',
      ]);

      const res = await cambiarSeguimiento(actor.token, insumoId, 'SERIE');

      expect(res.status).toBe(403);
      expect(await seguimientoEnBase(insumoId)).toBe('NINGUNO');
    });
  });

  describe('volver a NINGUNO (SERIE -> NINGUNO)', () => {
    async function insumoSerie() {
      const { token } = await crearAdministrador();
      const siembra = await sembrarInsumo(token);
      expect((await cambiarSeguimiento(token, siembra.insumoId, 'SERIE')).status).toBe(200);
      return { token, ...siembra };
    }

    it.each(['EN_DEPOSITO', 'INSTALADA'])(
      'con una unidad %s: 422 y el insumo sigue SERIE',
      async (estado) => {
        const { token, insumoId } = await insumoSerie();
        if (estado === 'INSTALADA') {
          const equipo = await tenantPool.query(
            `INSERT INTO equipos_informaticos (nombre, updated_at) VALUES ('Equipo', now()) RETURNING id`,
          );
          await tenantPool.query(
            `INSERT INTO unidades_insumo (insumo_id, numero_serie, numero_serie_normalizado, condicion, estado, equipo_id, updated_at)
             VALUES ($1, 'SN-INST', 'SN-INST', 'NUEVO', 'INSTALADA', $2, now())`,
            [insumoId, equipo.rows[0].id],
          );
        } else {
          await sembrarUnidadEnEstado(insumoId, estado);
        }

        const res = await cambiarSeguimiento(token, insumoId, 'NINGUNO');

        expect(res.status).toBe(422);
        expect(await seguimientoEnBase(insumoId)).toBe('SERIE');
      },
    );

    it('con solo unidades entregadas o descartadas: 200 y el insumo vuelve a NINGUNO', async () => {
      const { token, insumoId } = await insumoSerie();
      await sembrarUnidadEnEstado(insumoId, 'ENTREGADA');
      await sembrarUnidadEnEstado(insumoId, 'DESCARTADA');

      const res = await cambiarSeguimiento(token, insumoId, 'NINGUNO');

      expect(res.status).toBe(200);
      expect(res.data.seguimiento).toBe('NINGUNO');
      expect(await seguimientoEnBase(insumoId)).toBe('NINGUNO');
    });
  });

  describe('alta con seguimiento', () => {
    it('con SERIE y unidad entera: 201 con seguimiento SERIE; con unidad no entera: 422; sin el campo: NINGUNO', async () => {
      const { token } = await crearAdministrador();
      const { familiaId, unidadMedidaId } = await sembrarInsumo(token);
      const noEntera = await sembrarUnidadMedida(token, false);
      const alta = (unidad: string, extra: Record<string, unknown>) =>
        httpPost<InsumoResponseDto>(
          `${baseUrl}/insumos`,
          { nombre: 'Alta E2E', familiaId, unidadMedidaId: unidad, ...extra },
          bearer(token),
        );

      const serie = await alta(unidadMedidaId, { seguimiento: 'SERIE' });
      const rechazada = await alta(noEntera, { seguimiento: 'SERIE' });
      const porDefecto = await alta(noEntera, {});
      const invalido = await alta(unidadMedidaId, { seguimiento: 'LOTE' });

      expect(serie.status).toBe(201);
      expect(serie.data.seguimiento).toBe('SERIE');
      expect(rechazada.status).toBe(422);
      expect(porDefecto.status).toBe(201);
      expect(porDefecto.data.seguimiento).toBe('NINGUNO');
      expect(invalido.status).toBe(400);
    });
  });

  describe('concurrencia', () => {
    /** Espera (acotada) a que algún backend quede bloqueado por el `pid` dado. */
    async function esperarBloqueadoPor(pid: number): Promise<void> {
      const limite = Date.now() + 10_000;
      while (Date.now() < limite) {
        const { rows } = await tenantPool.query(
          'SELECT pid FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
          [pid],
        );
        if (rows.length > 0) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Nadie quedo bloqueado por el backend ${pid}.`);
    }

    it('un movimiento en vuelo gana: la activacion espera su comite y ve el saldo, 422', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token);
      const movimiento = await tenantPool.connect();
      try {
        // Un movimiento en vuelo toma L1 en `FOR SHARE` (ADR-12) y todavia no comitea.
        await movimiento.query('BEGIN');
        await movimiento.query('SELECT id FROM insumos WHERE id = $1 FOR SHARE', [insumoId]);
        const { rows } = await movimiento.query('SELECT pg_backend_pid() AS pid');

        const activacion = cambiarSeguimiento(token, insumoId, 'SERIE');
        await esperarBloqueadoPor(rows[0].pid as number);
        await movimiento.query(
          `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, usuario_id)
           VALUES ($1, 'ENTRADA', 3, gen_random_uuid())`,
          [insumoId],
        );
        await movimiento.query('COMMIT');

        expect((await activacion).status).toBe(422);
        expect(await seguimientoEnBase(insumoId)).toBe('NINGUNO');
      } finally {
        await movimiento.query('ROLLBACK').catch(() => undefined);
        movimiento.release();
      }
    });

    it('W3: un EditarInsumo con la entidad vieja no revierte el seguimiento activado en el medio', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token);
      const otraUnidad = await sembrarUnidadMedida(token, true);
      const activador = await tenantPool.connect();
      try {
        // El activador tiene L1 tomado: la edicion lee la entidad (NINGUNO) y
        // se queda esperando L1 con esa lectura vieja en la mano.
        await activador.query('BEGIN');
        await activador.query('SELECT id FROM insumos WHERE id = $1 FOR NO KEY UPDATE', [insumoId]);
        const { rows } = await activador.query('SELECT pg_backend_pid() AS pid');

        const edicion = httpPatch<InsumoResponseDto>(
          `${baseUrl}/insumos/${insumoId}`,
          { nombre: 'Renombrado', unidadMedidaId: otraUnidad },
          bearer(token),
        );
        await esperarBloqueadoPor(rows[0].pid as number);
        await activador.query(`UPDATE insumos SET seguimiento = 'SERIE' WHERE id = $1`, [insumoId]);
        await activador.query('COMMIT');

        const res = await edicion;
        expect(res.status).toBe(200);
        expect(res.data.nombre).toBe('Renombrado');
        expect(await seguimientoEnBase(insumoId)).toBe('SERIE');
      } finally {
        await activador.query('ROLLBACK').catch(() => undefined);
        activador.release();
      }
    });
  });

  describe('flujo completo por HTTP', () => {
    it('activar, entrada con seriales, instalar, retirar, descartar y recuperar', async () => {
      const { token } = await crearAdministrador();
      const { insumoId } = await sembrarInsumo(token, { entera: true, repuesto: true });
      const equipo = await tenantPool.query(
        `INSERT INTO equipos_informaticos (nombre, updated_at) VALUES ('Equipo flujo', now()) RETURNING id`,
      );
      const equipoId = equipo.rows[0].id as string;
      const unidadesUrl = `${baseUrl}/insumos/${insumoId}/unidades`;
      const estadoDe = async (unidadId: string) =>
        (await httpGet<UnidadInsumoResponseDto[]>(unidadesUrl, bearer(token))).data.find(
          (u) => u.id === unidadId,
        )?.estado;
      const instalar = (unidadId: string) =>
        httpPost<{ id: string; unidadId: string | null }>(
          `${baseUrl}/equipos/${equipoId}/componentes`,
          { insumoId, unidadId },
          bearer(token),
        );
      const baja = (componenteId: string, destino: string) =>
        httpPost(
          `${baseUrl}/equipos/${equipoId}/componentes/${componenteId}/baja`,
          { destino, motivo: 'flujo e2e' },
          bearer(token),
        );

      // 1. Activar y recibir tres piezas con su serial.
      expect((await cambiarSeguimiento(token, insumoId, 'SERIE')).data.seguimiento).toBe('SERIE');
      const entrada = await ingresar(token, insumoId, ['SN-A', 'SN-B', 'SN-C']);
      const [unidadA, unidadB] = entrada.movimientos.map((m) => m.unidadId as string);
      const stock = await httpGet<StockInsumoResponseDto>(
        `${baseUrl}/insumos/${insumoId}/stock`,
        bearer(token),
      );
      expect(stock.data).toMatchObject({ seguimiento: 'SERIE', stock: 3, pendientesDeSerie: 0 });

      // 2. Instalar la pieza A: el componente la lleva y el depósito queda en 2.
      const componenteA = await instalar(unidadA);
      expect(componenteA.status).toBe(201);
      expect(componenteA.data.unidadId).toBe(unidadA);
      expect(await estadoDe(unidadA)).toBe('INSTALADA');

      // 3. Retirarla al depósito como usada: vuelve con su serial.
      expect((await baja(componenteA.data.id, 'STOCK_USADO')).status).toBe(200);
      expect(await estadoDe(unidadA)).toBe('EN_DEPOSITO');

      // 4. Instalar la pieza B y descartarla.
      const componenteB = await instalar(unidadB);
      expect(componenteB.status).toBe(201);
      expect((await baja(componenteB.data.id, 'DESCARTE')).status).toBe(200);
      expect(await estadoDe(unidadB)).toBe('DESCARTADA');

      // 5. Recuperar la descartada: vuelve al depósito.
      const recuperacion = await httpPost<MovimientoInsumoResponseDto>(
        `${unidadesUrl}/${unidadB}/recuperacion`,
        { condicion: 'USADO', motivo: 'estaba bien' },
        bearer(token),
      );
      expect(recuperacion.status).toBe(201);
      expect(await estadoDe(unidadB)).toBe('EN_DEPOSITO');

      // 6. La cadena queda escrita en el historial de la pieza B y el saldo vuelve a 3.
      const historial = await httpGet<EventoUnidadResponseDto[]>(
        `${unidadesUrl}/${unidadB}/historial`,
        bearer(token),
      );
      expect(historial.data.map((e) => e.tipo)).toEqual([
        'INGRESO',
        'INSTALACION',
        'DESCARTE',
        'RECUPERACION',
      ]);
      const final = await httpGet<StockInsumoResponseDto>(
        `${baseUrl}/insumos/${insumoId}/stock`,
        bearer(token),
      );
      expect(final.data.stock).toBe(3);

      // 7. Con unidades vivas en el depósito no se puede volver a NINGUNO.
      expect((await cambiarSeguimiento(token, insumoId, 'NINGUNO')).status).toBe(422);
    });
  });
});
