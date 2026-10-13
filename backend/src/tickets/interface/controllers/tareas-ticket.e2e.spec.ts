/**
 * tareas-ticket.e2e.spec.ts — odd/tareas-con-tecnico, T3. Levanta la app REAL (Nest, guards
 * activos, sin mocks de infraestructura) y pega por HTTP a `/tickets/:id/tareas`.
 *
 * Cubre el CRUD, la matriz de permisos de la decisión del punto 12 (CA3, CA4) a nivel HTTP, el
 * 409 del doble completado, el 422 del técnico no elegible, el historial de cada acción y el
 * aislamiento entre clientes: un usuario del cliente B nunca ve ni toca las tareas del cliente A.
 * T3b suma la visibilidad por tarea (CA10): el técnico de una tarea activa ve el ticket en el
 * detalle, en el listado y en sus tareas, y deja de verlo al quitarlo o al borrar la tarea.
 *
 * Dos inquilinos efímeros (A y B), mismo patrón que `reparaciones.e2e.spec.ts`: provisión por
 * archivo, `usarLockMasterTest()` sobre la master de test compartida, y en el cierre
 * `app.close()` → limpieza de filas → `onModuleDestroy()` → `dropDatabase`.
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
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { TareaTicketResponseDto, TareasTicketResponseDto } from '../dtos/tarea-ticket.dto';
import {
  ListTicketsResponseDto,
  OperacionResponseDto,
  TicketResponseDto,
} from '../dtos/ticket.dto';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const TENANT_A = `soporte_prov_tareasA_${sufijo}_test`;
const TENANT_B = `soporte_prov_tareasB_${sufijo}_test`;
const PLAINTEXT_PASSWORD = 'E2eTareasSecret!123';
const SOLICITANTE_ID = '00000000-0000-4000-8000-000000000ccc';

type Headers = Record<string, string>;

async function http<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const headers: Headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

@Module({ imports: [SharedModule, AuthModule, TicketsModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

/** Datos fijos de un inquilino: catálogos sembrados y el ciclo que crea el spec. */
interface Inquilino {
  dbName: string;
  client: InstanceType<typeof TenantPrismaClient>;
  estadoNuevoId: string;
  prioridadMediaId: string;
  cicloId: string;
}

interface Actor {
  id: string;
  token: string;
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Tareas del ticket e2e — /tickets/:id/tareas (odd/tareas-con-tecnico T3)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  const hashProvider = new Argon2HashProvider();
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let a: Inquilino;
  let b: Inquilino;

