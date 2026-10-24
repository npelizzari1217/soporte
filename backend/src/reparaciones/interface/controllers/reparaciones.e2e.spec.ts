/**
 * reparaciones.e2e.spec.ts — WU5.8 (sdd/reparacion-bloqueada-por-compra),
 * CRÍTICO. Levanta la app REAL (Nest, `AccionesGuard` activo, sin mocks de
 * infraestructura) y pega por HTTP a `POST/DELETE .../compras`.
 *
 * Vincular y desvincular una compra exigen DOS cosas: `MODIFICACION` sobre el
 * tipo del ticket (odd/ticket-unificado, S4; antes `EDILICIA:ALTAS` y
 * `EDILICIA:BORRADO`) Y `COMPRAS:LECTURA` (decisión de producto #2435). Un unit
 * test del controller mockea el guard y solo lee metadata — acá un actor real
 * sin una de las dos recibe 403 de verdad.
 *
 * odd/ticket-unificado: las compras, la ubicación y los comentarios son del
 * ticket, de cualquier tipo; el listado se arma sobre los tickets (con `?tipo=`)
 * y devuelve ids de ticket, y las rutas viejas aceptan el id del satélite o el
 * del ticket.
 *
 * Mismo patrón que `compras.e2e.spec.ts`/`sectores.e2e.spec.ts`
 * (provisioning de tenant efímero, fetch nativo, `crearActorConPermisos`,
 * orden `app.close()` → limpieza de filas → `onModuleDestroy()` →
 * `dropDatabase`, turno exclusivo `usarLockMasterTest()` sobre la master de
 * test compartida).
 *
 * Ref spec: sdd/reparacion-bloqueada-por-compra/spec, capability "Vínculo
 * Reparación–Compra". Ref design: D4, D5, D7. Ref tasks: WU5.8, WU5.9.
 *
 * odd/tareas-con-tecnico: el listado embebe las tareas del ticket como
 * `subtareas` y calcula el avance sobre ellas. T8 retiró las rutas viejas
 * `/reparaciones/.../subtareas`, la tabla `subtareas_edilicia` y las columnas
 * `personal_asignado_id` y `porcentaje_avance`.
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
import { ReparacionesModule } from '../../reparaciones.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../../clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import {
  ListReparacionesResponseDto,
  ReparacionListItemResponseDto,
} from '../dtos/reparaciones.dto';
import { TicketResponseDto } from '../../../tickets/interface/dtos/ticket.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import {
  celdasDeLaMatriz,
  sembrarPermisosPorTipoE2e,
} from '../../../tickets/test-helpers/permisos-por-tipo-e2e';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_reparE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eReparacionesSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que compras.e2e.spec.ts) ──────

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

async function httpDelete(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, AuthModule, ReparacionesModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Reparaciones e2e — vínculo con compra, autorización REAL por HTTP (WU5.8, crítico)', () => {
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

  let estadoNuevoId: string;
  let tipoEdiliciaId: string;
  let prioridadMediaId: string;
  let cicloActivoId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();

    const estadoNuevo = await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } });
    estadoNuevoId = estadoNuevo.id;
    const tipoEdilicia = await tenantClient.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'EDILICIA' },
    });
    tipoEdiliciaId = tipoEdilicia.id;
    const prioridadMedia = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadMediaId = prioridadMedia.id;

    const cicloActivo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000002',
        nombre: 'E2E Ciclo Activo Reparaciones',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    cicloActivoId = cicloActivo.id;

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
    // Orden CRÍTICO (bug real documentado en PR-14/compras.e2e.spec.ts):
    // app.close() SIEMPRE antes de dropDatabase.
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      await tenantClient.cicloCliente.delete({ where: { id: cicloActivoId } });
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
      nombre: `E2E Reparaciones ${randomBytes(3).toString('hex')}`,
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
      email: `e2e_repar_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'Reparaciones',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
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
   * Actor con exactamente las celdas pedidas, sembradas en la matriz nueva
   * (`usuario_cliente_permisos`) — mismo patrón que `compras.e2e.spec.ts`.
   * El rol NO es `'ADMINISTRADOR'` a propósito: ese código bypassea el
   * `AccionesGuard` completo y las aserciones de "SOLO tiene X" quedarían
   * mudas.
   *
   * `clienteIdExistente` (mismo fix C3 que `sectores.e2e.spec.ts`): permite
   * compartir el MISMO cliente/tenant entre dos actores de un mismo test —
   * `crearClienteTenant()` usa `TENANT_DB_NAME` fijo por archivo, así que una
   * 2ª llamada sin reusar el cliente choca contra el `db_name` UNIQUE.
   */
  async function crearActorConPermisos(
    permisos: string[],
    clienteIdExistente?: string,
  ): Promise<{ accessToken: string; clienteId: string; usuarioId: string }> {
    const clienteId = clienteIdExistente ?? (await crearClienteTenant()).id;
    const role = await createRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, clienteId, role.id);
    await permisosRepo.setPermisos(usuario.id, clienteId, celdasDeLaMatriz(permisos));
    // Las rutas de tareas del ticket deciden con los permisos por tipo del tenant: los mismos que
    // estas celdas, traducidos por L11 (odd/permisos-por-tipo-ticket, T5a). Las de tickets ya no van
    // a la matriz master (T9b).
    await sembrarPermisosPorTipoE2e(tenantClient, new Map([[usuario.id, permisos]]));
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId, usuarioId: usuario.id };
  }

  /**
   * Crea directo por Prisma una reparación vieja: ticket de tipo EDILICIA con su satélite. Desde
   * odd/ticket-unificado la ubicación es la del ticket; el satélite queda sin ubicación propia.
   */
  async function crearReparacion(): Promise<{ reparacionId: string; ticketId: string }> {
    const ticketId = await crearTicket(tipoEdiliciaId);
    const ticketEdilicia = await tenantClient.ticketEdilicia.create({ data: { ticketId } });
    return { reparacionId: ticketEdilicia.id, ticketId };
  }

  /** Crea directo por Prisma un ticket del tipo dado, SIN satélite de Edilicia. */
  async function crearTicket(tipoId: string): Promise<string> {
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: `E2E-${randomBytes(4).toString('hex')}`,
        titulo: 'Ticket E2E',
        tipoId,
        estadoId: estadoNuevoId,
        prioridadId: prioridadMediaId,
        cicloId: cicloActivoId,
        solicitanteId: '00000000-0000-4000-8000-000000000ccc',
        ubicacion: 'Edificio E2E',
      },
    });
    return ticket.id;
  }

  /** Crea directo por Prisma una compra SIN ítems — grupo ACTIVAS por defecto (D6, WU1). */
  async function crearCompra(): Promise<string> {
    const compra = await tenantClient.compra.create({
      data: {
        numero: `COM-E2E-${randomBytes(4).toString('hex')}`,
        fechaSolicitud: new Date('2026-06-01'),
        motivo: 'Compra E2E para vínculo',
        solicitanteId: '00000000-0000-4000-8000-000000000ccc',
        cicloId: cicloActivoId,
      },
    });
    return compra.id;
  }

  const vinculosDe = (ticketId: string): Promise<number> =>
    tenantClient.ticketCompra.count({ where: { ticketId } });

  /** Quien ve y modifica los tickets de Edilicia y lee compras: puede vincular y desvincular (S4). */
  const PUEDE_VINCULAR = [
    'COMPRAS:LECTURA',
    'EDILICIA:LECTURA',
    'EDILICIA:MODIFICACION',
    'TICKETS:VER_TODOS',
  ];

  // ─── Vincular: MODIFICACION sobre el tipo Y COMPRAS:LECTURA (odd/ticket-unificado, S4) ────────

  describe('POST /reparaciones/:reparacionId/compras — Modificar sobre el tipo y COMPRAS:LECTURA (S4)', () => {
    it('ve y modifica el ticket pero sin COMPRAS:LECTURA → 403 de la ruta y no vincula', async () => {
      const actor = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId } = await crearReparacion();
      const compraId = await crearCompra();

      const { status } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await vinculosDe(ticketId)).toBe(0);
    });

    it('SOLO COMPRAS:LECTURA (sin filas por tipo) → 404 de la reparación y no vincula', async () => {
      const actor = await crearActorConPermisos(['COMPRAS:LECTURA']);
      const { reparacionId, ticketId } = await crearReparacion();
      const compraId = await crearCompra();

      const { status, data } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      // El 404 nombra la reparación pedida, nunca el ticket.
      expect(JSON.stringify(data)).toContain(reparacionId);
      expect(JSON.stringify(data)).not.toContain(ticketId);
      expect(await vinculosDe(ticketId)).toBe(0);
    });

    it('COMPRAS:LECTURA y ve el ticket con ALTAS pero sin MODIFICACION sobre su tipo → 403 y no vincula', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:LECTURA',
        'EDILICIA:LECTURA',
        'EDILICIA:ALTAS',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId } = await crearReparacion();
      const compraId = await crearCompra();

      const { status, data } = await httpPost<{ message: string }>(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(data.message).toBe(
        'El usuario no tiene el permiso "MODIFICACION" sobre el tipo de este ticket.',
      );
      expect(await vinculosDe(ticketId)).toBe(0);
    });

    it('con MODIFICACION y COMPRAS:LECTURA → 201: el vínculo es del ticket, lo bloquea, y la tabla vieja no se escribe', async () => {
      const actor = await crearActorConPermisos(PUEDE_VINCULAR);
      const { reparacionId, ticketId } = await crearReparacion();
      const compraId = await crearCompra();

      const vincular = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );
      expect(vincular.status).toBe(201);
      expect(await tenantClient.ticketCompra.findMany({ where: { ticketId } })).toEqual([
        expect.objectContaining({ ticketId, compraId }),
      ]);
      expect(await tenantClient.reparacionCompra.count({ where: { compraId } })).toBe(0);

      const listado = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?porPagina=100`,
        bearer(actor.accessToken),
      );
      // La fila se identifica por el ticket desde odd/ticket-unificado.
      const fila = listado.data.items.find((r) => r.id === ticketId);
      expect(fila?.bloqueada).toBe(true);
      expect(fila?.comprasQueBloquean.map((c) => c.id)).toEqual([compraId]);
      expect(fila?.tipoId).toBe(tipoEdiliciaId);

      // El filtro de bloqueo se resuelve en el servidor (odd/reparaciones-paginadas, S1-S3).
      const bloqueadas = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?bloqueo=BLOQUEADAS&porPagina=100`,
        bearer(actor.accessToken),
      );
      const libres = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?bloqueo=NO_BLOQUEADAS&porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(bloqueadas.data.items.map((r) => r.id)).toContain(ticketId);
      expect(bloqueadas.data.items.every((r) => r.bloqueada)).toBe(true);
      expect(libres.data.items.map((r) => r.id)).not.toContain(ticketId);
      expect(bloqueadas.data.total + libres.data.total).toBe(listado.data.total);
    });

    it('la ruta vieja acepta también el id del ticket, que es el que devuelve el listado ahora', async () => {
      const actor = await crearActorConPermisos(PUEDE_VINCULAR);
      const { ticketId } = await crearReparacion();
      const compraId = await crearCompra();

      const { status } = await httpPost(
        `${baseUrl}/reparaciones/${ticketId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(await vinculosDe(ticketId)).toBe(1);
    });

    it('404 CompraNoEncontradaError: compraId inexistente, con los dos permisos y viendo el ticket', async () => {
      const actor = await crearActorConPermisos(PUEDE_VINCULAR);
      const { reparacionId } = await crearReparacion();

      const { status, data } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId: '00000000-0000-4000-8000-000000000fff' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      expect(JSON.stringify(data)).toContain(
        'Compra con id \\"00000000-0000-4000-8000-000000000fff\\" no encontrada.',
      );
    });
  });

  describe('DELETE /reparaciones/:reparacionId/compras/:compraId — los mismos permisos que vincular (S4)', () => {
    /** Un ticket de Edilicia con una compra ya vinculada (directo por Prisma). */
    async function conVinculo(): Promise<{
      reparacionId: string;
      ticketId: string;
      compraId: string;
    }> {
      const { reparacionId, ticketId } = await crearReparacion();
      const compraId = await crearCompra();
      await tenantClient.ticketCompra.create({ data: { ticketId, compraId } });
      return { reparacionId, ticketId, compraId };
    }

    it('con MODIFICACION y COMPRAS:LECTURA desvincula (204, hard delete)', async () => {
      const actor = await crearActorConPermisos(PUEDE_VINCULAR);
      const { reparacionId, ticketId, compraId } = await conVinculo();

      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(204);
      expect(await vinculosDe(ticketId)).toBe(0);
    });

    it('con la celda vieja EDILICIA:BORRADO pero sin COMPRAS:LECTURA → 403 y el vínculo sigue', async () => {
      const actor = await crearActorConPermisos([
        'EDILICIA:BORRADO',
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId, compraId } = await conVinculo();

      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await vinculosDe(ticketId)).toBe(1);
    });

    it('con COMPRAS:LECTURA y EDILICIA:BORRADO, viendo el ticket sin MODIFICACION → 403 y el vínculo sigue', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:LECTURA',
        'EDILICIA:BORRADO',
        'EDILICIA:LECTURA',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId, compraId } = await conVinculo();

      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await vinculosDe(ticketId)).toBe(1);
    });

    it('con COMPRAS:LECTURA que no ve el ticket → 404 y el vínculo sigue', async () => {
      const actor = await crearActorConPermisos(['COMPRAS:LECTURA']);
      const { reparacionId, ticketId, compraId } = await conVinculo();

      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      expect(await vinculosDe(ticketId)).toBe(1);
    });

    it('404 VinculoNoEncontradoError: vínculo inexistente, con los dos permisos y viendo el ticket', async () => {
      const actor = await crearActorConPermisos(PUEDE_VINCULAR);
      const { reparacionId, ticketId } = await crearReparacion();
      const compraId = await crearCompra();

      const { status, data } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      expect(JSON.stringify(data)).toContain(
        `No existe un vínculo entre el ticket \\"${ticketId}\\"`,
      );
    });
  });

  // ─── Compras de cualquier ticket (odd/ticket-unificado, S1, S4, S5) ───────

  describe('/tickets/:ticketId/compras — un ticket de Soporte, sin satélite', () => {
    let tipoSoporteId: string;
    /** Ve y modifica los tickets de Soporte y lee compras. */
    const PUEDE_VINCULAR_SOPORTE = [
      'COMPRAS:LECTURA',
      'TICKETS:LECTURA',
      'TICKETS:VER_TODOS',
      'TICKETS:MODIFICACION',
    ];

    beforeAll(async () => {
      tipoSoporteId = (
        await tenantClient.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } })
      ).id;
    });

    it('vincular bloquea el ticket: GET lo informa, sus tareas se congelan, y al desvincular vuelven', async () => {
      const actor = await crearActorConPermisos(PUEDE_VINCULAR_SOPORTE);
      const ticketId = await crearTicket(tipoSoporteId);
      // Las tareas las gestiona el responsable del ticket (CA3).
      await tenantClient.ticket.update({
        where: { id: ticketId },
        data: { asignadoId: actor.usuarioId },
      });
      const compraId = await crearCompra();
      const auth = bearer(actor.accessToken);
      const compras = `${baseUrl}/tickets/${ticketId}/compras`;

      expect((await httpGet<unknown[]>(compras, auth)).data).toEqual([]);
      expect((await httpPost(compras, { compraId }, auth)).status).toBe(201);

      const listado = await httpGet<unknown[]>(compras, auth);
      expect(listado.status).toBe(200);
      expect(listado.data).toEqual([
        {
          id: compraId,
          numero: expect.stringMatching(/^COM-E2E-/),
          grupo: 'ACTIVAS',
          bloquea: true,
        },
      ]);

      // S5: un ticket con una compra activa vinculada frena sus tareas, sea del tipo que sea.
      const bloqueada = await httpPost<{ message: string }>(
        `${baseUrl}/tickets/${ticketId}/tareas`,
        { descripcion: 'No debería poder' },
        auth,
      );
      expect(bloqueada.status).toBe(422);
      expect(bloqueada.data.message).toMatch(/bloquead/);
      expect(await tenantClient.tareaTicket.count({ where: { ticketId } })).toBe(0);

      expect((await httpDelete(`${compras}/${compraId}`, auth)).status).toBe(204);
      expect((await httpGet<unknown[]>(compras, auth)).data).toEqual([]);
      const libre = await httpPost(
        `${baseUrl}/tickets/${ticketId}/tareas`,
        { descripcion: 'Ahora sí' },
        auth,
      );
      expect(libre.status).toBe(201);
    });

    it('sin COMPRAS:LECTURA no vincula, no desvincula ni lista las compras (403); sin verlo, GET responde 404', async () => {
      const ticketId = await crearTicket(tipoSoporteId);
      const compraId = await crearCompra();
      const sinCompras = await crearActorConPermisos([
        'TICKETS:LECTURA',
        'TICKETS:VER_TODOS',
        'TICKETS:MODIFICACION',
      ]);
      const ajeno = await crearActorConPermisos(['COMPRAS:LECTURA'], sinCompras.clienteId);
      const compras = `${baseUrl}/tickets/${ticketId}/compras`;

      expect((await httpPost(compras, { compraId }, bearer(sinCompras.accessToken))).status).toBe(
        403,
      );
      expect((await httpGet(compras, bearer(ajeno.accessToken))).status).toBe(404);
      expect(await vinculosDe(ticketId)).toBe(0);

      // Con un vínculo real, quien ve el ticket sin COMPRAS:LECTURA no lee las compras (L19), pero
      // sigue sabiendo que el ticket está bloqueado por el listado.
      await tenantClient.ticketCompra.create({ data: { ticketId, compraId } });
      const listado = await httpGet<{ message: string }>(compras, bearer(sinCompras.accessToken));
      expect(listado.status).toBe(403);
      expect(JSON.stringify(listado.data)).not.toContain(compraId);
      expect(
        (await httpDelete(`${compras}/${compraId}`, bearer(sinCompras.accessToken))).status,
      ).toBe(403);
      expect(await vinculosDe(ticketId)).toBe(1);
      const fila = (
        await httpGet<ListReparacionesResponseDto>(
          `${baseUrl}/reparaciones?tipo=${tipoSoporteId}&porPagina=100`,
          bearer(sinCompras.accessToken),
        )
      ).data.items.find((r) => r.id === ticketId);
      expect(fila?.bloqueada).toBe(true);
    });

    /**
     * El detalle informa el bloqueo a todo el que ve el ticket (odd/ticket-unificado, S5, L19, L22),
     * sin COMPRAS:LECTURA: el booleano, nunca qué compra lo bloquea.
     */
    it('GET /tickets/:id informa bloqueada sin COMPRAS:LECTURA, y deja de estarlo al desvincular', async () => {
      const ticketId = await crearTicket(tipoSoporteId);
      const compraId = await crearCompra();
      const gestor = await crearActorConPermisos(PUEDE_VINCULAR_SOPORTE);
      const lector = await crearActorConPermisos(
        ['TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
        gestor.clienteId,
      );
      const detalle = (): Promise<{ status: number; data: TicketResponseDto }> =>
        httpGet<TicketResponseDto>(`${baseUrl}/tickets/${ticketId}`, bearer(lector.accessToken));

      const libre = await detalle();
      expect(libre.status).toBe(200);
      expect(libre.data.bloqueada).toBe(false);

      expect(
        (
          await httpPost(
            `${baseUrl}/tickets/${ticketId}/compras`,
            { compraId },
            bearer(gestor.accessToken),
          )
        ).status,
      ).toBe(201);
      const { numero } = await tenantClient.compra.findUniqueOrThrow({ where: { id: compraId } });

      const bloqueado = await detalle();
      expect(bloqueado.status).toBe(200);
      expect(bloqueado.data).toMatchObject({ id: ticketId, bloqueada: true });
      // L19: quien no lee compras no se entera de cuál lo bloquea.
      expect(JSON.stringify(bloqueado.data)).not.toContain(compraId);
      expect(JSON.stringify(bloqueado.data)).not.toContain(numero);
      expect(
        (await httpGet(`${baseUrl}/tickets/${ticketId}/compras`, bearer(lector.accessToken)))
          .status,
      ).toBe(403);

      expect(
        (
          await httpDelete(
            `${baseUrl}/tickets/${ticketId}/compras/${compraId}`,
            bearer(gestor.accessToken),
          )
        ).status,
      ).toBe(204);
      expect((await detalle()).data.bloqueada).toBe(false);
    });

    it('GET /tickets/:id con la compra vinculada cancelada: bloqueada=false, y el vínculo sigue', async () => {
      const ticketId = await crearTicket(tipoSoporteId);
      const compraId = await crearCompra();
      await tenantClient.ticketCompra.create({ data: { ticketId, compraId } });
      const lector = await crearActorConPermisos(['TICKETS:LECTURA', 'TICKETS:VER_TODOS']);
      const detalle = async (): Promise<boolean | undefined> =>
        (
          await httpGet<TicketResponseDto>(
            `${baseUrl}/tickets/${ticketId}`,
            bearer(lector.accessToken),
          )
        ).data.bloqueada;

      expect(await detalle()).toBe(true);

      await tenantClient.compra.update({
        where: { id: compraId },
        data: {
          canceladaEn: new Date(),
          canceladoPorId: '00000000-0000-4000-8000-000000000ccc',
          motivoCancelacion: 'Cancelada en el e2e',
        },
      });

      expect(await detalle()).toBe(false);
      expect(await vinculosDe(ticketId)).toBe(1);
    });

    it('GET /reparaciones?tipo= lista los tickets de ese tipo con su bloqueo; sin tipo, solo los del módulo EDILICIA', async () => {
      const actor = await crearActorConPermisos([...PUEDE_VINCULAR_SOPORTE, 'EDILICIA:LECTURA']);
      const soporte = await crearTicket(tipoSoporteId);
      const edilicia = await crearTicket(tipoEdiliciaId);
      await tenantClient.ticketCompra.create({
        data: { ticketId: soporte, compraId: await crearCompra() },
      });

      const deSoporte = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?tipo=${tipoSoporteId}&porPagina=100`,
        bearer(actor.accessToken),
      );
      const porDefecto = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?porPagina=100`,
        bearer(actor.accessToken),
      );

      expect(deSoporte.status).toBe(200);
      expect(deSoporte.data.items.every((r) => r.tipoId === tipoSoporteId)).toBe(true);
      expect(deSoporte.data.items.find((r) => r.id === soporte)).toMatchObject({
        ticketId: soporte,
        ubicacion: 'Edificio E2E',
        bloqueada: true,
      });
      expect(deSoporte.data.items.map((r) => r.id)).not.toContain(edilicia);
      // Sin tipo: un ticket de Edilicia sin satélite entra igual; uno de Soporte, no.
      expect(porDefecto.data.items.map((r) => r.id)).toContain(edilicia);
      expect(porDefecto.data.items.map((r) => r.id)).not.toContain(soporte);
    });

    it('pedir un tipo sobre el que no tiene LECTURA no amplía nada: página vacía', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:LECTURA', 'TICKETS:VER_TODOS']);
      await crearTicket(tipoSoporteId);

      const r = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?tipo=${tipoSoporteId}`,
        bearer(actor.accessToken),
      );

      expect(r.status).toBe(200);
      expect(r.data).toMatchObject({ items: [], total: 0 });
    });
  });

  // ─── Listado: alcance por tipo y validación ────────────────────────────

  describe('GET /reparaciones — alcance y validación', () => {
    it('lista solo lo que el actor ve (odd/permisos-por-tipo-ticket, D5 e): sin VER_TODOS, sus tickets; sin filas, nada', async () => {
      const actor = await crearActorConPermisos([]);
      await tenantClient.permisoTipoTicket.create({
        data: { usuarioId: actor.usuarioId, tipoId: tipoEdiliciaId, accion: 'LECTURA' },
      });
      const propia = await crearReparacion();
      const ajena = await crearReparacion();
      await tenantClient.ticket.update({
        where: { id: propia.ticketId },
        data: { asignadoId: actor.usuarioId },
      });

      const conFila = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(conFila.status).toBe(200);
      expect(conFila.data.items.map((r) => r.id)).toEqual([propia.ticketId]);
      expect(conFila.data.total).toBe(1);
      expect(conFila.data.items.map((r) => r.id)).not.toContain(ajena.ticketId);

      // Sin filas por tipo no hay listado: la celda EDILICIA:LECTURA que lo abría ya no existe (T9b).
      const sinFilasPorTipo = await crearActorConPermisos([], actor.clienteId);
      const sinFilas = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones`,
        bearer(sinFilasPorTipo.accessToken),
      );
      expect(sinFilas.status).toBe(200);
      expect(sinFilas.data).toMatchObject({ items: [], total: 0 });
    });

    it('rechaza con 400 una paginación, un filtro o un tipo inválidos (odd/reparaciones-paginadas, S1)', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:LECTURA']);
      for (const query of ['porPagina=101', 'pagina=0', 'bloqueo=ALGUNAS', 'tipo=SOPORTE']) {
        const respuesta = await httpGet<unknown>(
          `${baseUrl}/reparaciones?${query}`,
          bearer(actor.accessToken),
        );
        expect(respuesta.status).toBe(400);
      }
    });
  });

  // ─── Comentarios: internos del ticket (odd/ticket-unificado, S3, L19) ────

  describe('comentarios de Edilicia = comentarios INTERNOS del ticket (S3, L19)', () => {
    /** Personal de Edilicia: ve, modifica y comenta los tickets del tipo, internos incluidos. */
    const PERSONAL = [
      'EDILICIA:LECTURA',
      'EDILICIA:MODIFICACION',
      'TICKETS:VER_TODOS',
      'TICKETS:OBSERVAR',
    ];

    type OperacionTimeline = { id: string; descripcion: string; esInterno: boolean };

    it('lo que se comenta en Edilicia es un comentario interno del timeline, y lo comentado desde Tickets aparece en Edilicia', async () => {
      const actor = await crearActorConPermisos(PERSONAL);
      const { reparacionId, ticketId } = await crearReparacion();
      const auth = bearer(actor.accessToken);

      const desdeEdilicia = await httpPost<{ id: string; ticketEdiliciaId: string }>(
        `${baseUrl}/reparaciones/${reparacionId}/comentarios`,
        { texto: '  Falta el repuesto X  ' },
        auth,
      );
      expect(desdeEdilicia.status).toBe(201);
      expect(desdeEdilicia.data.ticketEdiliciaId).toBe(ticketId);
      // Un comentario interno no cuenta como primera respuesta, igual que desde Tickets.
      const tras = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(tras.primeraRespuestaAt).toBeNull();
      const desdeTickets = await httpPost<{ id: string }>(
        `${baseUrl}/tickets/${ticketId}/comentarios`,
        { texto: 'Lo pedí al proveedor' },
        auth,
      );
      expect(desdeTickets.status).toBe(201);

      const timeline = await httpGet<OperacionTimeline[]>(
        `${baseUrl}/tickets/${ticketId}/timeline`,
        auth,
      );
      expect(timeline.data.find((op) => op.id === desdeEdilicia.data.id)).toMatchObject({
        descripcion: 'Falta el repuesto X',
        esInterno: true,
      });
      // La tabla congelada no se escribe más.
      expect(await tenantClient.comentarioReparacion.count()).toBe(0);

      const enEdilicia = await httpGet<{ id: string; texto: string }[]>(
        `${baseUrl}/reparaciones/${reparacionId}/comentarios`,
        auth,
      );
      expect(enEdilicia.data.map((c) => c.texto)).toEqual([
        'Lo pedí al proveedor',
        'Falta el repuesto X',
      ]);
      const fila = (
        await httpGet<ListReparacionesResponseDto>(`${baseUrl}/reparaciones?porPagina=100`, auth)
      ).data.items.find((r) => r.id === ticketId);
      expect(fila?.cantidadComentarios).toBe(2);
    });

    it('el solicitante sin OBSERVAR no ve el comentario de Edilicia, ni en Edilicia, ni en el timeline, ni en el conteo; ve el público', async () => {
      const personal = await crearActorConPermisos(PERSONAL);
      const solicitante = await crearActorConPermisos(
        ['EDILICIA:LECTURA', 'EDILICIA:MODIFICACION'],
        personal.clienteId,
      );
      const { reparacionId, ticketId } = await crearReparacion();
      await tenantClient.ticket.update({
        where: { id: ticketId },
        data: { solicitanteId: solicitante.usuarioId },
      });
      const interno = await httpPost<{ id: string }>(
        `${baseUrl}/reparaciones/${reparacionId}/comentarios`,
        { texto: 'Nota interna de Edilicia' },
        bearer(personal.accessToken),
      );
      expect(interno.status).toBe(201);
      const publico = await httpPost<{ id: string }>(
        `${baseUrl}/tickets/${ticketId}/comentarios`,
        { texto: 'Respuesta al solicitante' },
        bearer(personal.accessToken),
      );
      expect(publico.status).toBe(201);
      const auth = bearer(solicitante.accessToken);

      const enEdilicia = await httpGet<{ id: string }[]>(
        `${baseUrl}/reparaciones/${reparacionId}/comentarios`,
        auth,
      );
      expect(enEdilicia.status).toBe(200);
      expect(enEdilicia.data.map((c) => c.id)).toEqual([publico.data.id]);
      const timeline = await httpGet<OperacionTimeline[]>(
        `${baseUrl}/tickets/${ticketId}/timeline`,
        auth,
      );
      expect(timeline.data.map((op) => op.id)).toContain(publico.data.id);
      expect(timeline.data.map((op) => op.id)).not.toContain(interno.data.id);
      const fila = (
        await httpGet<ListReparacionesResponseDto>(`${baseUrl}/reparaciones?porPagina=100`, auth)
      ).data.items.find((r) => r.id === ticketId);
      expect(fila?.cantidadComentarios).toBe(1);
    });

    it('sin OBSERVAR sobre el tipo, comentar desde Edilicia es 403 y no escribe nada', async () => {
      const sinObservar = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId } = await crearReparacion();
      const antes = await tenantClient.operacionTicket.count({ where: { ticketId } });

      const r = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/comentarios`,
        { texto: 'No debería quedar' },
        bearer(sinObservar.accessToken),
      );

      expect(r.status).toBe(403);
      expect(await tenantClient.operacionTicket.count({ where: { ticketId } })).toBe(antes);
    });

    it('igual que un comentario interno de Tickets, se acepta con el ticket cerrado', async () => {
      const actor = await crearActorConPermisos(PERSONAL);
      const { reparacionId, ticketId } = await crearReparacion();
      const cerrado = await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'CERRADO' } });
      await tenantClient.ticket.update({ where: { id: ticketId }, data: { estadoId: cerrado.id } });

      const r = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/comentarios`,
        { texto: 'Nota posterior al cierre' },
        bearer(actor.accessToken),
      );

      expect(r.status).toBe(201);
    });
  });

  // ─── Altas: cualquier tipo con alta manual (odd/ticket-unificado, S2, S6) ────

  describe('altas de cualquier tipo, sin satélite obligatorio (S1, S2, S6)', () => {
    it('POST /tickets de un tipo de EDILICIA crea el ticket sin satélite y aparece en Edilicia', async () => {
      const actor = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:ALTAS',
        'TICKETS:VER_TODOS',
      ]);

      const alta = await httpPost<{ id: string; numero: string }>(
        `${baseUrl}/tickets`,
        {
          titulo: 'Gotera desde Tickets',
          tipoId: tipoEdiliciaId,
          prioridadId: prioridadMediaId,
          ubicacion: 'Aula 12',
        },
        bearer(actor.accessToken),
      );

      expect(alta.status).toBe(201);
      expect(alta.data.numero).toMatch(/^EDI-/);
      expect(await tenantClient.ticketEdilicia.count({ where: { ticketId: alta.data.id } })).toBe(
        0,
      );
      const fila = (
        await httpGet<ListReparacionesResponseDto>(
          `${baseUrl}/reparaciones?porPagina=100`,
          bearer(actor.accessToken),
        )
      ).data.items.find((r) => r.id === alta.data.id);
      expect(fila).toMatchObject({ titulo: 'Gotera desde Tickets', ubicacion: 'Aula 12' });
    });

    it('POST /tickets de PREVENTIVO → 422: lo genera solo el barrido', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:ALTAS', 'EDILICIA:LECTURA']);
      const preventivo = await tenantClient.tipoTicket.findUniqueOrThrow({
        where: { codigo: 'PREVENTIVO' },
      });
      await sembrarPermisosPorTipoE2e(
        tenantClient,
        new Map([[actor.usuarioId, ['EDILICIA:ALTAS']]]),
      );

      const alta = await httpPost<{ message: string }>(
        `${baseUrl}/tickets`,
        { titulo: 'X', tipoId: preventivo.id, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      expect(alta.status).toBe(422);
      expect(alta.data.message).toBe('El tipo de ticket "PREVENTIVO" no admite altas manuales.');
    });

    it('POST /reparaciones guarda la ubicación en el ticket y responde el id del ticket; el satélite nace sin ubicación', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:LECTURA', 'EDILICIA:ALTAS']);

      const alta = await httpPost<{ id: string; ticketId: string; ubicacion: string }>(
        `${baseUrl}/reparaciones`,
        { titulo: 'Puerta trabada', prioridadId: prioridadMediaId, ubicacion: 'Hall' },
        bearer(actor.accessToken),
      );

      expect(alta.status).toBe(201);
      expect(alta.data).toMatchObject({ id: alta.data.ticketId, ubicacion: 'Hall' });
      expect(
        await tenantClient.ticket.findUniqueOrThrow({ where: { id: alta.data.ticketId } }),
      ).toMatchObject({ ubicacion: 'Hall' });
      expect(
        await tenantClient.ticketEdilicia.findUniqueOrThrow({
          where: { ticketId: alta.data.ticketId },
        }),
      ).toMatchObject({ ubicacion: null });
    });
  });

  // ─── Avance sobre tareas_ticket (odd/tareas-con-tecnico, T3 y T8) ────────

  describe('el listado embebe las tareas del ticket y calcula el avance (odd/tareas-con-tecnico)', () => {
    /** Campos del shape de subtarea que espera `frontend/src/features/edilicia`. */
    const CAMPOS_SUBTAREA = [
      'completada',
      'completadaEn',
      'completadaPorId',
      'createdAt',
      'descripcion',
      'id',
      'orden',
      'ticketEdiliciaId',
      'updatedAt',
    ];

    /** Reparación con su ticket base asignado a `asignadoId` (el responsable). */
    async function crearReparacionAsignada(
      asignadoId: string,
    ): Promise<{ reparacionId: string; ticketId: string }> {
      const ticket = await tenantClient.ticket.create({
        data: {
          numero: `EDI-T3-${randomBytes(4).toString('hex')}`,
          titulo: 'Reparación con tareas',
          tipoId: tipoEdiliciaId,
          estadoId: estadoNuevoId,
          prioridadId: prioridadMediaId,
          cicloId: cicloActivoId,
          solicitanteId: '00000000-0000-4000-8000-000000000ccc',
          asignadoId,
          ubicacion: 'Aula 3',
        },
      });
      const satelite = await tenantClient.ticketEdilicia.create({ data: { ticketId: ticket.id } });
      return { reparacionId: satelite.id, ticketId: ticket.id };
    }

    /** La fila del ticket en el listado: desde odd/ticket-unificado se identifica por el ticket. */
    async function filaDelListado(
      token: string,
      ticketId: string,
    ): Promise<ReparacionListItemResponseDto | undefined> {
      const listado = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?porPagina=100`,
        bearer(token),
      );
      expect(listado.status).toBe(200);
      return listado.data.items.find((r) => r.id === ticketId);
    }

    it('el avance del listado sigue a las tareas creadas, completadas y borradas en /tickets/:id/tareas', async () => {
      const responsable = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { ticketId } = await crearReparacionAsignada(responsable.usuarioId);
      const auth = bearer(responsable.accessToken);
      const tareas = `${baseUrl}/tickets/${ticketId}/tareas`;

      const vacia = await filaDelListado(responsable.accessToken, ticketId);
      expect(vacia?.porcentajeAvance).toBe(0);
      expect(vacia?.subtareas).toEqual([]);
      // CA9: el campo se retiró del contrato junto con la columna.
      expect(vacia).not.toHaveProperty('personalAsignadoId');

      const primera = await httpPost<{ id: string }>(
        tareas,
        { descripcion: 'Cambiar la junta' },
        auth,
      );
      const segunda = await httpPost<{ id: string }>(tareas, { descripcion: 'Pintar' }, auth);
      expect([primera.status, segunda.status]).toEqual([201, 201]);

      const completar = await httpPost(`${tareas}/${primera.data.id}/completar`, {}, auth);
      expect(completar.status).toBe(200);
      const aMitad = await filaDelListado(responsable.accessToken, ticketId);
      expect(aMitad?.porcentajeAvance).toBe(50);
      expect(aMitad?.subtareas).toHaveLength(2);
      for (const subtarea of aMitad?.subtareas ?? []) {
        expect(Object.keys(subtarea).sort()).toEqual(CAMPOS_SUBTAREA);
      }
      expect(aMitad?.subtareas.find((t) => t.id === primera.data.id)).toMatchObject({
        completada: true,
        completadaPorId: responsable.usuarioId,
        ticketEdiliciaId: ticketId,
      });

      await httpPost(`${tareas}/${segunda.data.id}/completar`, {}, auth);
      expect((await filaDelListado(responsable.accessToken, ticketId))?.porcentajeAvance).toBe(100);

      await httpPost(`${tareas}/${primera.data.id}/descompletar`, {}, auth);
      expect((await filaDelListado(responsable.accessToken, ticketId))?.porcentajeAvance).toBe(50);

      const baja = await httpDelete(`${tareas}/${primera.data.id}`, auth);
      expect(baja.status).toBe(204);
      const final = await filaDelListado(responsable.accessToken, ticketId);
      expect(final?.subtareas.map((t) => t.id)).toEqual([segunda.data.id]);
      expect(final?.porcentajeAvance).toBe(100);
    });

    // odd/detalle-ticket-legible (S4-S5): editar una reparación que no se empezó a trabajar.
    it('PATCH /reparaciones/:id edita título y ubicación con EDILICIA:MODIFICACION, y deja de poder al completar una tarea', async () => {
      const responsable = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId } = await crearReparacionAsignada(responsable.usuarioId);
      const auth = bearer(responsable.accessToken);

      const editada = await httpPatch<ReparacionListItemResponseDto>(
        `${baseUrl}/reparaciones/${reparacionId}`,
        { titulo: 'Titulo corregido', ubicacion: 'Aula 7' },
        auth,
      );
      expect(editada.status).toBe(200);
      expect(editada.data).toMatchObject({
        id: ticketId,
        titulo: 'Titulo corregido',
        ubicacion: 'Aula 7',
      });
      // Una sola ubicación, la del ticket (odd/ticket-unificado, S1); el satélite no se escribe.
      expect(
        await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticketId } }),
      ).toMatchObject({ ubicacion: 'Aula 7' });
      expect(
        await tenantClient.ticketEdilicia.findUniqueOrThrow({ where: { id: reparacionId } }),
      ).toMatchObject({ ubicacion: null });
      const fila = await filaDelListado(responsable.accessToken, ticketId);
      expect(fila).toMatchObject({ titulo: 'Titulo corregido', ubicacion: 'Aula 7' });

      const tareas = `${baseUrl}/tickets/${ticketId}/tareas`;
      const tarea = await httpPost<{ id: string }>(tareas, { descripcion: 'Arrancar' }, auth);
      expect((await httpPost(`${tareas}/${tarea.data.id}/completar`, {}, auth)).status).toBe(200);

      const yaEmpezada = await httpPatch<{ message: string }>(
        `${baseUrl}/reparaciones/${reparacionId}`,
        { titulo: 'Otro' },
        auth,
      );
      expect(yaEmpezada.status).toBe(422);
      expect(yaEmpezada.data.message).toMatch(/solo ROOT/);
      expect((await filaDelListado(responsable.accessToken, ticketId))?.titulo).toBe(
        'Titulo corregido',
      );
    });

    it('PATCH /reparaciones/:id sin EDILICIA:MODIFICACION → 403, y la reparación no cambia', async () => {
      const lector = await crearActorConPermisos(['EDILICIA:LECTURA']);
      const { reparacionId, ticketId } = await crearReparacionAsignada(lector.usuarioId);

      const r = await httpPatch(
        `${baseUrl}/reparaciones/${reparacionId}`,
        { titulo: 'No deberia' },
        bearer(lector.accessToken),
      );

      expect(r.status).toBe(403);
      expect((await filaDelListado(lector.accessToken, ticketId))?.titulo).toBe(
        'Reparación con tareas',
      );
    });

    it('las rutas viejas de subtareas ya no existen (T8): 404 de Nest, sin tocar las tareas', async () => {
      const responsable = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId } = await crearReparacionAsignada(responsable.usuarioId);
      const auth = bearer(responsable.accessToken);
      const tarea = await tenantClient.tareaTicket.create({
        data: { ticketId, descripcion: 'Cambiar la junta' },
      });

      const crear = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/subtareas`,
        { descripcion: 'X' },
        auth,
      );
      const completar = await httpPost(
        `${baseUrl}/reparaciones/subtareas/${tarea.id}/completar`,
        {},
        auth,
      );
      const borrar = await httpDelete(`${baseUrl}/reparaciones/subtareas/${tarea.id}`, auth);

      expect([crear.status, completar.status, borrar.status]).toEqual([404, 404, 404]);
      const filas = await tenantClient.tareaTicket.findMany({ where: { ticketId } });
      expect(filas).toHaveLength(1);
      expect(filas[0]).toMatchObject({ completada: false, deletedAt: null });
    });
  });

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_reparE2E_.*_test$/);
  });
});
