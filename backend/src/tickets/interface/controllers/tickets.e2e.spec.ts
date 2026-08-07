/**
 * tickets.e2e.spec.ts — E2E real de punta a punta (HTTP → guards →
 * TicketsController → use cases → Prisma REAL) para el CRUD lectura/
 * creación de tickets (T4, T6, T7, T8 — PR6), transición de estados (T9,
 * T10, T12 — PR7), asignación/routing (T3, T14, T15 — PR8) y timeline
 * tipado/comentarios (T16-T19 — PR9).
 *
 * SEGURIDAD: provisiona UNA sola DB tenant efímera
 * (`soporte_prov_tickE2E_<rand>_test`, prefijo `soporte_prov_`, sufijo
 * `_test`) vía `PostgresAdminService` + `TenantMigrationRunnerAdapter`
 * (mismo patrón que `prisma-ticket-repository.aislamiento.integration.spec.ts`,
 * PR5), la siembra con `TenantSeederAdapter.seed()` (catálogos FIJOS reales:
 * 6 estados, 4 prioridades, 5 tipo_operacion, 4 tipos_ticket base — ADR-1),
 * y la borra en `afterAll`. NUNCA toca `soporte_master`, `soporte_tenant_test`
 * ni ninguna otra DB compartida — aislamiento total del resto de la suite.
 *
 * `master.clientes`/`roles`/`permisos`/`usuarios`/`membresias` (DB
 * `soporte_master_test`, compartida) se truncan en `beforeEach` (mismo
 * patrón que `auth.e2e.spec.ts`) — cliente/roles/usuarios/membresías se
 * recrean DENTRO de cada `it()`. La DB tenant física y sus catálogos
 * (estados/prioridades/tipos/ciclo activo) se siembran UNA vez en
 * `beforeAll` y persisten durante toda la suite (no los toca el truncate
 * de master).
 *
 * Ref spec: sdd/tickets-core/spec T4-T8, T16-T19. Ref design: matriz de
 * tests PR6/PR9. Tarea: T6.1-T6.6, T9.1-T9.4.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
import { TicketsModule } from '../../tickets.module';
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
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { PermisoEntity } from '../../../auth/domain/entities/permiso.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import {
  ArchivoResponseDto,
  ListTicketsResponseDto,
  OperacionResponseDto,
  TicketResponseDto,
} from '../dtos/ticket.dto';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_tickE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eTicketsSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que auth.e2e.spec.ts) ─────────

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
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
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

/** POST sin body (endpoints de routing — la PK compuesta viaja en la URL). */
async function httpPostNoBody<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpDelete(url: string, headers: Headers = {}): Promise<{ status: number }> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...headers },
  });
  return { status: res.status };
}

