/**
 * unidades-insumo.e2e.spec.ts — levanta la app REAL y pega por HTTP a las rutas
 * de unidades de un insumo `SERIE` (repuestos-numero-de-serie, WU-8b): listar,
 * historial, cargar serial, corregir serial y devolución de entrega (WU-8c). Como ningún insumo es `SERIE` por
 * HTTP hasta WU-12a, el insumo y lo que aún no tiene ruta (unidad pendiente,
 * eventos de instalación) se preparan por SQL directo en el tenant efímero.
 *
 * Higiene en el orden: limpiar filas -> `app.close()` -> `dropDatabase`.
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
  MovimientoInsumoResponseDto,
  MovimientosRegistradosResponseDto,
} from '../dtos/movimientos-insumo.dto';
import { EventoUnidadResponseDto, UnidadInsumoResponseDto } from '../dtos/unidades-insumo.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_unidE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eUnidadesSecret!123';

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

describe('Unidades de insumo SERIE e2e — borde HTTP', () => {
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
        'TRUNCATE TABLE eventos_unidad_insumo, movimientos_insumo, unidades_insumo, insumos, equipos_informaticos, sectores CASCADE',
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
      nombre: `E2E Unidades ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_unid_${randomBytes(4).toString('hex')}@test.local`,
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
  async function sembrarInsumo(
    tokenAdmin: string,
    opciones: { serie: boolean; repuesto?: boolean },
  ): Promise<string> {
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

  interface Escenario {
    tokenAdmin: string;
    token: string;
    tokenLectura: string;
    tokenSinLectura: string;
    tokenSoloAltas: string;
    insumoId: string;
  }

  async function prepararEscenario(
    opciones: { serie: boolean; repuesto?: boolean } = { serie: true },
  ): Promise<Escenario> {
    const administrador = await crearAdministrador();
    const insumoId = await sembrarInsumo(administrador.token, opciones);
    const actor = await agregarActor(administrador.clienteId, [
      'INSUMOS:LECTURA',
      'INSUMOS:ALTAS',
      'INSUMOS:AJUSTAR',
    ]);
    const lector = await agregarActor(administrador.clienteId, ['INSUMOS:LECTURA']);
    const sinLectura = await agregarActor(administrador.clienteId, [
      'INSUMOS:ALTAS',
      'INSUMOS:AJUSTAR',
    ]);
    const soloAltas = await agregarActor(administrador.clienteId, ['INSUMOS:ALTAS']);
    return {
      tokenAdmin: administrador.token,
      token: actor.token,
      tokenLectura: lector.token,
      tokenSinLectura: sinLectura.token,
      tokenSoloAltas: soloAltas.token,
      insumoId,
    };
  }

  const base = (insumoId: string): string => `${baseUrl}/insumos/${insumoId}`;

  async function ingresar(e: Escenario, seriales: string[]): Promise<string[]> {
    const res = await httpPost<MovimientosRegistradosResponseDto>(
      `${base(e.insumoId)}/movimientos/entrada`,
      { cantidad: seriales.length, seriales },
      bearer(e.token),
    );
    expect(res.status).toBe(201);
    return res.data.movimientos.map((m) => m.unidadId as string);
  }

  /** Unidad de serie pendiente (sin serial): no tiene ruta HTTP hasta WU-9. */
  async function crearPendiente(insumoId: string): Promise<string> {
    const { rows } = await tenantPool.query<{ id: string }>(
      `INSERT INTO unidades_insumo (insumo_id, condicion, estado, updated_at) VALUES ($1, 'NUEVO', 'EN_DEPOSITO', now()) RETURNING id`,
      [insumoId],
    );
    return rows[0].id;
  }

  async function crearEquipo(nombre: string): Promise<string> {
    const { rows } = await tenantPool.query<{ id: string }>(
      `INSERT INTO equipos_informaticos (nombre, updated_at) VALUES ($1, now()) RETURNING id`,
      [nombre],
    );
    return rows[0].id;
  }

  async function crearSector(nombre: string): Promise<string> {
    const { rows } = await tenantPool.query<{ id: string }>(
      `INSERT INTO sectores (codigo, nombre, updated_at) VALUES ($1, $2, now()) RETURNING id`,
      [`S${sufijo()}`, nombre],
    );
    return rows[0].id;
  }

  /** Evento de instalación/retiro sembrado por SQL: las rutas de equipo llegan en WU-10/11. */
  async function sembrarEvento(
    unidadId: string,
    tipo: string,
    equipoId: string | null,
    motivo: string | null = null,
  ): Promise<void> {
    await tenantPool.query(
      `INSERT INTO eventos_unidad_insumo (unidad_id, tipo, equipo_id, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, gen_random_uuid())`,
      [unidadId, tipo, equipoId, motivo],
    );
  }

  async function historial(e: Escenario, unidadId: string): Promise<EventoUnidadResponseDto[]> {
    const res = await httpGet<EventoUnidadResponseDto[]>(
      `${base(e.insumoId)}/unidades/${unidadId}/historial`,
      bearer(e.tokenLectura),
    );
    expect(res.status).toBe(200);
    return res.data;
  }

  describe('GET /insumos/:id/unidades', () => {
    it('lista y filtra por estado y por disponibles (sin pendientes)', async () => {
      const e = await prepararEscenario();
      const [u1, u2] = await ingresar(e, ['SN-1', 'SN-2']);
      const pendiente = await crearPendiente(e.insumoId);
      const salida = await httpPost(
        `${base(e.insumoId)}/movimientos/salida`,
        { cantidad: 1, unidadId: u2 },
        bearer(e.token),
      );
      expect(salida.status).toBe(201);

      const todas = await httpGet<UnidadInsumoResponseDto[]>(
        `${base(e.insumoId)}/unidades`,
        bearer(e.tokenLectura),
      );
      const enDeposito = await httpGet<UnidadInsumoResponseDto[]>(
        `${base(e.insumoId)}/unidades?estado=EN_DEPOSITO`,
        bearer(e.tokenLectura),
      );
      const disponibles = await httpGet<UnidadInsumoResponseDto[]>(
        `${base(e.insumoId)}/unidades?disponibles=true`,
        bearer(e.tokenLectura),
      );
      const estadoInvalido = await httpGet(
        `${base(e.insumoId)}/unidades?estado=ROTA`,
        bearer(e.tokenLectura),
      );

      expect(todas.status).toBe(200);
      expect(todas.data).toHaveLength(3);
      expect(enDeposito.data.map((u) => u.id).sort()).toEqual([u1, pendiente].sort());
      expect(enDeposito.data.find((u) => u.id === pendiente)?.numeroSerie).toBeNull();
      expect(disponibles.data.map((u) => u.id)).toEqual([u1]);
      expect(estadoInvalido.status).toBe(400);
    });

    it('404 para un insumo inexistente', async () => {
      const e = await prepararEscenario();
      const res = await httpGet(
        `${base('00000000-0000-4000-8000-000000000000')}/unidades`,
        bearer(e.tokenLectura),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('GET …/unidades/:unidadId/historial', () => {
    it('vida completa: ingreso, instalación en E1, retiro y instalación en E2, en orden', async () => {
      const e = await prepararEscenario();
      const [u1] = await ingresar(e, ['SN-1']);
      const e1 = await crearEquipo('Equipo E1');
      const e2 = await crearEquipo('Equipo E2');
      await sembrarEvento(u1, 'INSTALACION', e1);
      await sembrarEvento(u1, 'RETIRO_A_DEPOSITO', e1, 'Falla');
      await sembrarEvento(u1, 'INSTALACION', e2);

      const h = await historial(e, u1);

      expect(h.map((x) => x.tipo)).toEqual([
        'INGRESO',
        'INSTALACION',
        'RETIRO_A_DEPOSITO',
        'INSTALACION',
      ]);
      expect(h.map((x) => x.equipoNombre)).toEqual([null, 'Equipo E1', 'Equipo E1', 'Equipo E2']);
      expect(h[2].motivo).toBe('Falla');
    });

    it('una descartada muestra la baja con el motivo del movimiento', async () => {
      const e = await prepararEscenario();
      const [u1] = await ingresar(e, ['SN-1']);
      const ajuste = await httpPost(
        `${base(e.insumoId)}/movimientos/ajuste`,
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1, motivo: 'Placa quemada', unidadId: u1 },
        bearer(e.token),
      );
      expect(ajuste.status).toBe(201);

      const h = await historial(e, u1);

      const baja = h.find((x) => x.tipo === 'BAJA_DE_DEPOSITO');
      expect(baja?.motivo).toBe('Placa quemada');
      expect(baja?.movimientoId).not.toBeNull();
    });

    it('una entregada muestra el sector de destino leído del movimiento', async () => {
      const e = await prepararEscenario();
      const [u1] = await ingresar(e, ['SN-1']);
      const sectorId = await crearSector('Administración');
      const salida = await httpPost(
        `${base(e.insumoId)}/movimientos/salida`,
        { cantidad: 1, unidadId: u1, sectorId, motivo: 'Uso diario' },
        bearer(e.token),
      );
      expect(salida.status).toBe(201);

      const h = await historial(e, u1);

      const entrega = h.find((x) => x.tipo === 'ENTREGA');
      expect(entrega?.sectorId).toBe(sectorId);
      expect(entrega?.sectorNombre).toBe('Administración');
      expect(entrega?.motivo).toBe('Uso diario');
    });

    it('una unidad sin historia anterior devuelve lista vacía', async () => {
      const e = await prepararEscenario();
      const pendiente = await crearPendiente(e.insumoId);
      expect(await historial(e, pendiente)).toEqual([]);
    });

    it('404: unidad de otro insumo', async () => {
      const e = await prepararEscenario();
      const otro = { ...e, insumoId: await sembrarInsumo(e.tokenAdmin, { serie: true }) };
      const [ajena] = await ingresar(otro, ['SN-9']);
      const res = await httpGet(
        `${base(e.insumoId)}/unidades/${ajena}/historial`,
        bearer(e.tokenLectura),
      );
      expect(res.status).toBe(404);
    });
  });

  describe('POST …/unidades/:unidadId/serial', () => {
    it('completa un serial pendiente y deja el evento SERIAL_CARGADO', async () => {
      const e = await prepararEscenario();
      const pendiente = await crearPendiente(e.insumoId);

      const res = await httpPost<UnidadInsumoResponseDto>(
        `${base(e.insumoId)}/unidades/${pendiente}/serial`,
        { numeroSerie: '  SN-NUEVO  ' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data.numeroSerie).toBe('SN-NUEVO');
      const h = await historial(e, pendiente);
      expect(h.map((x) => x.tipo)).toEqual(['SERIAL_CARGADO']);
      expect(h[0].serialNuevo).toBe('SN-NUEVO');
    });

    it('409 con un serial repetido; 422 si ya tiene serial; 400 por largo normalizado', async () => {
      const e = await prepararEscenario();
      const [u1] = await ingresar(e, ['SN-1']);
      const pendiente = await crearPendiente(e.insumoId);
      const ruta = (id: string): string => `${base(e.insumoId)}/unidades/${id}/serial`;

      const repetido = await httpPost(ruta(pendiente), { numeroSerie: 'sn-1' }, bearer(e.token));
      const yaTiene = await httpPost(ruta(u1), { numeroSerie: 'OTRO' }, bearer(e.token));
      const largo = await httpPost(
        ruta(pendiente),
        { numeroSerie: 'ß'.repeat(130) },
        bearer(e.token),
      );
      const vacio = await httpPost(ruta(pendiente), { numeroSerie: '   ' }, bearer(e.token));

      expect(repetido.status).toBe(409);
      expect(yaTiene.status).toBe(422);
      expect(largo.status).toBe(400);
      expect(vacio.status).toBe(400);
    });
  });

  describe('POST …/unidades/:unidadId/correccion-serial', () => {
    it('corrección válida: cambia el serial y registra anterior, nuevo y motivo', async () => {
      const e = await prepararEscenario();
      const [u1] = await ingresar(e, ['SN-1']);

      const res = await httpPost<UnidadInsumoResponseDto>(
        `${base(e.insumoId)}/unidades/${u1}/correccion-serial`,
        { numeroSerie: 'SN-1B', motivo: 'Error de tipeo' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data.numeroSerie).toBe('SN-1B');
      const h = await historial(e, u1);
      const correccion = h.find((x) => x.tipo === 'CORRECCION_SERIAL');
      expect(correccion).toMatchObject({
        serialAnterior: 'SN-1',
        serialNuevo: 'SN-1B',
        motivo: 'Error de tipeo',
      });
    });

    it('422 sin motivo; 409 a un serial existente; 422 sobre una instalada', async () => {
      const e = await prepararEscenario();
      const [u1, u2] = await ingresar(e, ['SN-1', 'SN-2']);
      const ruta = (id: string): string => `${base(e.insumoId)}/unidades/${id}/correccion-serial`;
      await tenantPool.query(
        `UPDATE unidades_insumo SET estado = 'INSTALADA', equipo_id = $2 WHERE id = $1`,
        [u2, await crearEquipo('Equipo')],
      );

      const sinMotivo = await httpPost(ruta(u1), { numeroSerie: 'SN-X' }, bearer(e.token));
      const motivoBlanco = await httpPost(
        ruta(u1),
        { numeroSerie: 'SN-X', motivo: '   ' },
        bearer(e.token),
      );
      const existente = await httpPost(
        ruta(u1),
        { numeroSerie: 'sn-2', motivo: 'Corrige' },
        bearer(e.token),
      );
      const instalada = await httpPost(
        ruta(u2),
        { numeroSerie: 'SN-Y', motivo: 'Corrige' },
        bearer(e.token),
      );

      expect(sinMotivo.status).toBe(422);
      expect(motivoBlanco.status).toBe(422);
      expect(existente.status).toBe(409);
      expect(instalada.status).toBe(422);
    });
  });

  describe('POST …/unidades/:unidadId/devolucion-entrega', () => {
    /** Ingresa una unidad y la entrega por la SALIDA manual; devuelve su id. */
    async function entregada(e: Escenario, serial = 'SN-1'): Promise<string> {
      const [u] = await ingresar(e, [serial]);
      const salida = await httpPost(
        `${base(e.insumoId)}/movimientos/salida`,
        { cantidad: 1, unidadId: u },
        bearer(e.token),
      );
      expect(salida.status).toBe(201);
      return u;
    }

    const ruta = (e: Escenario, id: string): string =>
      `${base(e.insumoId)}/unidades/${id}/devolucion-entrega`;

    it('NUEVO: la unidad vuelve EN_DEPOSITO con su serial y deja DEVOLUCION_DE_ENTREGA', async () => {
      const e = await prepararEscenario();
      const u = await entregada(e);

      const res = await httpPost<MovimientoInsumoResponseDto>(
        ruta(e, u),
        { condicion: 'NUEVO', motivo: '  No se usó  ' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({
        tipo: 'ENTRADA',
        cantidad: 1,
        condicion: 'NUEVO',
        unidadId: u,
        insumoId: e.insumoId,
        motivo: 'No se usó',
      });
      const unidades = await httpGet<UnidadInsumoResponseDto[]>(
        `${base(e.insumoId)}/unidades?estado=EN_DEPOSITO`,
        bearer(e.tokenLectura),
      );
      expect(unidades.data).toMatchObject([{ id: u, numeroSerie: 'SN-1', condicion: 'NUEVO' }]);
      const h = await historial(e, u);
      expect(h.map((x) => x.tipo)).toEqual(['INGRESO', 'ENTREGA', 'DEVOLUCION_DE_ENTREGA']);
      expect(h[2].movimientoId).toBe(res.data.id);
    });

    it('USADO en un insumo de repuestos deja la unidad EN_DEPOSITO USADO', async () => {
      const e = await prepararEscenario({ serie: true, repuesto: true });
      const u = await entregada(e);

      const res = await httpPost<MovimientoInsumoResponseDto>(
        ruta(e, u),
        { condicion: 'USADO' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data.condicion).toBe('USADO');
      const unidades = await httpGet<UnidadInsumoResponseDto[]>(
        `${base(e.insumoId)}/unidades?estado=EN_DEPOSITO`,
        bearer(e.tokenLectura),
      );
      expect(unidades.data[0]).toMatchObject({ id: u, condicion: 'USADO' });
    });

    it('G2: admite un insumo deshabilitado y una familia deshabilitada con USADO', async () => {
      const e = await prepararEscenario({ serie: true, repuesto: true });
      const u = await entregada(e);
      await tenantPool.query(`UPDATE insumos SET activo = false WHERE id = $1`, [e.insumoId]);
      await tenantPool.query(
        `UPDATE familias_insumo SET activo = false WHERE id = (SELECT familia_id FROM insumos WHERE id = $1)`,
        [e.insumoId],
      );

      const res = await httpPost<MovimientoInsumoResponseDto>(
        ruta(e, u),
        { condicion: 'USADO' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
    });

    it('422 en cada guard (no entregada, USADO sin repuestos, NINGUNO) y 404 del insumo dado de baja', async () => {
      const e = await prepararEscenario();
      const [enDeposito] = await ingresar(e, ['SN-1']);
      const u = await entregada(e, 'SN-2');

      const noEntregada = await httpPost(
        ruta(e, enDeposito),
        { condicion: 'NUEVO' },
        bearer(e.token),
      );
      const usadoSinRepuestos = await httpPost(ruta(e, u), { condicion: 'USADO' }, bearer(e.token));
      await tenantPool.query(`UPDATE insumos SET seguimiento = 'NINGUNO' WHERE id = $1`, [
        e.insumoId,
      ]);
      const ninguno = await httpPost(ruta(e, u), { condicion: 'NUEVO' }, bearer(e.token));
      await tenantPool.query(`UPDATE insumos SET seguimiento = 'SERIE' WHERE id = $1`, [
        e.insumoId,
      ]);
      await tenantPool.query(`UPDATE insumos SET deleted_at = now() WHERE id = $1`, [e.insumoId]);
      const deBaja = await httpPost(ruta(e, u), { condicion: 'NUEVO' }, bearer(e.token));

      expect(noEntregada.status).toBe(422);
      expect(usadoSinRepuestos.status).toBe(422);
      expect(ninguno.status).toBe(422);
      expect(deBaja.status).toBe(404);
      const { rows } = await tenantPool.query<{ estado: string }>(
        `SELECT estado FROM unidades_insumo WHERE id = $1`,
        [u],
      );
      expect(rows[0].estado).toBe('ENTREGADA');
    });

    it('400 por condición inválida o ausente; 404 de unidad ajena', async () => {
      const e = await prepararEscenario();
      const u = await entregada(e);
      const otro = { ...e, insumoId: await sembrarInsumo(e.tokenAdmin, { serie: true }) };
      const [ajena] = await ingresar(otro, ['SN-9']);

      const invalida = await httpPost(ruta(e, u), { condicion: 'ROTO' }, bearer(e.token));
      const ausente = await httpPost(ruta(e, u), {}, bearer(e.token));
      const deOtro = await httpPost(ruta(e, ajena), { condicion: 'NUEVO' }, bearer(e.token));

      expect(invalida.status).toBe(400);
      expect(ausente.status).toBe(400);
      expect(deOtro.status).toBe(404);
    });

    it('403 sin INSUMOS:ALTAS', async () => {
      const e = await prepararEscenario();
      const u = await entregada(e);
      const res = await httpPost(ruta(e, u), { condicion: 'NUEVO' }, bearer(e.tokenLectura));
      expect(res.status).toBe(403);
    });
  });

  describe('POST …/unidades/:unidadId/recuperacion', () => {
    /** Da de baja una unidad del depósito por el ajuste negativo manual; devuelve su id. */
    async function descartada(e: Escenario, unidadId: string): Promise<string> {
      const baja = await httpPost(
        `${base(e.insumoId)}/movimientos/ajuste`,
        { tipo: 'AJUSTE_NEGATIVO', cantidad: 1, unidadId, motivo: 'faltante' },
        bearer(e.token),
      );
      expect(baja.status).toBe(201);
      return unidadId;
    }

    const ruta = (e: Escenario, id: string): string =>
      `${base(e.insumoId)}/unidades/${id}/recuperacion`;

    const enDeposito = async (e: Escenario) =>
      (
        await httpGet<UnidadInsumoResponseDto[]>(
          `${base(e.insumoId)}/unidades?estado=EN_DEPOSITO`,
          bearer(e.tokenLectura),
        )
      ).data;

    it('NUEVO: la pieza dada de baja por error vuelve EN_DEPOSITO con su serial y deja RECUPERACION', async () => {
      const e = await prepararEscenario();
      const [u] = await ingresar(e, ['SN-1']);
      await descartada(e, u);

      const res = await httpPost<MovimientoInsumoResponseDto>(
        ruta(e, u),
        { condicion: 'NUEVO', motivo: '  Se dio de baja por error  ' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data).toMatchObject({
        tipo: 'ENTRADA',
        cantidad: 1,
        condicion: 'NUEVO',
        unidadId: u,
        insumoId: e.insumoId,
        motivo: 'Se dio de baja por error',
      });
      expect(await enDeposito(e)).toMatchObject([
        { id: u, numeroSerie: 'SN-1', condicion: 'NUEVO' },
      ]);
      const h = await historial(e, u);
      expect(h.map((x) => x.tipo)).toEqual(['INGRESO', 'BAJA_DE_DEPOSITO', 'RECUPERACION']);
      expect(h[2]).toMatchObject({ movimientoId: res.data.id, motivo: 'Se dio de baja por error' });
    });

    it('USADO: una pieza descartada desde un equipo vuelve como usada', async () => {
      const e = await prepararEscenario({ serie: true, repuesto: true });
      const [u] = await ingresar(e, ['SN-1']);
      const equipoId = await crearEquipo(`EQ_${sufijo()}`);
      await tenantPool.query(`UPDATE unidades_insumo SET estado = 'DESCARTADA' WHERE id = $1`, [u]);
      await sembrarEvento(u, 'DESCARTE', equipoId, 'retiro');

      const res = await httpPost<MovimientoInsumoResponseDto>(
        ruta(e, u),
        { condicion: 'USADO', motivo: 'la pieza estaba bien' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(res.data.condicion).toBe('USADO');
      expect(await enDeposito(e)).toMatchObject([
        { id: u, numeroSerie: 'SN-1', condicion: 'USADO' },
      ]);
    });

    it('una pendiente descartada vuelve pendiente (sin serial)', async () => {
      const e = await prepararEscenario();
      const pendiente = await crearPendiente(e.insumoId);
      await descartada(e, pendiente);

      const res = await httpPost(
        ruta(e, pendiente),
        { condicion: 'NUEVO', motivo: 'm' },
        bearer(e.token),
      );

      expect(res.status).toBe(201);
      expect(await enDeposito(e)).toMatchObject([{ id: pendiente, numeroSerie: null }]);
    });

    it('G2: admite un insumo deshabilitado y una familia deshabilitada con USADO', async () => {
      const e = await prepararEscenario({ serie: true, repuesto: true });
      const [u] = await ingresar(e, ['SN-1']);
      await descartada(e, u);
      await tenantPool.query(`UPDATE insumos SET activo = false WHERE id = $1`, [e.insumoId]);
      await tenantPool.query(
        `UPDATE familias_insumo SET activo = false WHERE id = (SELECT familia_id FROM insumos WHERE id = $1)`,
        [e.insumoId],
      );

      const res = await httpPost(ruta(e, u), { condicion: 'USADO', motivo: 'm' }, bearer(e.token));

      expect(res.status).toBe(201);
    });

    it('422 sin motivo o con motivo en blanco, y sin cambiar la unidad', async () => {
      const e = await prepararEscenario();
      const [u] = await ingresar(e, ['SN-1']);
      await descartada(e, u);

      const sinMotivo = await httpPost(ruta(e, u), { condicion: 'NUEVO' }, bearer(e.token));
      const enBlanco = await httpPost(
        ruta(e, u),
        { condicion: 'NUEVO', motivo: '   ' },
        bearer(e.token),
      );

      expect([sinMotivo.status, enBlanco.status]).toEqual([422, 422]);
      expect(await enDeposito(e)).toEqual([]);
    });

    it('422 en cada guard (no descartada, USADO sin repuestos, NINGUNO) y 404 del insumo dado de baja', async () => {
      const e = await prepararEscenario();
      const [vigente, baja] = await ingresar(e, ['SN-1', 'SN-2']);
      await descartada(e, baja);
      const cuerpo = { condicion: 'NUEVO', motivo: 'm' };

      const noDescartada = await httpPost(ruta(e, vigente), cuerpo, bearer(e.token));
      const usadoSinRepuestos = await httpPost(
        ruta(e, baja),
        { condicion: 'USADO', motivo: 'm' },
        bearer(e.token),
      );
      await tenantPool.query(`UPDATE insumos SET seguimiento = 'NINGUNO' WHERE id = $1`, [
        e.insumoId,
      ]);
      const ninguno = await httpPost(ruta(e, baja), cuerpo, bearer(e.token));
      await tenantPool.query(`UPDATE insumos SET seguimiento = 'SERIE' WHERE id = $1`, [
        e.insumoId,
      ]);
      await tenantPool.query(`UPDATE insumos SET deleted_at = now() WHERE id = $1`, [e.insumoId]);
      const deBaja = await httpPost(ruta(e, baja), cuerpo, bearer(e.token));

      expect([noDescartada.status, usadoSinRepuestos.status, ninguno.status]).toEqual([
        422, 422, 422,
      ]);
      expect(deBaja.status).toBe(404);
      const { rows } = await tenantPool.query<{ estado: string }>(
        `SELECT estado FROM unidades_insumo WHERE id = $1`,
        [baja],
      );
      expect(rows[0].estado).toBe('DESCARTADA');
    });

    it('400 por condición inválida o motivo de más de 500; 404 de unidad ajena', async () => {
      const e = await prepararEscenario();
      const [u] = await ingresar(e, ['SN-1']);
      await descartada(e, u);
      const otro = { ...e, insumoId: await sembrarInsumo(e.tokenAdmin, { serie: true }) };
      const [ajena] = await ingresar(otro, ['SN-9']);

      const invalida = await httpPost(
        ruta(e, u),
        { condicion: 'ROTO', motivo: 'm' },
        bearer(e.token),
      );
      const ausente = await httpPost(ruta(e, u), { motivo: 'm' }, bearer(e.token));
      const largo = await httpPost(
        ruta(e, u),
        { condicion: 'NUEVO', motivo: 'x'.repeat(501) },
        bearer(e.token),
      );
      const deOtro = await httpPost(
        ruta(e, ajena),
        { condicion: 'NUEVO', motivo: 'm' },
        bearer(e.token),
      );

      expect([invalida.status, ausente.status, largo.status]).toEqual([400, 400, 400]);
      expect(deOtro.status).toBe(404);
    });

    it('403 sin INSUMOS:AJUSTAR (ni con ALTAS)', async () => {
      const e = await prepararEscenario();
      const [u] = await ingresar(e, ['SN-1']);
      await descartada(e, u);
      const cuerpo = { condicion: 'NUEVO', motivo: 'm' };

      const soloAltas = await httpPost(ruta(e, u), cuerpo, bearer(e.tokenSoloAltas));
      const lector = await httpPost(ruta(e, u), cuerpo, bearer(e.tokenLectura));

      expect([soloAltas.status, lector.status]).toEqual([403, 403]);
    });
  });

  describe('permisos por ruta', () => {
    it('403 en cada ruta sin su permiso', async () => {
      const e = await prepararEscenario();
      const [u1] = await ingresar(e, ['SN-1']);
      const pendiente = await crearPendiente(e.insumoId);
      const unidades = `${base(e.insumoId)}/unidades`;

      const listar = await httpGet(unidades, bearer(e.tokenSinLectura));
      const historialSin = await httpGet(`${unidades}/${u1}/historial`, bearer(e.tokenSinLectura));
      const cargar = await httpPost(
        `${unidades}/${pendiente}/serial`,
        { numeroSerie: 'SN-Z' },
        bearer(e.tokenLectura),
      );
      const corregir = await httpPost(
        `${unidades}/${u1}/correccion-serial`,
        { numeroSerie: 'SN-Z', motivo: 'm' },
        bearer(e.tokenSoloAltas),
      );

      expect([listar.status, historialSin.status, cargar.status, corregir.status]).toEqual([
        403, 403, 403, 403,
      ]);
    });
  });
});
