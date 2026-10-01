/**
 * dar-de-baja-equipo.e2e.spec.ts — WU-12 (baja-equipo-completo, R1, R4, R5, R7, R9-R12, R17).
 *
 * App real contra Postgres real: `GET /equipos/:id/baja/resumen` y `POST /equipos/:id/baja`.
 * Mismo patrón que `eliminar-equipo.e2e.spec.ts`: tenant efímero, `soporte_master_test` truncada
 * en `beforeEach` y `usarLockMasterTest()`. Un solo actor por test: dos clientes con el mismo
 * `dbName` violan el UNIQUE de `clientes.db_name`. Las piezas, unidades y tickets se siembran por
 * SQL; el 409 de la baja (piezas que cambian durante la baja) lo cubre la concurrencia de WU-13.
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
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_darDeBajaEquipoE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eDarDeBajaEquipoSecret!123';

type Headers = Record<string, string>;
type Respuesta<T> = { status: number; data: T };

/** Cuerpo de error: los campos que cada caso lee; el resto del cuerpo no se afirma. */
interface CuerpoError {
  statusCode?: number;
  message?: string;
  code?: string;
  largoMaximo?: number;
  piezas?: { componenteId: string; insumoId: string | null; causa: string }[];
}

interface Detalle {
  id: string;
  activo: boolean;
  baja: {
    destino: string;
    categoria: string;
    motivo: string | null;
    fecha: string;
    usuarioId: string | null;
  } | null;
  componentes: {
    id: string;
    activo: boolean;
    bajaDestino: string | null;
    bajaMotivo: string | null;
    bajaMovimientoId: string | null;
  }[];
}

interface Resumen {
  equipoId: string;
  nombre: string;
  ticketsAbiertos: number;
  largoMaximoTexto: Record<'VEJEZ' | 'DONACION' | 'ROTURA' | 'OTRA', number>;
  piezas: {
    componenteId: string;
    insumoId: string | null;
    unidadId: string | null;
    numeroSerie: string | null;
    seguimiento: string;
    requiereSerial: boolean;
    causaQueImpideDevolver: string | null;
  }[];
}

async function http<T>(
  method: 'GET' | 'POST',
  url: string,
  headers: Headers,
  body?: unknown,
): Promise<Respuesta<T>> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

usarLockMasterTest();