  async function provisionar(dbName: string): Promise<Inquilino> {
    await admin.createDatabase(dbName);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(dbName);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(dbName);
    const client = prismaService.getTenantClient(dbName);
    const estado = await client.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } });
    const prioridad = await client.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } });
    const ciclo = await client.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000002',
        nombre: 'E2E Ciclo Tareas',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    return {
      dbName,
      client,
      estadoNuevoId: estado.id,
      prioridadMediaId: prioridad.id,
      cicloId: ciclo.id,
    };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);

    a = await provisionar(TENANT_A);
    b = await provisionar(TENANT_B);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 120_000);

  afterAll(async () => {
    // Orden CRÍTICO: app.close() → filas → onModuleDestroy() → dropDatabase. Al revés, el DROP
    // falla en silencio con las conexiones del pool abiertas.
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    for (const inquilino of [a, b]) {
      if (!inquilino) continue;
      try {
        await inquilino.client.$executeRawUnsafe(
          'TRUNCATE TABLE operaciones_ticket, tareas_ticket, tickets, ciclos_cliente CASCADE',
        );
      } catch {
        /* no-op */
      }
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(TENANT_A);
    await admin.dropDatabase(TENANT_B);
  }, 60_000);

  const roles = new Map<string, RoleEntity>();

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    roles.clear();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────

  async function crearCliente(dbName: string): Promise<string> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Tareas ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente.id;
  }

  async function rol(codigo: string): Promise<RoleEntity> {
    const existente = roles.get(codigo);
    if (existente) return existente;
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    roles.set(codigo, role);
    return role;
  }

  /** Usuario con una membresía de `rolCodigo` en el cliente y exactamente esas celdas. */
  async function actor(
    clienteId: string,
    rolCodigo: string,
    permisos: string[],
    nombre = 'E2E',
  ): Promise<Actor> {
    const role = await rol(rolCodigo);
    const usuario = UsuarioEntity.create({
      email: `e2e_tareas_${randomBytes(4).toString('hex')}@test.local`,
      nombre,
      apellido: 'Tareas',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, clienteId, permisos);
    const { data } = await http<{ accessToken: string }>('POST', `${baseUrl}/auth/login`, '', {
      email: usuario.email,
      password: PLAINTEXT_PASSWORD,
    });
    return { id: usuario.id, token: data.accessToken };
  }

  async function crearTicket(inquilino: Inquilino, asignadoId: string | null): Promise<string> {
    const tipo = await inquilino.client.tipoTicket.create({
      data: {
        codigo: `TAR${randomBytes(3).toString('hex').toUpperCase()}`,
        nombre: 'Tareas E2E',
        activo: true,
        modulo: 'TICKETS',
      },
    });
    const ticket = await inquilino.client.ticket.create({
      data: {
        numero: `TAR-${randomBytes(4).toString('hex')}`,
        titulo: 'Ticket con tareas',
        tipoId: tipo.id,
        estadoId: inquilino.estadoNuevoId,
        prioridadId: inquilino.prioridadMediaId,
        cicloId: inquilino.cicloId,
        solicitanteId: SOLICITANTE_ID,
        asignadoId,
      },
    });
    return ticket.id;
  }

  /**
   * El escenario del cliente A: un ticket con su responsable, un administrador, dos técnicos
   * elegibles (TECNICO con el módulo TICKETS) y un USUARIO, que no es elegible.
   */
  async function escenario() {
    const clienteA = await crearCliente(TENANT_A);
    const responsable = await actor(
      clienteA,
      'TECNICO',
      ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:MODIFICACION'],
      'Responsable',
    );
    const administrador = await actor(clienteA, 'ADMINISTRADOR', [], 'Admin');
    // Sin VER_TODOS: ve el ticket solo mientras tenga una tarea activa (CA10) y la completa (CA4).
    const tecnico = await actor(clienteA, 'TECNICO', ['TICKETS:LECTURA'], 'Tecnico');
    // Ve el ticket y tiene el permiso del módulo, pero no es el responsable (CA3).
    const otroTecnico = await actor(
      clienteA,
      'TECNICO',
      ['TICKETS:LECTURA', 'TICKETS:VER_TODOS', 'TICKETS:MODIFICACION'],
      'Otro',
    );
    const usuario = await actor(clienteA, 'USUARIO', ['TICKETS:LECTURA', 'TICKETS:ALTAS']);
    const ticketId = await crearTicket(a, responsable.id);
    return { clienteA, responsable, administrador, tecnico, otroTecnico, usuario, ticketId };
  }

  function rutas(ticketId: string) {
    const base = `${baseUrl}/tickets/${ticketId}/tareas`;
    return {
      base,
      elegibles: `${base}/tecnicos-elegibles`,
      tecnico: (tareaId: string) => `${base}/${tareaId}/tecnico`,
      completar: (tareaId: string) => `${base}/${tareaId}/completar`,
      descompletar: (tareaId: string) => `${base}/${tareaId}/descompletar`,
      tarea: (tareaId: string) => `${base}/${tareaId}`,
    };
  }

  // ─── CRUD + historial ──────────────────────────────────────────────────

  it('CRUD completo: crear, asignar, completar, descompletar y borrar, con avance e historial', async () => {
    const { responsable, administrador, tecnico, ticketId } = await escenario();
    const r = rutas(ticketId);

    const primera = await http<TareaTicketResponseDto>('POST', r.base, responsable.token, {
      descripcion: 'Tender el cable',
    });
    expect(primera.status).toBe(201);
    expect(primera.data).toMatchObject({
      ticketId,
      descripcion: 'Tender el cable',
      orden: 0,
      tecnicoId: null,
      tecnicoNombre: null,
      completada: false,
      completadaEn: null,
      completadaPorId: null,
    });
    const segunda = await http<TareaTicketResponseDto>('POST', r.base, responsable.token, {
      descripcion: 'Instalar la impresora',
    });
    expect(segunda.data.orden).toBe(1);

    const elegibles = await http<{ id: string }[]>('GET', r.elegibles, responsable.token);
    expect(elegibles.status).toBe(200);
    const idsElegibles = elegibles.data.map((t) => t.id);
    expect(idsElegibles).toContain(tecnico.id);
    expect(idsElegibles).not.toContain(administrador.id);

    const asignada = await http<TareaTicketResponseDto>(
      'PATCH',
      r.tecnico(primera.data.id),
      responsable.token,
      { tecnicoId: tecnico.id },
    );
    expect(asignada.status).toBe(200);
    expect(asignada.data).toMatchObject({
      tecnicoId: tecnico.id,
      tecnicoNombre: 'Tecnico',
      tecnicoApellido: 'Tareas',
    });

    // El técnico completa su tarea aunque no vea el ticket: el crédito es suyo (CA4).
    const completada = await http<TareaTicketResponseDto>(
      'POST',
      r.completar(primera.data.id),
      tecnico.token,
    );
    expect(completada.status).toBe(200);
    expect(completada.data).toMatchObject({
      completada: true,
      completadaPorId: tecnico.id,
      completadaPorNombre: 'Tecnico',
    });
    expect(completada.data.completadaEn).not.toBeNull();

    // 409: completarla de nuevo pisaría el crédito.
    const doble = await http('POST', r.completar(primera.data.id), responsable.token);
    expect(doble.status).toBe(409);

    const conAvance = await http<TareasTicketResponseDto>('GET', r.base, responsable.token);
    expect(conAvance.status).toBe(200);
    expect(conAvance.data.avance).toEqual({ total: 2, completadas: 1, porcentaje: 50 });
    expect(conAvance.data.items.map((t) => t.descripcion)).toEqual([
      'Tender el cable',
      'Instalar la impresora',
    ]);

    const descompletada = await http<TareaTicketResponseDto>(
      'POST',
      r.descompletar(primera.data.id),
      responsable.token,
    );
    expect(descompletada.status).toBe(200);
    expect(descompletada.data).toMatchObject({
      completada: false,
      completadaEn: null,
      completadaPorId: null,
    });
    const dobleDescompletar = await http(
      'POST',
      r.descompletar(primera.data.id),
      responsable.token,
    );
    expect(dobleDescompletar.status).toBe(409);

    const borrada = await http('DELETE', r.tarea(segunda.data.id), responsable.token);
    expect(borrada.status).toBe(204);
    const yaBorrada = await http('DELETE', r.tarea(segunda.data.id), responsable.token);
    expect(yaBorrada.status).toBe(404);

    const final = await http<TareasTicketResponseDto>('GET', r.base, administrador.token);
    expect(final.data.items.map((t) => t.id)).toEqual([primera.data.id]);
    expect(final.data.avance).toEqual({ total: 1, completadas: 0, porcentaje: 0 });

    // Cada acción quedó en el historial del ticket, con su autor (CA8).
    const tipos = await a.client.tipoOperacion.findMany({
      where: { codigo: { in: Object.values(TIPO_OPERACION_TAREA) } },
    });
    const codigoPorId = new Map(tipos.map((t) => [t.id, t.codigo]));
    const timeline = await http<OperacionResponseDto[]>(
      'GET',
      `${baseUrl}/tickets/${ticketId}/timeline`,
      administrador.token,
    );
    expect(timeline.status).toBe(200);
    const deTareas = timeline.data
      .filter((op) => codigoPorId.has(op.tipoOperacionId))
      .map((op) => ({
        codigo: codigoPorId.get(op.tipoOperacionId),
        autorId: op.autorId,
        tareaId: op.metadata?.tarea_id,
      }));
    expect(deTareas).toEqual([
      { codigo: TIPO_OPERACION_TAREA.CREADA, autorId: responsable.id, tareaId: primera.data.id },
      { codigo: TIPO_OPERACION_TAREA.CREADA, autorId: responsable.id, tareaId: segunda.data.id },
      { codigo: TIPO_OPERACION_TAREA.ASIGNADA, autorId: responsable.id, tareaId: primera.data.id },
      { codigo: TIPO_OPERACION_TAREA.COMPLETADA, autorId: tecnico.id, tareaId: primera.data.id },
      {
        codigo: TIPO_OPERACION_TAREA.DESCOMPLETADA,
        autorId: responsable.id,
        tareaId: primera.data.id,
      },
      { codigo: TIPO_OPERACION_TAREA.ELIMINADA, autorId: responsable.id, tareaId: segunda.data.id },
    ]);
  });

  it('PATCH tecnico con null quita el técnico', async () => {
    const { responsable, tecnico, ticketId } = await escenario();
    const r = rutas(ticketId);
    const { data: tarea } = await http<TareaTicketResponseDto>('POST', r.base, responsable.token, {
      descripcion: 'Formatear la PC',
    });
    await http('PATCH', r.tecnico(tarea.id), responsable.token, { tecnicoId: tecnico.id });

    const quitada = await http<TareaTicketResponseDto>(
      'PATCH',
      r.tecnico(tarea.id),
      responsable.token,
      { tecnicoId: null },
    );

    expect(quitada.status).toBe(200);
    expect(quitada.data.tecnicoId).toBeNull();
  });

  it('valida el body: descripción en blanco y tecnicoId ausente son 400', async () => {
    const { responsable, ticketId } = await escenario();
    const r = rutas(ticketId);

    const enBlanco = await http('POST', r.base, responsable.token, { descripcion: '   ' });
    expect(enBlanco.status).toBe(400);

    const { data: tarea } = await http<TareaTicketResponseDto>('POST', r.base, responsable.token, {
      descripcion: 'Cablear',
    });
    const sinTecnico = await http('PATCH', r.tecnico(tarea.id), responsable.token, {});
    expect(sinTecnico.status).toBe(400);
  });

  // ─── Matriz de permisos (CA3, CA4) ─────────────────────────────────────

  describe('matriz de permisos', () => {
    it('el ADMINISTRADOR gestiona tareas de un ticket que no le está asignado', async () => {
      const { administrador, tecnico, ticketId } = await escenario();
      const r = rutas(ticketId);

      const creada = await http<TareaTicketResponseDto>('POST', r.base, administrador.token, {
        descripcion: 'Revisar el tablero',
      });
      expect(creada.status).toBe(201);
      const asignada = await http('PATCH', r.tecnico(creada.data.id), administrador.token, {
        tecnicoId: tecnico.id,
      });
      expect(asignada.status).toBe(200);
      expect((await http('POST', r.completar(creada.data.id), administrador.token)).status).toBe(
        200,
      );
      expect((await http('DELETE', r.tarea(creada.data.id), administrador.token)).status).toBe(204);
    });

    it('un técnico que no es el responsable no crea, no asigna, no borra ni completa la tarea de otro: 403', async () => {
      const { responsable, tecnico, otroTecnico, ticketId } = await escenario();
      const r = rutas(ticketId);
      const { data: tarea } = await http<TareaTicketResponseDto>(
        'POST',
        r.base,
        responsable.token,
        { descripcion: 'Tarea del técnico' },
      );
      await http('PATCH', r.tecnico(tarea.id), responsable.token, { tecnicoId: tecnico.id });

      expect((await http('POST', r.base, otroTecnico.token, { descripcion: 'X' })).status).toBe(
        403,
      );
      expect(
        (await http('PATCH', r.tecnico(tarea.id), otroTecnico.token, { tecnicoId: otroTecnico.id }))
          .status,
      ).toBe(403);
      expect((await http('POST', r.completar(tarea.id), otroTecnico.token)).status).toBe(403);
      expect((await http('DELETE', r.tarea(tarea.id), otroTecnico.token)).status).toBe(403);
      expect((await http('GET', r.elegibles, otroTecnico.token)).status).toBe(403);

      // Nada cambió.
      const fila = await a.client.tareaTicket.findUniqueOrThrow({ where: { id: tarea.id } });
      expect(fila).toMatchObject({ completada: false, tecnicoId: tecnico.id, deletedAt: null });
    });

    it('el técnico de la tarea completa y descompleta, pero no gestiona', async () => {
      const { responsable, tecnico, ticketId } = await escenario();
      const r = rutas(ticketId);
      const { data: tarea } = await http<TareaTicketResponseDto>(
        'POST',
        r.base,
        responsable.token,
        { descripcion: 'Tarea propia' },
      );
      await http('PATCH', r.tecnico(tarea.id), responsable.token, { tecnicoId: tecnico.id });

      expect((await http('POST', r.completar(tarea.id), tecnico.token)).status).toBe(200);
      expect((await http('POST', r.descompletar(tarea.id), tecnico.token)).status).toBe(200);
      // Ve el ticket por su tarea (CA10), pero no lo gestiona: 403.
      expect((await http('DELETE', r.tarea(tarea.id), tecnico.token)).status).toBe(403);
      expect((await http('GET', r.base, tecnico.token)).status).toBe(200);
    });

    it('el responsable sin el permiso de modificación del módulo no gestiona: 403', async () => {
      const { clienteA } = await escenario();
      const responsableSinModulo = await actor(clienteA, 'TECNICO', [
        'TICKETS:LECTURA',
        'TICKETS:VER_TODOS',
      ]);
      const ticketId = await crearTicket(a, responsableSinModulo.id);

      const intento = await http('POST', rutas(ticketId).base, responsableSinModulo.token, {
        descripcion: 'X',
      });

      expect(intento.status).toBe(403);
    });

    it.each([
      ['un ADMINISTRADOR', 'administrador'],
      ['un USUARIO', 'usuario'],
    ] as const)('asignar a %s como técnico es un 422 (regla del punto 9)', async (_n, quien) => {
      const escena = await escenario();
      const r = rutas(escena.ticketId);
      const { data: tarea } = await http<TareaTicketResponseDto>(
        'POST',
        r.base,
        escena.responsable.token,
        { descripcion: 'X' },
      );

      const intento = await http('PATCH', r.tecnico(tarea.id), escena.responsable.token, {
        tecnicoId: escena[quien].id,
      });

      expect(intento.status).toBe(422);
    });

    it('una tarea de otro ticket es un 404', async () => {
      const { responsable, ticketId } = await escenario();
      const otroTicketId = await crearTicket(a, responsable.id);
      const { data: tarea } = await http<TareaTicketResponseDto>(
        'POST',
        rutas(ticketId).base,
        responsable.token,
        { descripcion: 'X' },
      );

      const cruzada = await http(
        'POST',
        rutas(otroTicketId).completar(tarea.id),
        responsable.token,
      );

      expect(cruzada.status).toBe(404);
    });
  });

  // ─── Visibilidad por tarea (CA10) ──────────────────────────────────────

  describe('visibilidad por tarea (CA10)', () => {
    async function ve(
      ticketId: string,
      token: string,
    ): Promise<{ detalle: number; enLista: boolean }> {
      const detalle = await http<TicketResponseDto>('GET', `${baseUrl}/tickets/${ticketId}`, token);
      const lista = await http<ListTicketsResponseDto>(
        'GET',
        `${baseUrl}/tickets?porPagina=100`,
        token,
      );
      expect(lista.status).toBe(200);
      return { detalle: detalle.status, enLista: lista.data.items.some((t) => t.id === ticketId) };
    }

    /** Un ticket ajeno (ni solicitante ni responsable) con una tarea del técnico sin VER_TODOS. */
    async function conTareaDelTecnico(previa?: Awaited<ReturnType<typeof escenario>>) {
      const escena = previa ?? (await escenario());
      const r = rutas(escena.ticketId);
      const { data: tarea } = await http<TareaTicketResponseDto>(
        'POST',
        r.base,
        escena.responsable.token,
        { descripcion: 'Revisar el enchufe' },
      );
      const asignada = await http('PATCH', r.tecnico(tarea.id), escena.responsable.token, {
        tecnicoId: escena.tecnico.id,
      });
      expect(asignada.status).toBe(200);
      return { ...escena, r, tareaId: tarea.id };
    }

    it('sin tarea no lo ve; con una tarea activa lo ve en el detalle, en el listado y en sus tareas', async () => {
      const previa = await escenario();
      expect(await ve(previa.ticketId, previa.tecnico.token)).toEqual({
        detalle: 404,
        enLista: false,
      });

      const escena = await conTareaDelTecnico(previa);
      expect(await ve(escena.ticketId, escena.tecnico.token)).toEqual({
        detalle: 200,
        enLista: true,
      });
      const tareas = await http<TareasTicketResponseDto>(
        'GET',
        escena.r.base,
        escena.tecnico.token,
      );
      expect(tareas.status).toBe(200);
      expect(tareas.data.items.map((t) => t.id)).toEqual([escena.tareaId]);
      const timeline = await http(
        'GET',
        `${baseUrl}/tickets/${escena.ticketId}/timeline`,
        escena.tecnico.token,
      );
      expect(timeline.status).toBe(200);
    });

    it('completa su tarea, pero no crea ni borra tareas ni transiciona el ticket', async () => {
      const { tecnico, r, tareaId, ticketId } = await conTareaDelTecnico();

      expect((await http('POST', r.completar(tareaId), tecnico.token)).status).toBe(200);
      expect((await http('POST', r.base, tecnico.token, { descripcion: 'Intrusa' })).status).toBe(
        403,
      );
      expect((await http('DELETE', r.tarea(tareaId), tecnico.token)).status).toBe(403);
      const transicion = await http(
        'PATCH',
        `${baseUrl}/tickets/${ticketId}/estado`,
        tecnico.token,
        {
          nuevoEstadoCodigo: 'EN_PROCESO',
        },
      );
      expect(transicion.status).toBe(403);

      const filas = await a.client.tareaTicket.findMany({ where: { ticketId, deletedAt: null } });
      expect(filas.map((f) => f.id)).toEqual([tareaId]);
      const ticket = await a.client.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      expect(ticket.estadoId).toBe(a.estadoNuevoId);
    });

    it('al quitarlo de la tarea deja de verlo', async () => {
      const { responsable, tecnico, r, tareaId, ticketId } = await conTareaDelTecnico();

      await http('PATCH', r.tecnico(tareaId), responsable.token, { tecnicoId: null });

      expect(await ve(ticketId, tecnico.token)).toEqual({ detalle: 404, enLista: false });
      expect((await http('GET', r.base, tecnico.token)).status).toBe(404);
    });

    it('al borrar la tarea deja de verlo', async () => {
      const { responsable, tecnico, r, tareaId, ticketId } = await conTareaDelTecnico();

      expect((await http('DELETE', r.tarea(tareaId), responsable.token)).status).toBe(204);

      expect(await ve(ticketId, tecnico.token)).toEqual({ detalle: 404, enLista: false });
      expect((await http('GET', r.base, tecnico.token)).status).toBe(404);
    });

    it('aislamiento: un técnico del cliente B no ve el ticket del cliente A aunque una tarea lo nombre', async () => {
      const { ticketId } = await escenario();
      const clienteB = await crearCliente(TENANT_B);
      const tecnicoB = await actor(clienteB, 'TECNICO', ['TICKETS:LECTURA']);
      // Una fila de A que apunta al usuario de B: el scope por inquilino tiene que bastar.
      await a.client.tareaTicket.create({
        data: { ticketId, descripcion: 'Cruzada', tecnicoId: tecnicoB.id },
      });

      expect(await ve(ticketId, tecnicoB.token)).toEqual({ detalle: 404, enLista: false });
      expect((await http('GET', rutas(ticketId).base, tecnicoB.token)).status).toBe(404);
    });
  });

  // ─── Aislamiento entre clientes ────────────────────────────────────────

  it('aislamiento: un usuario del cliente B no ve ni cambia las tareas del cliente A', async () => {
    const { responsable, ticketId } = await escenario();
    const r = rutas(ticketId);
    const { data: tarea } = await http<TareaTicketResponseDto>('POST', r.base, responsable.token, {
      descripcion: 'Del cliente A',
    });
    const clienteB = await crearCliente(TENANT_B);
    const adminB = await actor(clienteB, 'ADMINISTRADOR', []);

    expect((await http('GET', r.base, adminB.token)).status).toBe(404);
    expect((await http('POST', r.base, adminB.token, { descripcion: 'Intrusa' })).status).toBe(404);
    expect((await http('POST', r.completar(tarea.id), adminB.token)).status).toBe(404);
    expect((await http('DELETE', r.tarea(tarea.id), adminB.token)).status).toBe(404);

    const enA = await a.client.tareaTicket.findMany({ where: { ticketId } });
    expect(enA).toHaveLength(1);
    expect(enA[0]).toMatchObject({ id: tarea.id, completada: false, deletedAt: null });
    expect(await b.client.tareaTicket.count()).toBe(0);
  });

  it('sanity: la master y los dos inquilinos son bases *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_A).toMatch(/^soporte_prov_tareasA_.*_test$/);
    expect(TENANT_B).toMatch(/^soporte_prov_tareasB_.*_test$/);
  });
});
