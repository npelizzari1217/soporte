/**
 * reparaciones.e2e.spec.ts — WU5.8 (sdd/reparacion-bloqueada-por-compra),
 * CRÍTICO. Levanta la app REAL (Nest, `AccionesGuard` activo, sin mocks de
 * infraestructura) y pega por HTTP a `POST/DELETE .../compras`.
 *
 * Prueba el ÚNICO gap real que este cambio corrige: vincular una compra
 * exige DOS acciones (`EDILICIA:ALTAS` Y `COMPRAS:LECTURA`, decisión de
 * producto #2435). Un unit test del controller (`reparaciones.controller.spec.ts`)
 * mockea el guard fuera de la ecuación y solo lee metadata — un actor real
 * con `EDILICIA:ALTAS` y SIN `COMPRAS:LECTURA` tiene que recibir 403 de
 * verdad, no solo declarado en el decorador.
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
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import { sembrarPermisosPorTipoE2e } from '../../../tickets/test-helpers/permisos-por-tipo-e2e';

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
    await permisosRepo.setPermisos(usuario.id, clienteId, permisos);
    // Las rutas de tareas del ticket deciden con los permisos por tipo del tenant: los mismos que
    // estas celdas, traducidos por L11 (odd/permisos-por-tipo-ticket, T5a).
    await sembrarPermisosPorTipoE2e(tenantClient, new Map([[usuario.id, permisos]]));
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId, usuarioId: usuario.id };
  }

  /** Crea directo por Prisma un ticket_edilicia (reparación) sin pasar por CrearTicketEdilicioUseCase. */
  async function crearReparacion(): Promise<string> {
    const ticket = await tenantClient.ticket.create({
      data: {
        numero: `EDI-E2E-${randomBytes(4).toString('hex')}`,
        titulo: 'Reparación E2E',
        tipoId: tipoEdiliciaId,
        estadoId: estadoNuevoId,
        prioridadId: prioridadMediaId,
        cicloId: cicloActivoId,
        solicitanteId: '00000000-0000-4000-8000-000000000ccc',
      },
    });
    const ticketEdilicia = await tenantClient.ticketEdilicia.create({
      data: { ticketId: ticket.id, ubicacion: 'Edificio E2E' },
    });
    return ticketEdilicia.id;
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

  // ─── El gap que este cambio corrige ──────────────────────────────────────

  describe('POST /reparaciones/:reparacionId/compras — decisión de producto #2435 (AND)', () => {
    it('actor con SOLO EDILICIA:ALTAS (sin COMPRAS:LECTURA) → 403, no 201/404 (el candado vive en el backend, no en la UI)', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:ALTAS']);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();

      const { status } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    // Desde odd/permisos-por-tipo-ticket (T5b) la parte de Edilicia la decide el caso de uso con
    // los permisos por tipo del ticket base: sin verlo, 404; viéndolo sin ALTAS, 403.
    it('actor con SOLO COMPRAS:LECTURA (sin filas por tipo de Edilicia) → 404 de la reparación y no vincula', async () => {
      const actor = await crearActorConPermisos(['COMPRAS:LECTURA']);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();

      const { status } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      expect(
        await tenantClient.reparacionCompra.count({ where: { ticketEdiliciaId: reparacionId } }),
      ).toBe(0);
    });

    it('actor con COMPRAS:LECTURA que ve la reparación (EDILICIA:LECTURA) pero sin ALTAS sobre su tipo → 403 y no vincula', async () => {
      const actor = await crearActorConPermisos(['COMPRAS:LECTURA', 'EDILICIA:LECTURA']);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();

      const { status } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(
        await tenantClient.reparacionCompra.count({ where: { ticketEdiliciaId: reparacionId } }),
      ).toBe(0);
    });

    it('actor con AMBOS EDILICIA:ALTAS y COMPRAS:LECTURA → 201 y la compra aparece en comprasQueBloquean del listado', async () => {
      const actor = await crearActorConPermisos([
        'EDILICIA:ALTAS',
        'COMPRAS:LECTURA',
        'EDILICIA:LECTURA',
      ]);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();

      const vincular = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actor.accessToken),
      );
      expect(vincular.status).toBe(201);

      const listado = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones`,
        bearer(actor.accessToken),
      );
      const fila = listado.data.items.find((r) => r.id === reparacionId);
      expect(fila?.bloqueada).toBe(true);
      expect(fila?.comprasQueBloquean.map((c) => c.id)).toContain(compraId);
      // El tipo del ticket base viaja en la fila: el frontend gatea sus acciones por tipo (T6).
      expect(fila?.tipoId).toBe(tipoEdiliciaId);

      // El filtro de bloqueo se resuelve en el servidor (odd/reparaciones-paginadas, S1-S3):
      // la reparación aparece con BLOQUEADAS y no con NO_BLOQUEADAS, y el total acompaña.
      const bloqueadas = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?bloqueo=BLOQUEADAS&porPagina=100`,
        bearer(actor.accessToken),
      );
      const libres = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?bloqueo=NO_BLOQUEADAS&porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(bloqueadas.data.items.map((r) => r.id)).toContain(reparacionId);
      expect(bloqueadas.data.items.every((r) => r.bloqueada)).toBe(true);
      expect(bloqueadas.data.total).toBe(bloqueadas.data.items.length);
      expect(libres.data.items.map((r) => r.id)).not.toContain(reparacionId);
      expect(bloqueadas.data.total + libres.data.total).toBe(listado.data.total);
    });

    it('GET /reparaciones lista solo lo que el actor ve (odd/permisos-por-tipo-ticket, D5 e): sin VER_TODOS, sus reparaciones; la celda sin filas, nada', async () => {
      const actor = await crearActorConPermisos([]);
      await tenantClient.permisoTipoTicket.create({
        data: { usuarioId: actor.usuarioId, tipoId: tipoEdiliciaId, accion: 'LECTURA' },
      });
      const propia = await crearReparacion();
      const ajena = await crearReparacion();
      const satelite = await tenantClient.ticketEdilicia.findUniqueOrThrow({
        where: { id: propia },
      });
      await tenantClient.ticket.update({
        where: { id: satelite.ticketId },
        data: { asignadoId: actor.usuarioId },
      });

      const conFila = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(conFila.status).toBe(200);
      expect(conFila.data.items.map((r) => r.id)).toEqual([propia]);
      expect(conFila.data.total).toBe(1);
      expect(conFila.data.items.map((r) => r.id)).not.toContain(ajena);

      // La celda EDILICIA:LECTURA sin filas por tipo ya no abre el listado.
      const soloCelda = await crearActorConPermisos([], actor.clienteId);
      await permisosRepo.setPermisos(soloCelda.usuarioId, actor.clienteId, ['EDILICIA:LECTURA']);
      const { accessToken } = await login(
        (await masterClient.usuario.findUniqueOrThrow({ where: { id: soloCelda.usuarioId } }))
          .email,
      );
      const sinFilas = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones`,
        bearer(accessToken),
      );
      expect(sinFilas.status).toBe(200);
      expect(sinFilas.data).toMatchObject({ items: [], total: 0 });
    });

    it('GET /reparaciones rechaza con 400 una paginación o un filtro inválidos (odd/reparaciones-paginadas, S1)', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:LECTURA']);
      for (const query of ['porPagina=101', 'pagina=0', 'bloqueo=ALGUNAS']) {
        const respuesta = await httpGet<unknown>(
          `${baseUrl}/reparaciones?${query}`,
          bearer(actor.accessToken),
        );
        expect(respuesta.status).toBe(400);
      }
    });

    it('404 CompraNoEncontradaError: compraId inexistente, con ambos permisos y viendo la reparación', async () => {
      const actor = await crearActorConPermisos([
        'EDILICIA:ALTAS',
        'COMPRAS:LECTURA',
        'EDILICIA:LECTURA',
      ]);
      const reparacionId = await crearReparacion();

      const { status, data } = await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId: '00000000-0000-4000-8000-000000000fff' },
        bearer(actor.accessToken),
      );

      // El 404 tiene que ser el de la compra, no el de una reparación que el actor no ve.
      expect(status).toBe(404);
      expect(JSON.stringify(data)).toContain('00000000-0000-4000-8000-000000000fff');
    });
  });

  describe('DELETE /reparaciones/:reparacionId/compras/:compraId — NO exige COMPRAS:LECTURA', () => {
    // `EDILICIA:BORRADO` sigue siendo el permiso de la ruta (L21); el caso de uso exige además ver
    // la reparación (odd/permisos-por-tipo-ticket, D5 b), que acá da `EDILICIA:LECTURA` por L11.
    it('actor con EDILICIA:BORRADO que ve la reparación desvincula (204) sin COMPRAS:LECTURA (ver design/tasks)', async () => {
      // Vincula quien ve la reparación (EDILICIA:LECTURA) y tiene ALTAS sobre su tipo.
      const actorConAmbos = await crearActorConPermisos([
        'EDILICIA:ALTAS',
        'COMPRAS:LECTURA',
        'EDILICIA:LECTURA',
      ]);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();
      await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actorConAmbos.accessToken),
      );

      const actor = await crearActorConPermisos(
        ['EDILICIA:BORRADO', 'EDILICIA:LECTURA'],
        actorConAmbos.clienteId,
      );
      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(204);
      expect(
        await tenantClient.reparacionCompra.count({ where: { ticketEdiliciaId: reparacionId } }),
      ).toBe(0);
    });

    it('actor con SOLO EDILICIA:BORRADO, que no ve la reparación → 404 y el vínculo sigue', async () => {
      // Vincula quien ve la reparación (EDILICIA:LECTURA) y tiene ALTAS sobre su tipo.
      const actorConAmbos = await crearActorConPermisos([
        'EDILICIA:ALTAS',
        'COMPRAS:LECTURA',
        'EDILICIA:LECTURA',
      ]);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();
      await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actorConAmbos.accessToken),
      );

      const actor = await crearActorConPermisos(['EDILICIA:BORRADO'], actorConAmbos.clienteId);
      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
      expect(
        await tenantClient.reparacionCompra.count({ where: { ticketEdiliciaId: reparacionId } }),
      ).toBe(1);
    });

    it('actor sin EDILICIA:BORRADO → 403', async () => {
      // Vincula quien ve la reparación (EDILICIA:LECTURA) y tiene ALTAS sobre su tipo.
      const actorConAmbos = await crearActorConPermisos([
        'EDILICIA:ALTAS',
        'COMPRAS:LECTURA',
        'EDILICIA:LECTURA',
      ]);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();
      await httpPost(
        `${baseUrl}/reparaciones/${reparacionId}/compras`,
        { compraId },
        bearer(actorConAmbos.accessToken),
      );

      const actor = await crearActorConPermisos([], actorConAmbos.clienteId);
      const { status } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    it('404 VinculoNoEncontradoError: vínculo inexistente, con EDILICIA:BORRADO y viendo la reparación', async () => {
      const actor = await crearActorConPermisos(['EDILICIA:BORRADO', 'EDILICIA:LECTURA']);
      const reparacionId = await crearReparacion();
      const compraId = await crearCompra();

      const { status, data } = await httpDelete(
        `${baseUrl}/reparaciones/${reparacionId}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      // El 404 tiene que ser el del vínculo, no el de una reparación que el actor no ve.
      expect(status).toBe(404);
      expect(JSON.stringify(data)).toContain('No existe un vínculo');
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
        },
      });
      const satelite = await tenantClient.ticketEdilicia.create({
        data: { ticketId: ticket.id, ubicacion: 'Aula 3' },
      });
      return { reparacionId: satelite.id, ticketId: ticket.id };
    }

    async function filaDelListado(
      token: string,
      reparacionId: string,
    ): Promise<ReparacionListItemResponseDto | undefined> {
      const listado = await httpGet<ListReparacionesResponseDto>(
        `${baseUrl}/reparaciones?porPagina=100`,
        bearer(token),
      );
      expect(listado.status).toBe(200);
      return listado.data.items.find((r) => r.id === reparacionId);
    }

    it('el avance del listado sigue a las tareas creadas, completadas y borradas en /tickets/:id/tareas', async () => {
      const responsable = await crearActorConPermisos([
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'TICKETS:VER_TODOS',
      ]);
      const { reparacionId, ticketId } = await crearReparacionAsignada(responsable.usuarioId);
      const auth = bearer(responsable.accessToken);
      const tareas = `${baseUrl}/tickets/${ticketId}/tareas`;

      const vacia = await filaDelListado(responsable.accessToken, reparacionId);
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
      const aMitad = await filaDelListado(responsable.accessToken, reparacionId);
      expect(aMitad?.porcentajeAvance).toBe(50);
      expect(aMitad?.subtareas).toHaveLength(2);
      for (const subtarea of aMitad?.subtareas ?? []) {
        expect(Object.keys(subtarea).sort()).toEqual(CAMPOS_SUBTAREA);
      }
      expect(aMitad?.subtareas.find((t) => t.id === primera.data.id)).toMatchObject({
        completada: true,
        completadaPorId: responsable.usuarioId,
        ticketEdiliciaId: reparacionId,
      });

      await httpPost(`${tareas}/${segunda.data.id}/completar`, {}, auth);
      expect((await filaDelListado(responsable.accessToken, reparacionId))?.porcentajeAvance).toBe(
        100,
      );

      await httpPost(`${tareas}/${primera.data.id}/descompletar`, {}, auth);
      expect((await filaDelListado(responsable.accessToken, reparacionId))?.porcentajeAvance).toBe(
        50,
      );

      const baja = await httpDelete(`${tareas}/${primera.data.id}`, auth);
      expect(baja.status).toBe(204);
      const final = await filaDelListado(responsable.accessToken, reparacionId);
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
        id: reparacionId,
        titulo: 'Titulo corregido',
        ubicacion: 'Aula 7',
      });
      const fila = await filaDelListado(responsable.accessToken, reparacionId);
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
      expect((await filaDelListado(responsable.accessToken, reparacionId))?.titulo).toBe(
        'Titulo corregido',
      );
    });

    it('PATCH /reparaciones/:id sin EDILICIA:MODIFICACION → 403, y la reparación no cambia', async () => {
      const lector = await crearActorConPermisos(['EDILICIA:LECTURA']);
      const { reparacionId } = await crearReparacionAsignada(lector.usuarioId);

      const r = await httpPatch(
        `${baseUrl}/reparaciones/${reparacionId}`,
        { titulo: 'No deberia' },
        bearer(lector.accessToken),
      );

      expect(r.status).toBe(403);
      expect((await filaDelListado(lector.accessToken, reparacionId))?.titulo).toBe(
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