/** POST multipart/form-data (endpoints de adjuntos, PR10 — T20-T22). */
async function httpPostMultipart<T = unknown>(
  url: string,
  fileContent: Buffer,
  filename: string,
  mimeType: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const form = new FormData();
  form.append('archivo', new Blob([fileContent], { type: mimeType }), filename);
  const res = await fetch(url, { method: 'POST', headers, body: form });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, AuthModule, TicketsModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

describe('Tickets e2e (T4-T8, PR6)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let hashProvider: Argon2HashProvider;

  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let estadoNuevoId: string;
  let tipoSoporteId: string;
  let prioridadMediaId: string;
  let cicloActivoId: string;
  let storageDir: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    // STORAGE_DIR temporal (T20, T10.4) — SharedModule lee esta env var UNA
    // vez, al instanciar FILE_STORAGE (LocalDiskFileStorage) durante
    // `moduleRef.compile()`/`app.init()` más abajo. Aislado por corrida,
    // limpiado en `afterAll`.
    storageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soporte-tickets-e2e-storage-'));
    process.env.STORAGE_DIR = storageDir;

    // Provisiona + siembra la DB tenant efímera REAL (nunca toca DBs compartidas).
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    hashProvider = new Argon2HashProvider();

    const estadoNuevo = await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } });
    estadoNuevoId = estadoNuevo.id;
    const tipoSoporte = await tenantClient.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'SOPORTE' },
    });
    tipoSoporteId = tipoSoporte.id;
    const prioridadMedia = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadMediaId = prioridadMedia.id;

    const cicloActivo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'E2E Ciclo Activo',
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
    try {
      await fs.promises.rm(storageDir, { recursive: true, force: true });
    } catch {
      /* no-op */
    }
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, roles_permisos, usuarios, clientes, roles, permisos RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures (master) ────────────────────────────────────────────────

  async function createClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Tickets ${randomBytes(2).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createRoleConPermisos(
    codigo: string,
    permisoCodigos: string[],
  ): Promise<RoleEntity> {
    const permisos = permisoCodigos.map((c) =>
      PermisoEntity.create({ codigo: c, descripcion: null }),
    );
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos });

    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    for (const permiso of permisos) {
      await masterClient.permiso.upsert({
        where: { codigo: permiso.codigo },
        create: { id: permiso.id, codigo: permiso.codigo },
        update: {},
      });
      const permisoRow = await masterClient.permiso.findUniqueOrThrow({
        where: { codigo: permiso.codigo },
      });
      await masterClient.rolesPermisos.create({
        data: { rolId: role.id, permisoId: permisoRow.id },
      });
    }
    return role;
  }

  async function createUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_tickets_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'Tickets',
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

  /** Crea un tipo_ticket con codigo único (aísla la numeración por test). */
  async function createTipoTicketAislado(prefijo: string): Promise<string> {
    const tipo = await tenantClient.tipoTicket.create({
      data: {
        codigo: `${prefijo}${randomBytes(3).toString('hex').toUpperCase()}`,
        nombre: prefijo,
        activo: true,
      },
    });
    return tipo.id;
  }

  async function crearActorUsuario(): Promise<{ accessToken: string; clienteId: string }> {
    const cliente = await createClienteTenant();
    const role = await createRoleConPermisos('USUARIO', ['ticket:crear', 'ticket:comentar']);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, cliente.id, role.id);
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id };
  }

  // ─── T4/T5 — Creación + numeración ──────────────────────────────────────

  describe('POST /tickets (T4, T5)', () => {
    it('USUARIO con ticket:crear crea un ticket: estampa solicitante/estado NUEVO/ciclo, numeración correlativa por tipo', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('NUM');

      const first = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Primer ticket', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );
      const second = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Segundo ticket', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(first.data.estadoId).toBe(estadoNuevoId);
      expect(first.data.asignadoId).toBeNull();

      const seq1 = Number(first.data.numero.split('-')[2]);
      const seq2 = Number(second.data.numero.split('-')[2]);
      expect(seq2).toBe(seq1 + 1);
      expect(first.data.numero).not.toBe(second.data.numero);
    });

    it('tipoId inexistente en el catálogo del tenant → 422', async () => {
      const actor = await crearActorUsuario();

      const { status } = await httpPost(
        `${baseUrl}/tickets`,
        {
          titulo: 'X',
          tipoId: '01900000-0000-7000-8000-000000000099',
          prioridadId: prioridadMediaId,
        },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
    });

    it('sin Bearer token → 401', async () => {
      const { status } = await httpPost(`${baseUrl}/tickets`, {
        titulo: 'X',
        tipoId: tipoSoporteId,
        prioridadId: prioridadMediaId,
      });
      expect(status).toBe(401);
    });
  });

  // ─── T7 — Listado con filtros ────────────────────────────────────────────

  describe('GET /tickets (T7)', () => {
    it('lista los tickets creados por el actor, filtrados por tipo, con metadata de paginación', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('LIST');

      await httpPost(
        `${baseUrl}/tickets`,
        { titulo: 'Item 1', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );
      await httpPost(
        `${baseUrl}/tickets`,
        { titulo: 'Item 2', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      const { status, data } = await httpGet<ListTicketsResponseDto>(
        `${baseUrl}/tickets?tipo=${tipoId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.total).toBe(2);
      expect(data.items).toHaveLength(2);
      expect(data.pagina).toBe(1);
      expect(data.items.every((t) => t.tipoId === tipoId)).toBe(true);
    });

    it('B1/B6: filtra por busqueda (titulo) combinado con tipo — case-insensitive', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('SEARCH');

      await httpPost(
        `${baseUrl}/tickets`,
        { titulo: 'Falla de MONITOR en sala 2', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );
      await httpPost(
        `${baseUrl}/tickets`,
        { titulo: 'Alta de usuario nuevo', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      const { status, data } = await httpGet<ListTicketsResponseDto>(
        `${baseUrl}/tickets?tipo=${tipoId}&busqueda=monitor`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.total).toBe(1);
      expect(data.items[0].titulo).toContain('MONITOR');
    });
  });

  // ─── T6 — Scope de lectura por rol ────────────────────────────────────────

  describe('GET /tickets/:id (T6 — scope por rol)', () => {
    it('un USUARIO sin ticket:ver_todos NO puede ver el ticket de otro usuario del mismo tenant → 404', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const usuarioA = await createUsuario(`a-${randomBytes(2).toString('hex')}`);
      const usuarioB = await createUsuario(`b-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuarioA.id, cliente.id, roleUsuario.id);
      await createMembresia(usuarioB.id, cliente.id, roleUsuario.id);
      const loginA = await login(usuarioA.email);
      const loginB = await login(usuarioB.email);
      const tipoId = await createTipoTicketAislado('SCOPE');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket de A', tipoId, prioridadId: prioridadMediaId },
        bearer(loginA.accessToken),
      );

      const propio = await httpGet(
        `${baseUrl}/tickets/${created.data.id}`,
        bearer(loginA.accessToken),
      );
      const ajeno = await httpGet(
        `${baseUrl}/tickets/${created.data.id}`,
        bearer(loginB.accessToken),
      );

      expect(propio.status).toBe(200);
      expect(ajeno.status).toBe(404);
    });
  });

  // ─── T8 — Edición: permisos por rol ───────────────────────────────────────

  describe('PATCH /tickets/:id (T8 — permisos por rol)', () => {
    it('USUARIO crea un ticket pero NO puede editarlo (403); TECNICO con ticket:editar SÍ puede', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:editar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('EDIT');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Titulo original', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      const denegado = await httpPatch(
        `${baseUrl}/tickets/${created.data.id}`,
        { titulo: 'Intento USUARIO' },
        bearer(loginUsuario.accessToken),
      );
      expect(denegado.status).toBe(403);

      const permitido = await httpPatch<TicketResponseDto>(
        `${baseUrl}/tickets/${created.data.id}`,
        { titulo: 'Editado por TECNICO' },
        bearer(loginTecnico.accessToken),
      );
      expect(permitido.status).toBe(200);
      expect(permitido.data.titulo).toBe('Editado por TECNICO');
      expect(permitido.data.estadoId).toBe(estadoNuevoId); // el estado NUNCA cambia por esta vía (T9)
    });
  });

  // ─── T9/T10/T12/T13 — Transición de estados (PR7) ──────────────────────────

  describe('PATCH /tickets/:id/estado (T9, T10, T12)', () => {
    it('TECNICO con ticket:transicionar transiciona NUEVO→ASIGNADO válidamente; USUARIO sin el permiso recibe 403', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:transicionar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('TRANS');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket a transicionar', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      // USUARIO (solicitante, sin ticket:transicionar) → 403.
      const denegado = await httpPatch(
        `${baseUrl}/tickets/${created.data.id}/estado`,
        { nuevoEstadoCodigo: 'ASIGNADO' },
        bearer(loginUsuario.accessToken),
      );
      expect(denegado.status).toBe(403);

      // TECNICO con ticket:transicionar → transición válida.
      const permitido = await httpPatch<TicketResponseDto>(
        `${baseUrl}/tickets/${created.data.id}/estado`,
        { nuevoEstadoCodigo: 'ASIGNADO' },
        bearer(loginTecnico.accessToken),
      );
      expect(permitido.status).toBe(200);
      expect(permitido.data.estadoId).not.toBe(estadoNuevoId);
      expect(permitido.data.fechaCierre).toBeNull();
    });

    it('transición inválida (NUEVO→CERRADO, no es un arco del grafo) → 422', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:transicionar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('INV');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket inválido', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      const { status } = await httpPatch(
        `${baseUrl}/tickets/${created.data.id}/estado`,
        { nuevoEstadoCodigo: 'CERRADO' },
        bearer(loginTecnico.accessToken),
      );
      expect(status).toBe(422);
    });
  });

  // ─── T14/T15 — Asignación manual (PR8) ─────────────────────────────────────

  describe('PATCH /tickets/:id/asignar (T14, T15)', () => {
    it('TECNICO con ticket:asignar asigna a un agente elegible (usuario_tipos_ticket); USUARIO sin el permiso recibe 403', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:asignar',
      ]);
      const roleAgente = await createRoleConPermisos('AGENTE', ['ticket:crear', 'ticket:comentar']);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      const agente = await createUsuario(`age-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      await createMembresia(agente.id, cliente.id, roleAgente.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('ASIG');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket a asignar', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      // USUARIO (solicitante, sin ticket:asignar) → 403.
      const denegado = await httpPatch(
        `${baseUrl}/tickets/${created.data.id}/asignar`,
        { asignadoId: agente.id },
        bearer(loginUsuario.accessToken),
      );
      expect(denegado.status).toBe(403);

      // TECNICO con ticket:asignar, pero el agente aún NO es elegible (sin fila en usuario_tipos_ticket) → 422.
      const noElegible = await httpPatch(
        `${baseUrl}/tickets/${created.data.id}/asignar`,
        { asignadoId: agente.id },
        bearer(loginTecnico.accessToken),
      );
      expect(noElegible.status).toBe(422);

      // Habilita al agente para el tipo (routing, T3) — inserción directa (repo probado en spec dedicado).
      await tenantClient.usuarioTiposTicket.create({
        data: { usuarioId: agente.id, tipoTicketId: tipoId },
      });

      // TECNICO con ticket:asignar + agente elegible → asignación válida.
      const permitido = await httpPatch<TicketResponseDto>(
        `${baseUrl}/tickets/${created.data.id}/asignar`,
        { asignadoId: agente.id },
        bearer(loginTecnico.accessToken),
      );
      expect(permitido.status).toBe(200);
      expect(permitido.data.asignadoId).toBe(agente.id);
    });

    it('asignadoId inexistente en master.usuarios → 422 AsignadoInvalido', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:asignar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('AINV');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket asignado inválido', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      const { status } = await httpPatch(
        `${baseUrl}/tickets/${created.data.id}/asignar`,
        { asignadoId: '01900000-0000-7000-8000-000000000099' },
        bearer(loginTecnico.accessToken),
      );
      expect(status).toBe(422);
    });
  });

  // ─── T3 — Routing usuario↔tipo_ticket (PR8) ────────────────────────────────

  describe('POST|DELETE /routing/:usuarioId/:tipoTicketId (T3)', () => {
    it('ADMINISTRADOR con usuario:gestionar asocia y desasocia; USUARIO sin el permiso recibe 403', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleAdmin = await createRoleConPermisos('ADMINISTRADOR', ['usuario:gestionar']);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const admin = await createUsuario(`adm-${randomBytes(2).toString('hex')}`);
      const agente = await createUsuario(`age-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(admin.id, cliente.id, roleAdmin.id);
      const loginUsuario = await login(usuario.email);
      const loginAdmin = await login(admin.email);
      const tipoId = await createTipoTicketAislado('ROUTE');

      // USUARIO sin usuario:gestionar → 403.
      const denegado = await httpPostNoBody(
        `${baseUrl}/routing/${agente.id}/${tipoId}`,
        bearer(loginUsuario.accessToken),
      );
      expect(denegado.status).toBe(403);

      // ADMINISTRADOR asocia → 201, fila física creada.
      const asociado = await httpPostNoBody(
        `${baseUrl}/routing/${agente.id}/${tipoId}`,
        bearer(loginAdmin.accessToken),
      );
      expect(asociado.status).toBe(201);
      const filaCreada = await tenantClient.usuarioTiposTicket.findUnique({
        where: { usuarioId_tipoTicketId: { usuarioId: agente.id, tipoTicketId: tipoId } },
      });
      expect(filaCreada).not.toBeNull();

      // ADMINISTRADOR desasocia → 204, fila eliminada físicamente.
      const desasociado = await httpDelete(
        `${baseUrl}/routing/${agente.id}/${tipoId}`,
        bearer(loginAdmin.accessToken),
      );
      expect(desasociado.status).toBe(204);
      const filaEliminada = await tenantClient.usuarioTiposTicket.findUnique({
        where: { usuarioId_tipoTicketId: { usuarioId: agente.id, tipoTicketId: tipoId } },
      });
      expect(filaEliminada).toBeNull();
    });

    it('tipoTicketId inexistente en el catálogo del tenant → 422', async () => {
      const cliente = await createClienteTenant();
      const roleAdmin = await createRoleConPermisos('ADMINISTRADOR', ['usuario:gestionar']);
      const admin = await createUsuario(`adm-${randomBytes(2).toString('hex')}`);
      const agente = await createUsuario(`age-${randomBytes(2).toString('hex')}`);
      await createMembresia(admin.id, cliente.id, roleAdmin.id);
      const loginAdmin = await login(admin.email);

      const { status } = await httpPostNoBody(
        `${baseUrl}/routing/${agente.id}/01900000-0000-7000-8000-000000000099`,
        bearer(loginAdmin.accessToken),
      );
      expect(status).toBe(422);
    });
  });

  // ─── T16/T17/T18/T19 — Timeline/comentarios (PR9) ──────────────────────────

  describe('POST /tickets/:id/comentarios (T16, T17, T19)', () => {
    it('T16: USUARIO con ticket:comentar crea un comentario público visible en el timeline', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('COMPUB');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket a comentar', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      const { status, data } = await httpPost<OperacionResponseDto>(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Hola, ¿alguna novedad?', esInterno: false },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.ticketId).toBe(created.data.id);
      expect(data.esInterno).toBe(false);
      expect(data.descripcion).toBe('Hola, ¿alguna novedad?');
    });

    it('T17/T19: USUARIO (solo ticket:comentar) recibe 403 al intentar crear un comentario interno; TECNICO con ticket:observar sí puede', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:observar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('CMINTR');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket con nota interna', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      // T19: USUARIO (solicitante, con ticket:comentar pero SIN ticket:observar) → 403 en interno.
      const denegado = await httpPost(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Intento de nota interna', esInterno: true },
        bearer(loginUsuario.accessToken),
      );
      expect(denegado.status).toBe(403);

      // T17: TECNICO con ticket:observar → comentario interno permitido.
      const permitido = await httpPost<OperacionResponseDto>(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Nota técnica interna', esInterno: true },
        bearer(loginTecnico.accessToken),
      );
      expect(permitido.status).toBe(201);
      expect(permitido.data.esInterno).toBe(true);
    });

    it('T16: rechaza (422) un comentario público si el ticket ya está en estado terminal (CERRADO)', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:transicionar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('CMCERR');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket a cerrar', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      // NUEVO → ASIGNADO → EN_PROCESO → RESUELTO → CERRADO (arcos válidos, ADR-3).
      for (const nuevoEstadoCodigo of ['ASIGNADO', 'EN_PROCESO', 'RESUELTO', 'CERRADO']) {
        const transicion = await httpPatch(
          `${baseUrl}/tickets/${created.data.id}/estado`,
          { nuevoEstadoCodigo },
          bearer(loginTecnico.accessToken),
        );
        expect(transicion.status).toBe(200);
      }

      const { status } = await httpPost(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Comentario tardío', esInterno: false },
        bearer(loginUsuario.accessToken),
      );
      expect(status).toBe(422);
    });
  });

  describe('GET /tickets/:id/timeline (T18)', () => {
    it('un USUARIO/solicitante sin ticket:observar NUNCA ve las operaciones internas; TECNICO con ticket:observar ve todo', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const roleTecnico = await createRoleConPermisos('TECNICO', [
        'ticket:crear',
        'ticket:comentar',
        'ticket:ver_todos',
        'ticket:observar',
      ]);
      const usuario = await createUsuario(`usr-${randomBytes(2).toString('hex')}`);
      const tecnico = await createUsuario(`tec-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuario.id, cliente.id, roleUsuario.id);
      await createMembresia(tecnico.id, cliente.id, roleTecnico.id);
      const loginUsuario = await login(usuario.email);
      const loginTecnico = await login(tecnico.email);
      const tipoId = await createTipoTicketAislado('TMLINE');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket con timeline mixto', tipoId, prioridadId: prioridadMediaId },
        bearer(loginUsuario.accessToken),
      );

      await httpPost(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Comentario público', esInterno: false },
        bearer(loginUsuario.accessToken),
      );
      await httpPost(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Nota interna', esInterno: true },
        bearer(loginTecnico.accessToken),
      );

      const comoUsuario = await httpGet<OperacionResponseDto[]>(
        `${baseUrl}/tickets/${created.data.id}/timeline`,
        bearer(loginUsuario.accessToken),
      );
      const comoTecnico = await httpGet<OperacionResponseDto[]>(
        `${baseUrl}/tickets/${created.data.id}/timeline`,
        bearer(loginTecnico.accessToken),
      );

      expect(comoUsuario.status).toBe(200);
      // Apertura (CAMBIO_ESTADO, T4) + comentario público — la interna queda excluida.
      expect(comoUsuario.data.every((op) => !op.esInterno)).toBe(true);
      expect(comoUsuario.data.some((op) => op.descripcion === 'Comentario público')).toBe(true);
      expect(comoUsuario.data.some((op) => op.descripcion === 'Nota interna')).toBe(false);

      expect(comoTecnico.status).toBe(200);
      expect(comoTecnico.data.some((op) => op.descripcion === 'Nota interna')).toBe(true);
      expect(comoTecnico.data.length).toBeGreaterThan(comoUsuario.data.length);
    });

    it('un actor ajeno sin ticket:ver_todos recibe 404 al pedir el timeline de un ticket que no le pertenece', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const usuarioA = await createUsuario(`a-${randomBytes(2).toString('hex')}`);
      const usuarioB = await createUsuario(`b-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuarioA.id, cliente.id, roleUsuario.id);
      await createMembresia(usuarioB.id, cliente.id, roleUsuario.id);
      const loginA = await login(usuarioA.email);
      const loginB = await login(usuarioB.email);
      const tipoId = await createTipoTicketAislado('TMAJEN');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket de A', tipoId, prioridadId: prioridadMediaId },
        bearer(loginA.accessToken),
      );

      const { status } = await httpGet(
        `${baseUrl}/tickets/${created.data.id}/timeline`,
        bearer(loginB.accessToken),
      );
      expect(status).toBe(404);
    });
  });

  // ─── T20-T22 — Adjuntos (PR10) ──────────────────────────────────────────

  describe('POST /tickets/:id/adjuntos, POST /operaciones/:id/adjuntos (T20-T22)', () => {
    it('T20-T22: el solicitante sube un adjunto a su propio ticket — binario real en disco (LocalDiskFileStorage), metadata en `archivos`, join en `archivos_ticket`, y operación ADJUNTO en el timeline', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('ADJ');
      const contenido = Buffer.from('contenido-real-del-archivo-e2e');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket con adjunto', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      const { status, data } = await httpPostMultipart<ArchivoResponseDto>(
        `${baseUrl}/tickets/${created.data.id}/adjuntos`,
        contenido,
        'evidencia.png',
        'image/png',
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.nombreOriginal).toBe('evidencia.png');
      expect(data.mimeType).toBe('image/png');
      expect(data.tamanoBytes).toBe(String(contenido.byteLength));

      // Binario REAL en disco (T20 — nunca en DB).
      const persistido = await fs.promises.readFile(path.join(storageDir, data.storageKey));
      expect(persistido.equals(contenido)).toBe(true);

      // Metadata en `archivos` + join en `archivos_ticket` (T22).
      const filaArchivo = await tenantClient.archivo.findUnique({ where: { id: data.id } });
      expect(filaArchivo).not.toBeNull();
      const filaJoin = await tenantClient.archivoTicket.findUnique({
        where: { archivoId_ticketId: { archivoId: data.id, ticketId: created.data.id } },
      });
      expect(filaJoin).not.toBeNull();

      // Operación ADJUNTO registrada en el timeline (T22).
      const timeline = await httpGet<OperacionResponseDto[]>(
        `${baseUrl}/tickets/${created.data.id}/timeline`,
        bearer(actor.accessToken),
      );
      expect(timeline.data.some((op) => op.descripcion === 'evidencia.png')).toBe(true);
    });

    it('T21: mime fuera de la whitelist → 422; tamano_bytes=0 → 422', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('MIME');
      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket adjunto inválido', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );

      const mimeInvalido = await httpPostMultipart(
        `${baseUrl}/tickets/${created.data.id}/adjuntos`,
        Buffer.from('binario-ejecutable'),
        'virus.exe',
        'application/x-msdownload',
        bearer(actor.accessToken),
      );
      expect(mimeInvalido.status).toBe(422);

      const vacio = await httpPostMultipart(
        `${baseUrl}/tickets/${created.data.id}/adjuntos`,
        Buffer.alloc(0),
        'vacio.pdf',
        'application/pdf',
        bearer(actor.accessToken),
      );
      expect(vacio.status).toBe(422);
    });

    it('ADR-2: un actor ajeno sin acceso al ticket (ni solicitante ni ticket:ver_todos/editar) recibe 404 al intentar adjuntar', async () => {
      const cliente = await createClienteTenant();
      const roleUsuario = await createRoleConPermisos('USUARIO', [
        'ticket:crear',
        'ticket:comentar',
      ]);
      const usuarioA = await createUsuario(`a-${randomBytes(2).toString('hex')}`);
      const usuarioB = await createUsuario(`b-${randomBytes(2).toString('hex')}`);
      await createMembresia(usuarioA.id, cliente.id, roleUsuario.id);
      await createMembresia(usuarioB.id, cliente.id, roleUsuario.id);
      const loginA = await login(usuarioA.email);
      const loginB = await login(usuarioB.email);
      const tipoId = await createTipoTicketAislado('AJACC');

      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket de A', tipoId, prioridadId: prioridadMediaId },
        bearer(loginA.accessToken),
      );

      const { status } = await httpPostMultipart(
        `${baseUrl}/tickets/${created.data.id}/adjuntos`,
        Buffer.from('x'),
        'x.pdf',
        'application/pdf',
        bearer(loginB.accessToken),
      );
      expect(status).toBe(404);
    });

    it('T22: adjunta a una operación existente (comentario) — join en `archivos_operacion`, y registra una operación ADJUNTO nueva adicional en el timeline', async () => {
      const actor = await crearActorUsuario();
      const tipoId = await createTipoTicketAislado('AJOPX');
      const created = await httpPost<TicketResponseDto>(
        `${baseUrl}/tickets`,
        { titulo: 'Ticket con comentario', tipoId, prioridadId: prioridadMediaId },
        bearer(actor.accessToken),
      );
      const comentario = await httpPost<OperacionResponseDto>(
        `${baseUrl}/tickets/${created.data.id}/comentarios`,
        { texto: 'Comentario con evidencia' },
        bearer(actor.accessToken),
      );

      const { status, data } = await httpPostMultipart<ArchivoResponseDto>(
        `${baseUrl}/operaciones/${comentario.data.id}/adjuntos`,
        Buffer.from('evidencia-del-comentario'),
        'evidencia2.pdf',
        'application/pdf',
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      const filaJoin = await tenantClient.archivoOperacion.findUnique({
        where: { archivoId_operacionId: { archivoId: data.id, operacionId: comentario.data.id } },
      });
      expect(filaJoin).not.toBeNull();

      const timeline = await httpGet<OperacionResponseDto[]>(
        `${baseUrl}/tickets/${created.data.id}/timeline`,
        bearer(actor.accessToken),
      );
      // Apertura + comentario + ADJUNTO nueva (T22 — se registra SIEMPRE, incluso
      // adjuntando a una operación existente).
      expect(timeline.data.some((op) => op.descripcion === 'evidencia2.pdf')).toBe(true);
    });
  });

  // ─── T2 — Catálogos CRUD editables (PR11) ──────────────────────────────────

  describe('POST|PATCH /catalogos/tipos-ticket, /catalogos/prioridades (T2, PR11)', () => {
    async function crearActorAdmin(): Promise<{ accessToken: string; clienteId: string }> {
      const cliente = await createClienteTenant();
      const roleAdmin = await createRoleConPermisos('ADMINISTRADOR', ['catalogo:gestionar']);
      const admin = await createUsuario(`cat-adm-${randomBytes(2).toString('hex')}`);
      await createMembresia(admin.id, cliente.id, roleAdmin.id);
      const { accessToken } = await login(admin.email);
      return { accessToken, clienteId: cliente.id };
    }

    it('ADMINISTRADOR con catalogo:gestionar crea y edita un tipo_ticket y una prioridad', async () => {
      const admin = await crearActorAdmin();
      const codigo = `CAT${randomBytes(3).toString('hex').toUpperCase()}`;

      const creado = await httpPost<{
        id: string;
        codigo: string;
        nombre: string;
        activo: boolean;
      }>(
        `${baseUrl}/catalogos/tipos-ticket`,
        { codigo, nombre: 'Categoría E2E' },
        bearer(admin.accessToken),
      );
      expect(creado.status).toBe(201);
      expect(creado.data.codigo).toBe(codigo);
      expect(creado.data.activo).toBe(true);

      const editado = await httpPatch<{ nombre: string }>(
        `${baseUrl}/catalogos/tipos-ticket/${creado.data.id}`,
        { nombre: 'Categoría E2E Editada' },
        bearer(admin.accessToken),
      );
      expect(editado.status).toBe(200);
      expect(editado.data.nombre).toBe('Categoría E2E Editada');

      const desactivado = await httpPatch<{ activo: boolean }>(
        `${baseUrl}/catalogos/tipos-ticket/${creado.data.id}/estado`,
        { activo: false },
        bearer(admin.accessToken),
      );
      expect(desactivado.status).toBe(200);
      expect(desactivado.data.activo).toBe(false);

      const prioridadCreada = await httpPost<{ id: string; codigo: string; orden: number }>(
        `${baseUrl}/catalogos/prioridades`,
        {
          codigo: `PRI${randomBytes(3).toString('hex').toUpperCase()}`,
          nombre: 'Prioridad E2E',
          orden: 15,
        },
        bearer(admin.accessToken),
      );
      expect(prioridadCreada.status).toBe(201);
      expect(prioridadCreada.data.orden).toBe(15);

      const prioridadEditada = await httpPatch<{ orden: number }>(
        `${baseUrl}/catalogos/prioridades/${prioridadCreada.data.id}`,
        { orden: 99 },
        bearer(admin.accessToken),
      );
      expect(prioridadEditada.status).toBe(200);
      expect(prioridadEditada.data.orden).toBe(99);
    });

    it('USUARIO sin catalogo:gestionar recibe 403 al intentar crear un tipo_ticket', async () => {
      const actor = await crearActorUsuario();

      const { status } = await httpPost(
        `${baseUrl}/catalogos/tipos-ticket`,
        { codigo: `NOPERM${randomBytes(2).toString('hex').toUpperCase()}`, nombre: 'Sin permiso' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    it('prefijo derivado en colisión con un tipo_ticket ACTIVO existente → 422 (ADR-4)', async () => {
      const admin = await crearActorAdmin();
      // "SOPORTE" (seed real) deriva el prefijo fijo "SOP" (mapa base). Un
      // codigo custom "SOPXYZ" (no está en el mapa base) deriva sus primeras
      // 3 letras alfanuméricas → también "SOP" → colisión real (mismo bug
      // visto en e2e de PR8/PR9/PR10, ahora cerrado en el punto de alta).
      const codigoColisionante = `SOP${randomBytes(2).toString('hex').toUpperCase()}`;

      const { status, data } = await httpPost<{ message: string }>(
        `${baseUrl}/catalogos/tipos-ticket`,
        { codigo: codigoColisionante, nombre: 'Colisión de prefijo' },
        bearer(admin.accessToken),
      );

      expect(status).toBe(422);
      expect(data.message).toContain('SOP');
    });
  });

  // ─── Sanity ───────────────────────────────────────────────────────────────

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_.*_test$/);
  });
});