describe('Equipos e2e — baja de equipo completo (WU-12)', () => {
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

  let insumoSerieId: string;
  let insumoNingunoId: string;
  let insumoBorradoId: string;
  let prioridadId: string;
  let estadoNuevoId: string;
  let estadoCerradoId: string;
  let tipoSoporteId: string;
  let contadorTicket = 0;

  const PERMISOS_BAJA = ['EQUIPOS:BORRADO'];
  const BAJA_VEJEZ = { destino: 'STOCK_USADO', categoria: 'VEJEZ' };

  /** Filas de las pruebas, en orden de FK: el catálogo sembrado en `beforeAll` se conserva. */
  async function limpiarFilas(): Promise<void> {
    await tenantClient.ticketSoporte.deleteMany();
    await tenantClient.ticket.deleteMany();
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

    // Catálogos del tenant: insumos de repuesto y lo mínimo para crear tickets de soporte.
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${RUN_PREFIX}F`, nombre: 'Familia E2E baja', esRepuesto: true },
    });
    const unidadMedida = await tenantClient.unidadMedida.create({
      data: { codigo: `${RUN_PREFIX}U`, nombre: 'Entera E2E baja', entera: true },
    });
    const crearInsumo = async (
      sufijo: string,
      extra: { seguimiento?: string; deletedAt?: Date },
    ): Promise<string> =>
      (
        await tenantClient.insumo.create({
          data: {
            codigo: `${RUN_PREFIX}${sufijo}`,
            nombre: `Repuesto ${sufijo} E2E baja`,
            familiaId: familia.id,
            unidadMedidaId: unidadMedida.id,
            ...extra,
          },
        })
      ).id;
    insumoSerieId = await crearInsumo('S', { seguimiento: 'SERIE' });
    insumoNingunoId = await crearInsumo('N', {});
    insumoBorradoId = await crearInsumo('B', { deletedAt: new Date('2026-01-01T00:00:00Z') });

    prioridadId = (
      await tenantClient.prioridad.create({ data: { codigo: 'MEDIA', nombre: 'Media' } })
    ).id;
    estadoNuevoId = (
      await tenantClient.estado.create({ data: { codigo: 'NUEVO', nombre: 'Nuevo' } })
    ).id;
    estadoCerradoId = (
      await tenantClient.estado.create({ data: { codigo: 'CERRADO', nombre: 'Cerrado' } })
    ).id;
    tipoSoporteId = (
      await tenantClient.tipoTicket.create({
        data: { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'SOPORTE' },
      })
    ).id;
    await tenantClient.tipoOperacion.create({
      data: { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado' },
    });
    await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: randomUUID(),
        nombre: 'Ciclo E2E',
        fechaInicio: new Date('2020-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });

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
    // Orden CRÍTICO (bug real documentado en compras.e2e.spec.ts): filas → app.close() →
    // dropDatabase. Al revés, el DROP falla en silencio.
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
  });

  // ─── Fixtures (master) ──────────────────────────────────────────────────

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Dar de baja equipo ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_dar_de_baja_equipo_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'DarDeBajaEquipo',
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

  // ─── Fixtures (tenant, por SQL) ─────────────────────────────────────────

  async function crearEquipo(): Promise<{ id: string; nombre: string }> {
    const equipo = await tenantClient.equipoInformatico.create({
      data: { nombre: `Equipo E2E ${randomBytes(3).toString('hex')}` },
    });
    return { id: equipo.id, nombre: equipo.nombre };
  }

  async function agregarComponente(
    equipoId: string,
    insumoId: string,
    numeroSerie: string | null = null,
  ): Promise<string> {
    return (
      await tenantClient.componenteEquipo.create({ data: { equipoId, insumoId, numeroSerie } })
    ).id;
  }

  async function agregarUnidadInstalada(
    equipoId: string,
    serial: string,
  ): Promise<{ componenteId: string; unidadId: string }> {
    const unidad = await tenantClient.unidadInsumo.create({
      data: {
        insumoId: insumoSerieId,
        numeroSerie: serial,
        numeroSerieNormalizado: serial.toUpperCase(),
        condicion: 'NUEVO',
        estado: 'INSTALADA',
        equipoId,
      },
    });
    const componente = await tenantClient.componenteEquipo.create({
      data: { equipoId, insumoId: insumoSerieId, unidadId: unidad.id },
    });
    return { componenteId: componente.id, unidadId: unidad.id };
  }

  /** Equipo con una unidad `SERIE` instalada y una pieza de un insumo sin seguimiento. */
  async function equipoConDosPiezas(): Promise<{
    id: string;
    nombre: string;
    componenteUnidad: string;
    componenteNinguno: string;
    unidadId: string;
  }> {
    const equipo = await crearEquipo();
    const { componenteId, unidadId } = await agregarUnidadInstalada(equipo.id, 'SN-BAJA-1');
    const componenteNinguno = await agregarComponente(equipo.id, insumoNingunoId);
    return { ...equipo, componenteUnidad: componenteId, componenteNinguno, unidadId };
  }

  async function crearTicket(equipoId: string, cerrado = false): Promise<string> {
    contadorTicket += 1;
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: `${RUN_PREFIX}-${contadorTicket}`,
        titulo: `Ticket E2E ${contadorTicket}`,
        tipoId: tipoSoporteId,
        estadoId: cerrado ? estadoCerradoId : estadoNuevoId,
        prioridadId,
        solicitanteId: randomUUID(),
      },
    });
    await tenantClient.ticketSoporte.create({ data: { ticketId: ticket.id, equipoId } });
    return ticket.id;
  }

  /** Lo que una baja podría escribir, para afirmar "nada cambió". */
  async function foto(equipoId: string): Promise<string[]> {
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    const componentes = await tenantClient.componenteEquipo.findMany({ orderBy: { id: 'asc' } });
    const unidades = await tenantClient.unidadInsumo.findMany({ orderBy: { id: 'asc' } });
    return [
      `equipo:${equipo.activo}:${equipo.bajaDestino}:${equipo.bajaCategoria}:${equipo.deletedAt}`,
      ...componentes.map(
        (c) => `comp:${c.id}:${c.deletedAt}:${c.bajaDestino}:${c.bajaMovimientoId}`,
      ),
      ...unidades.map((u) => `unidad:${u.id}:${u.estado}:${u.condicion}:${u.equipoId}`),
      `movimientos:${await tenantClient.movimientoInsumo.count()}`,
      `eventos:${await tenantClient.eventoUnidadInsumo.count()}`,
    ];
  }

  const bajaUrl = (id: string) => `${baseUrl}/equipos/${id}/baja`;
  const resumenUrl = (id: string) => `${baseUrl}/equipos/${id}/baja/resumen`;

  const postBaja = <T = Detalle & CuerpoError>(id: string, token: string, body: unknown) =>
    http<T>('POST', bajaUrl(id), bearer(token), body);

  // ─── R1, R4: permisos y baja completa ───────────────────────────────────

  describe('permisos y baja completa', () => {
    it('con EQUIPOS:LECTURA y sin BORRADO -> 403 en la baja y en el resumen, y nada cambia', async () => {
      const actor = await crearActorConPermisos(['EQUIPOS:LECTURA']);
      const equipo = await equipoConDosPiezas();
      const antes = await foto(equipo.id);

      expect((await postBaja(equipo.id, actor.accessToken, BAJA_VEJEZ)).status).toBe(403);
      expect(
        (await http<unknown>('GET', resumenUrl(equipo.id), bearer(actor.accessToken))).status,
      ).toBe(403);

      expect(await foto(equipo.id)).toEqual(antes);
    });

    it('STOCK_USADO con solo EQUIPOS:BORRADO (sin permisos de insumos) -> 200, piezas retiradas y ENTRADAs registradas', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();

      const { status, data } = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        motivo: 'equipo viejo',
      });

      expect(status).toBe(200);
      expect(data.activo).toBe(false);
      expect(data.baja).toMatchObject({
        destino: 'STOCK_USADO',
        categoria: 'VEJEZ',
        usuarioId: actor.usuarioId,
      });
      expect(data.baja?.motivo).toBe('equipo viejo');
      expect(data.componentes).toHaveLength(2);
      for (const componente of data.componentes) {
        expect(componente.activo).toBe(false);
        expect(componente.bajaDestino).toBe('STOCK_USADO');
        expect(componente.bajaMotivo).toBe(
          `Baja del equipo «${equipo.nombre}» — Vejez: equipo viejo`,
        );
        expect(componente.bajaMovimientoId).not.toBeNull();
      }
      const entradas = await tenantClient.movimientoInsumo.findMany({
        where: { tipo: 'ENTRADA', condicion: 'USADO' },
      });
      expect(entradas.map((e) => e.id).sort()).toEqual(
        data.componentes.map((c) => c.bajaMovimientoId).sort(),
      );
      expect(entradas.every((e) => e.equipoId === equipo.id)).toBe(true);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({
        where: { id: equipo.unidadId },
      });
      expect(unidad).toMatchObject({ estado: 'EN_DEPOSITO', condicion: 'USADO', equipoId: null });
    });

    it('DESCARTE ignora el destino por pieza: ambas piezas DESCARTE y sin movimientos', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();

      const { status, data } = await postBaja(equipo.id, actor.accessToken, {
        destino: 'DESCARTE',
        categoria: 'ROTURA',
        piezas: [{ componenteId: equipo.componenteUnidad, destino: 'STOCK_USADO' }],
        seriales: [
          { componenteId: equipo.componenteNinguno, numeroSerie: 'X-1', destino: 'STOCK_USADO' },
        ],
      });

      expect(status).toBe(200);
      expect(data.baja?.destino).toBe('DESCARTE');
      expect(data.componentes.map((c) => c.bajaDestino)).toEqual(['DESCARTE', 'DESCARTE']);
      expect(await tenantClient.movimientoInsumo.count()).toBe(0);
      const unidad = await tenantClient.unidadInsumo.findUniqueOrThrow({
        where: { id: equipo.unidadId },
      });
      expect(unidad.estado).toBe('DESCARTADA');
    });

    it('solo destino por pieza, sin destino de la baja -> 400 y nada cambia', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const antes = await foto(equipo.id);

      const { status } = await postBaja(equipo.id, actor.accessToken, {
        categoria: 'VEJEZ',
        piezas: [{ componenteId: equipo.componenteUnidad, destino: 'DESCARTE' }],
      });

      expect(status).toBe(400);
      expect(await foto(equipo.id)).toEqual(antes);
    });
  });

  // ─── R4, R5: validación del cuerpo ──────────────────────────────────────

  describe('validación del cuerpo', () => {
    it.each([
      ['destino REGALO', { destino: 'REGALO', categoria: 'VEJEZ' }],
      ['destino ausente', { categoria: 'VEJEZ' }],
      ['categoría ausente', { destino: 'DESCARTE' }],
      ['categoría OTROS', { destino: 'DESCARTE', categoria: 'OTROS' }],
      ['motivo de más de 500 caracteres', { ...BAJA_VEJEZ, motivo: 'x'.repeat(501) }],
      [
        'componenteId repetido en seriales',
        {
          ...BAJA_VEJEZ,
          seriales: [
            { componenteId: randomUUID(), numeroSerie: 'A' },
            { componenteId: '00000000-0000-4000-8000-000000000001', numeroSerie: 'B' },
            { componenteId: '00000000-0000-4000-8000-000000000001', numeroSerie: 'C' },
          ],
        },
      ],
      [
        'componenteId que no es uuid',
        { ...BAJA_VEJEZ, seriales: [{ componenteId: 'x', numeroSerie: 'A' }] },
      ],
    ])('%s -> 400 y nada cambia', async (_caso, cuerpo) => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const antes = await foto(equipo.id);

      const { status } = await postBaja(equipo.id, actor.accessToken, cuerpo);

      expect(status).toBe(400);
      expect(await foto(equipo.id)).toEqual(antes);
    });

    it.each([
      ['sin texto', undefined],
      ['con solo espacios', '   '],
    ])(
      'OTRA %s -> 422 MOTIVO_BAJA_EQUIPO_INVALIDO sin largoMaximo y nada cambia',
      async (_c, motivo) => {
        const actor = await crearActorConPermisos(PERMISOS_BAJA);
        const equipo = await equipoConDosPiezas();
        const antes = await foto(equipo.id);

        const { status, data } = await postBaja(equipo.id, actor.accessToken, {
          destino: 'DESCARTE',
          categoria: 'OTRA',
          ...(motivo === undefined ? {} : { motivo }),
        });

        expect(status).toBe(422);
        expect(data.code).toBe('MOTIVO_BAJA_EQUIPO_INVALIDO');
        expect(data.largoMaximo).toBeUndefined();
        expect(await foto(equipo.id)).toEqual(antes);
      },
    );

    it('OTRA con "reciclado para repuestos" -> 200 con la leyenda compuesta', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();

      const { status, data } = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        categoria: 'OTRA',
        motivo: 'reciclado para repuestos',
      });

      expect(status).toBe(200);
      expect(data.baja).toMatchObject({ categoria: 'OTRA' });
      expect(data.baja?.motivo).toBe('reciclado para repuestos');
      expect(data.componentes.map((c) => c.bajaMotivo)).toEqual([
        `Baja del equipo «${equipo.nombre}» — Otra: reciclado para repuestos`,
        `Baja del equipo «${equipo.nombre}» — Otra: reciclado para repuestos`,
      ]);
    });

    it('texto de N+1 caracteres -> 422 con largoMaximo N y nada cambia; con N caracteres -> 200', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const resumen = await http<Resumen>('GET', resumenUrl(equipo.id), bearer(actor.accessToken));
      const n = resumen.data.largoMaximoTexto.OTRA;
      const antes = await foto(equipo.id);

      const largo = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        categoria: 'OTRA',
        motivo: 'a'.repeat(n + 1),
      });

      expect(largo.status).toBe(422);
      expect(largo.data.code).toBe('MOTIVO_BAJA_EQUIPO_INVALIDO');
      expect(largo.data.largoMaximo).toBe(n);
      expect(await foto(equipo.id)).toEqual(antes);

      const justo = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        categoria: 'OTRA',
        motivo: 'a'.repeat(n),
      });
      expect(justo.status).toBe(200);
      expect(justo.data.baja?.motivo).toHaveLength(n);
      expect(justo.data.componentes[0].bajaMotivo).toHaveLength(500);
    });
  });

  // ─── R7: piezas que no pueden volver al depósito ────────────────────────

  describe('piezas que no pueden volver al depósito', () => {
    it('STOCK_USADO -> 422 con TODAS las piezas problemáticas y nada cambia; con el serial del legado, solo queda la pieza de insumo borrado', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const legado = await agregarComponente(equipo.id, insumoSerieId);
      const deInsumoBorrado = await agregarComponente(equipo.id, insumoBorradoId);
      const antes = await foto(equipo.id);

      const sinSerial = await postBaja(equipo.id, actor.accessToken, BAJA_VEJEZ);

      expect(sinSerial.status).toBe(422);
      expect(sinSerial.data.code).toBe('BAJA_EQUIPO_PIEZAS_PROBLEMATICAS');
      expect(sinSerial.data.piezas).toEqual(
        expect.arrayContaining([
          { componenteId: legado, insumoId: insumoSerieId, causa: 'SERIAL_REQUERIDO' },
          { componenteId: deInsumoBorrado, insumoId: insumoBorradoId, causa: 'INSUMO_BORRADO' },
        ]),
      );
      expect(sinSerial.data.piezas).toHaveLength(2);
      expect(await foto(equipo.id)).toEqual(antes);

      const conSerial = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        seriales: [{ componenteId: legado, numeroSerie: 'SN-LEGADO-1' }],
      });
      expect(conSerial.status).toBe(422);
      expect(conSerial.data.piezas).toEqual([
        { componenteId: deInsumoBorrado, insumoId: insumoBorradoId, causa: 'INSUMO_BORRADO' },
      ]);
      expect(await foto(equipo.id)).toEqual(antes);
    });

    it('con el serial del legado y sin piezas problemáticas -> 200 y la unidad nace EN_DEPOSITO USADO', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await crearEquipo();
      const legado = await agregarComponente(equipo.id, insumoSerieId);

      const { status, data } = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        seriales: [{ componenteId: legado, numeroSerie: 'SN-LEGADO-2' }],
      });

      expect(status).toBe(200);
      expect(data.componentes[0].bajaMovimientoId).not.toBeNull();
      const unidad = await tenantClient.unidadInsumo.findFirstOrThrow({
        where: { numeroSerie: 'SN-LEGADO-2' },
      });
      expect(unidad).toMatchObject({ estado: 'EN_DEPOSITO', condicion: 'USADO', equipoId: null });
    });
  });

  // ─── R9, R10: resumen y tickets abiertos ────────────────────────────────

  describe('resumen previo a la baja', () => {
    it('informa ticketsAbiertos (sin contar los cerrados), largoMaximoTexto y las piezas con su causa', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const legado = await agregarComponente(equipo.id, insumoSerieId);
      await crearTicket(equipo.id);
      await crearTicket(equipo.id);
      await crearTicket(equipo.id, true);

      const { status, data } = await http<Resumen>(
        'GET',
        resumenUrl(equipo.id),
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.equipoId).toBe(equipo.id);
      expect(data.nombre).toBe(equipo.nombre);
      expect(data.ticketsAbiertos).toBe(2);
      expect(Object.keys(data.largoMaximoTexto).sort()).toEqual([
        'DONACION',
        'OTRA',
        'ROTURA',
        'VEJEZ',
      ]);
      expect(data.piezas).toHaveLength(3);
      const pieza = (id: string) => data.piezas.find((p) => p.componenteId === id);
      expect(pieza(equipo.componenteUnidad)).toMatchObject({
        unidadId: equipo.unidadId,
        numeroSerie: 'SN-BAJA-1',
        seguimiento: 'SERIE',
        requiereSerial: false,
        causaQueImpideDevolver: null,
      });
      expect(pieza(equipo.componenteNinguno)).toMatchObject({
        seguimiento: 'NINGUNO',
        causaQueImpideDevolver: null,
      });
      expect(pieza(legado)).toMatchObject({
        unidadId: null,
        requiereSerial: true,
        causaQueImpideDevolver: 'SERIAL_REQUERIDO',
      });
    });

    it('un equipo dado de baja -> 422 EQUIPO_DADO_DE_BAJA; con borrado lógico o id que no es uuid -> 404', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const baja = await crearEquipo();
      await postBaja(baja.id, actor.accessToken, BAJA_VEJEZ);
      const borrado = await crearEquipo();
      await tenantClient.equipoInformatico.update({
        where: { id: borrado.id },
        data: { deletedAt: new Date() },
      });
      const get = (id: string) =>
        http<CuerpoError>('GET', resumenUrl(id), bearer(actor.accessToken));

      expect((await get(baja.id)).status).toBe(422);
      expect((await get(borrado.id)).status).toBe(404);
      expect((await get('no-es-uuid')).status).toBe(404);
    });
  });

  describe('tickets abiertos y equipo dado de baja', () => {
    it('la baja con 2 tickets abiertos -> 200 y los tickets siguen abiertos referenciando al equipo', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const tickets = [await crearTicket(equipo.id), await crearTicket(equipo.id)];

      const { status } = await postBaja(equipo.id, actor.accessToken, BAJA_VEJEZ);

      expect(status).toBe(200);
      const filas = await tenantClient.ticketSoporte.findMany({
        where: { ticketId: { in: tickets } },
        include: { ticket: { include: { estado: true } } },
      });
      expect(filas).toHaveLength(2);
      for (const fila of filas) {
        expect(fila.equipoId).toBe(equipo.id);
        expect(fila.deletedAt).toBeNull();
        expect(fila.ticket.estado.codigo).toBe('NUEVO');
        expect(fila.ticket.deletedAt).toBeNull();
      }
    });

    it('una segunda baja -> 422 EQUIPO_DADO_DE_BAJA y los datos de la primera quedan intactos', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await equipoConDosPiezas();
      const primera = await postBaja(equipo.id, actor.accessToken, {
        ...BAJA_VEJEZ,
        motivo: 'primera',
      });
      expect(primera.status).toBe(200);
      const antes = await foto(equipo.id);
      const filaAntes = await tenantClient.equipoInformatico.findUniqueOrThrow({
        where: { id: equipo.id },
      });

      const segunda = await postBaja(equipo.id, actor.accessToken, {
        destino: 'DESCARTE',
        categoria: 'ROTURA',
        motivo: 'segunda',
      });

      expect(segunda.status).toBe(422);
      expect(await foto(equipo.id)).toEqual(antes);
      const filaDespues = await tenantClient.equipoInformatico.findUniqueOrThrow({
        where: { id: equipo.id },
      });
      expect(filaDespues.bajaMotivo).toBe(filaAntes.bajaMotivo);
      expect(filaDespues.bajaFecha).toEqual(filaAntes.bajaFecha);
    });

    it('un equipo con borrado lógico -> 404 en la baja y nada cambia', async () => {
      const actor = await crearActorConPermisos(PERMISOS_BAJA);
      const equipo = await crearEquipo();
      await tenantClient.equipoInformatico.update({
        where: { id: equipo.id },
        data: { deletedAt: new Date() },
      });
      const antes = await foto(equipo.id);

      const { status } = await postBaja(equipo.id, actor.accessToken, BAJA_VEJEZ);

      expect(status).toBe(404);
      expect(await foto(equipo.id)).toEqual(antes);
    });

    it('la ficha de un equipo dado de baja responde con baja y componentes retirados con su movimiento', async () => {
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO', 'EQUIPOS:LECTURA']);
      const equipo = await equipoConDosPiezas();
      await postBaja(equipo.id, actor.accessToken, BAJA_VEJEZ);

      const { status, data } = await http<Detalle>(
        'GET',
        `${baseUrl}/equipos/${equipo.id}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.activo).toBe(false);
      expect(data.baja).toMatchObject({ destino: 'STOCK_USADO', categoria: 'VEJEZ' });
      expect(data.componentes).toHaveLength(2);
      expect(data.componentes.every((c) => !c.activo && c.bajaDestino === 'STOCK_USADO')).toBe(
        true,
      );
      const movimientos = await tenantClient.movimientoInsumo.findMany({
        where: { id: { in: data.componentes.map((c) => c.bajaMovimientoId ?? '') } },
      });
      expect(movimientos).toHaveLength(2);
    });

    it('un ticket nuevo sobre un equipo dado de baja -> 422 y no se crea el ticket', async () => {
      const actor = await crearActorConPermisos(['EQUIPOS:BORRADO', 'TICKETS:ALTAS']);
      const equipo = await crearEquipo();
      await postBaja(equipo.id, actor.accessToken, BAJA_VEJEZ);

      const { status } = await http<CuerpoError>(
        'POST',
        `${baseUrl}/soporte`,
        bearer(actor.accessToken),
        {
          titulo: 'Falla en el equipo',
          prioridadId,
          equipoId: equipo.id,
        },
      );

      expect(status).toBe(422);
      expect(await tenantClient.ticket.count()).toBe(0);
    });
  });
});
