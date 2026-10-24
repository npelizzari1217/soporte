/**
 * integraciones-api-v1-tickets.e2e.spec.ts — e2e HTTP real de los endpoints `v1` de tickets de la
 * API publica (sdd/api-publica, T5: CA1, CA3 y el criterio transversal de aislamiento). Postgres
 * real: `soporte_master_test` y una base de tenant efimera por cliente (A y B).
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

import { SharedModule } from '../src/shared/shared.module';
import { AuthModule } from '../src/auth/auth.module';
import { TicketsModule } from '../src/tickets/tickets.module';
import { ApiV1Module } from '../src/integraciones/api-v1.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../src/shared/infrastructure/persistence/prisma-clients';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { generarClaveApi } from '../src/integraciones/domain/generar-clave-api';
import { usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_v1tkA_${SUFIJO}_test`;
const DB_B = `soporte_prov_v1tkB_${SUFIJO}_test`;
const TODOS = ['TICKETS:LECTURA', 'TICKETS:ALTAS', 'TICKETS:COMENTAR'];

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

@Module({ imports: [SharedModule, AuthModule, TicketsModule, ApiV1Module] })
class ArneesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

interface Entorno {
  clienteId: string;
  usuarioId: string;
  adminId: string;
  tipoId: string;
  prioridadId: string;
  tenant: InstanceType<typeof TenantPrismaClient>;
}

interface TicketV1Resp {
  id: string;
  numero: string;
  estado: string;
  solicitante: { nombre: string; apellido: string | null } | null;
}

describe('API v1 e2e — tickets', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    for (const db of [DB_A, DB_B]) {
      await admin.createDatabase(db);
      await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(db);
      await new TenantSeederAdapter(MASTER_TEST_URL).seed(db);
    }
    prismaService = new PrismaService(MASTER_TEST_URL);
    master = prismaService.getMasterClient();
    for (const db of [DB_A, DB_B]) {
      await prismaService.getTenantClient(db).cicloCliente.create({
        data: {
          cicloVigenteId: '01900000-0000-7000-8000-000000000001',
          nombre: 'E2E ciclo v1',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: true,
        },
      });
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ArneesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 120_000);

  afterAll(async () => {
    // Orden: filas del tenant -> app.close() -> pool -> dropDatabase.
    for (const db of [DB_A, DB_B]) {
      try {
        const t = prismaService.getTenantClient(db);
        await t.operacionTicket.deleteMany();
        await t.ticket.deleteMany();
      } catch (_err) {
        /* no-op */
      }
    }
    try {
      await app?.close();
    } catch (_err) {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  beforeEach(async () => {
    for (const db of [DB_A, DB_B]) {
      const t = prismaService.getTenantClient(db);
      await t.operacionTicket.deleteMany();
      await t.ticket.deleteMany();
    }
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE api_claves, membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await master.role.create({ data: { codigo: 'USUARIO', nombre: 'Usuario' } });
  });

  /** Cliente con su base de tenant, usuario de integracion + membresia USUARIO y un admin. */
  async function crearEntorno(dbName: string): Promise<Entorno> {
    const sufijo = randomBytes(3).toString('hex');
    const cliente = await master.cliente.create({
      data: { nombre: `E2E v1 tk ${sufijo}`, dbName, apiHabilitada: true },
    });
    const usuario = await master.usuario.create({
      data: {
        email: `integracion-${sufijo}@integraciones.invalid`,
        nombre: 'Integracion',
        apellido: 'API',
        passwordHash: 'x',
        esIntegracion: true,
      },
    });
    const rol = await master.role.findUniqueOrThrow({ where: { codigo: 'USUARIO' } });
    await master.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: rol.id },
    });
    const adminUsuario = await master.usuario.create({
      data: {
        email: `admin-${sufijo}@e2e.test`,
        nombre: 'Admin',
        apellido: 'E2E',
        passwordHash: 'x',
      },
    });
    const tenant = prismaService.getTenantClient(dbName);
    const tipo = await tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } });
    const prioridad = await tenant.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } });
    return {
      clienteId: cliente.id,
      usuarioId: usuario.id,
      adminId: adminUsuario.id,
      tipoId: tipo.id,
      prioridadId: prioridad.id,
      tenant,
    };
  }

  async function emitirClave(e: Entorno, permisos: string[], revocada = false): Promise<string> {
    const generada = generarClaveApi();
    await master.apiClave.create({
      data: {
        clienteId: e.clienteId,
        usuarioId: e.usuarioId,
        nombre: 'ERP',
        prefijo: generada.prefijo,
        hash: generada.hash,
        permisos,
        creadaPorId: e.adminId,
        revocadaAt: revocada ? new Date() : null,
      },
    });
    return generada.clave;
  }

  async function llamar<T = unknown>(
    clave: string,
    metodo: string,
    ruta: string,
    cuerpo?: unknown,
  ): Promise<{ status: number; data: T }> {
    const res = await fetch(`${baseUrl}/v1/tickets${ruta}`, {
      method: metodo,
      headers: { 'X-Api-Key': clave, 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as T };
  }

  async function crearTicket(e: Entorno, clave: string, titulo = 'No imprime') {
    return llamar<TicketV1Resp>(clave, 'POST', '', {
      titulo,
      descripcion: 'La impresora del piso 2 no responde',
      tipoId: e.tipoId,
      prioridadId: e.prioridadId,
    });
  }

  it('crea (autor: el usuario de integracion), lista, ve y comenta en publico', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);

    const creado = await crearTicket(a, clave);
    expect(creado.status).toBe(201);
    expect(creado.data.solicitante).toEqual({ nombre: 'Integracion', apellido: 'API' });
    const fila = await a.tenant.ticket.findUniqueOrThrow({ where: { id: creado.data.id } });
    expect(fila.solicitanteId).toBe(a.usuarioId);
    const apertura = await a.tenant.operacionTicket.findFirstOrThrow({
      where: { ticketId: creado.data.id },
    });
    expect(apertura.autorId).toBe(a.usuarioId);

    const lista = await llamar<{ items: TicketV1Resp[]; total: number }>(clave, 'GET', '');
    expect(lista.status).toBe(200);
    expect(lista.data.items.map((t) => t.id)).toContain(creado.data.id);

    const detalle = await llamar<TicketV1Resp>(clave, 'GET', `/${creado.data.id}`);
    expect(detalle.status).toBe(200);
    expect(detalle.data).toMatchObject({ id: creado.data.id, estado: 'NUEVO' });

    const comentario = await llamar<{ id: string; esInterno: boolean }>(
      clave,
      'POST',
      `/${creado.data.id}/comentarios`,
      { texto: 'Adjunto el log', esInterno: true },
    );
    expect(comentario.status).toBe(201);
    expect(comentario.data.esInterno).toBe(false);
    const op = await a.tenant.operacionTicket.findUniqueOrThrow({
      where: { id: comentario.data.id },
    });
    expect(op).toMatchObject({ esInterno: false, autorId: a.usuarioId });
  });

  it('T5d: un comentario por API sobre el ticket de una persona no cuenta como primera respuesta', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);
    const creado = await crearTicket(a, clave);
    // El solicitante pasa a ser una persona: sin la regla, el autor (usuario de integracion) no es
    // el solicitante y el comentario registraria la primera respuesta.
    await a.tenant.ticket.update({
      where: { id: creado.data.id },
      data: { solicitanteId: a.adminId },
    });

    const comentario = await llamar(clave, 'POST', `/${creado.data.id}/comentarios`, {
      texto: 'Seguimos sin impresora',
    });

    expect(comentario.status).toBe(201);
    const fila = await a.tenant.ticket.findUniqueOrThrow({ where: { id: creado.data.id } });
    expect(fila.solicitanteId).toBe(a.adminId);
    expect(fila.primeraRespuestaAt).toBeNull();
  });

  it('un ticket CERRADO admite el comentario por API: 201 y el ticket sigue cerrado (odd/cerrado-solo-comentarios, S4)', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);
    const creado = await crearTicket(a, clave);
    const cerrado = await a.tenant.estado.findUniqueOrThrow({ where: { codigo: 'CERRADO' } });
    await a.tenant.ticket.update({
      where: { id: creado.data.id },
      data: { estadoId: cerrado.id },
    });

    const comentario = await llamar<{ id: string; esInterno: boolean }>(
      clave,
      'POST',
      `/${creado.data.id}/comentarios`,
      { texto: 'Gracias, ya funciona' },
    );

    expect(comentario.status).toBe(201);
    const op = await a.tenant.operacionTicket.findUniqueOrThrow({
      where: { id: comentario.data.id },
    });
    expect(op).toMatchObject({
      ticketId: creado.data.id,
      descripcion: 'Gracias, ya funciona',
      esInterno: false,
      autorId: a.usuarioId,
    });
    const fila = await a.tenant.ticket.findUniqueOrThrow({ where: { id: creado.data.id } });
    expect(fila.estadoId).toBe(cerrado.id);
  });

  it('T5e: un tipo de otro modulo, uno dado de baja y uno inexistente dan el mismo 422 y no crean ticket', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);
    const edilicia = await a.tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'EDILICIA' } });
    const baja = await a.tenant.tipoTicket.create({
      data: {
        codigo: `T5E_BAJA_${randomBytes(3).toString('hex')}`,
        nombre: 'Tipo de tickets dado de baja',
        modulo: 'TICKETS',
        activo: false,
        deletedAt: new Date(),
      },
    });

    // La base del tenant es efimera y el codigo del tipo es unico por corrida: no hace falta borrarlo.
    const respuestas: { status: number; data: { message: string } }[] = [];
    for (const tipoId of [edilicia.id, baja.id, '01977a00-0000-7000-8000-00000000dead']) {
      respuestas.push(
        await llamar<{ message: string }>(clave, 'POST', '', {
          titulo: 'Tipo fuera de la API',
          tipoId,
          prioridadId: a.prioridadId,
        }),
      );
    }

    expect(respuestas.map((r) => r.status)).toEqual([422, 422, 422]);
    // El mensaje no revela si el id existe en otro modulo o esta dado de baja.
    expect(new Set(respuestas.map((r) => r.data.message)).size).toBe(1);
    expect(await a.tenant.ticket.count()).toBe(0);
  });

  it('JD-3: un ticket de otro modulo no existe para v1: 404 al ver y comentar, 422 como referencia', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);
    const creado = await crearTicket(a, clave);
    // El ticket pasa a un tipo de otro modulo (EDILICIA, del seed), como uno creado por la app.
    const edilicia = await a.tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'EDILICIA' } });
    await a.tenant.ticket.update({ where: { id: creado.data.id }, data: { tipoId: edilicia.id } });
    const inexistenteId = '01977a00-0000-7000-8000-00000000beef';
    /** Cuerpo sin el id pedido, para comparar el 404 de un ticket ajeno con el de uno inexistente. */
    const sinId = (data: unknown, id: string) => JSON.stringify(data).replaceAll(id, '<id>');

    const detalle = await llamar(clave, 'GET', `/${creado.data.id}`);
    const detalleInexistente = await llamar(clave, 'GET', `/${inexistenteId}`);
    expect(detalle.status).toBe(404);
    expect(sinId(detalle.data, creado.data.id)).toBe(
      sinId(detalleInexistente.data, inexistenteId),
    );

    const comentario = await llamar(clave, 'POST', `/${creado.data.id}/comentarios`, {
      texto: 'No deberia quedar',
    });
    const comentarioInexistente = await llamar(clave, 'POST', `/${inexistenteId}/comentarios`, {
      texto: 'No deberia quedar',
    });
    expect(comentario.status).toBe(404);
    expect(sinId(comentario.data, creado.data.id)).toBe(
      sinId(comentarioInexistente.data, inexistenteId),
    );
    // Solo la operacion de apertura: el comentario no se escribio.
    expect(await a.tenant.operacionTicket.count({ where: { ticketId: creado.data.id } })).toBe(1);

    const conReferencia = await llamar(clave, 'POST', '', {
      titulo: 'Continua el de otro modulo',
      tipoId: a.tipoId,
      prioridadId: a.prioridadId,
      ticketReferenciaId: creado.data.id,
    });
    expect(conReferencia.status).toBe(422);
    expect(await a.tenant.ticket.count()).toBe(1);
  });

  it('el detalle nunca incluye comentarios internos ni ids internos', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);
    const creado = await crearTicket(a, clave);
    const tipoComentario = await a.tenant.tipoOperacion.findUniqueOrThrow({
      where: { codigo: 'COMENTARIO' },
    });
    await a.tenant.operacionTicket.create({
      data: {
        ticketId: creado.data.id,
        tipoOperacionId: tipoComentario.id,
        descripcion: 'NOTA-INTERNA-SECRETA',
        autorId: a.adminId,
        esInterno: true,
      },
    });

    const detalle = await llamar(clave, 'GET', `/${creado.data.id}`);
    const lista = await llamar(clave, 'GET', '');

    for (const r of [detalle, lista]) {
      const json = JSON.stringify(r.data);
      expect(json).not.toContain('NOTA-INTERNA-SECRETA');
      expect(json).not.toContain(a.usuarioId);
    }
  });

  it('una clave del cliente B no ve ni toca los tickets del cliente A', async () => {
    const a = await crearEntorno(DB_A);
    const b = await crearEntorno(DB_B);
    const claveA = await emitirClave(a, TODOS);
    const claveB = await emitirClave(b, TODOS);
    const deA = await crearTicket(a, claveA);

    const lista = await llamar<{ items: TicketV1Resp[]; total: number }>(claveB, 'GET', '');
    const detalle = await llamar(claveB, 'GET', `/${deA.data.id}`);
    const comentario = await llamar(claveB, 'POST', `/${deA.data.id}/comentarios`, { texto: 'x' });

    expect(lista.status).toBe(200);
    expect(lista.data.items.map((t) => t.id)).not.toContain(deA.data.id);
    expect(detalle.status).toBe(404);
    expect(comentario.status).toBe(404);
    expect(await a.tenant.operacionTicket.count({ where: { esInterno: false } })).toBe(1);
  });

  it('una clave de solo lectura recibe 403 al crear y al comentar, y 200 al leer', async () => {
    const a = await crearEntorno(DB_A);
    const conAltas = await emitirClave(a, TODOS);
    const soloLectura = await emitirClave(a, ['TICKETS:LECTURA']);
    const creado = await crearTicket(a, conAltas);

    expect((await crearTicket(a, soloLectura)).status).toBe(403);
    const comentario = await llamar(soloLectura, 'POST', `/${creado.data.id}/comentarios`, {
      texto: 'x',
    });
    expect(comentario.status).toBe(403);
    expect((await llamar(soloLectura, 'GET', '')).status).toBe(200);
  });

  it('JD-2: con la membresia de integracion en ADMINISTRADOR, una clave de solo lectura sigue recibiendo 403', async () => {
    const a = await crearEntorno(DB_A);
    const conAltas = await emitirClave(a, TODOS);
    const soloLectura = await emitirClave(a, ['TICKETS:LECTURA']);
    const creado = await crearTicket(a, conAltas);
    // Lo que haria un ADMINISTRADOR con `PATCH /usuarios/:id/rol` sobre el usuario de integracion.
    const adminRol = await master.role.create({
      data: { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
    });
    await master.membresia.updateMany({
      where: { usuarioId: a.usuarioId, clienteId: a.clienteId },
      data: { rolId: adminRol.id },
    });

    expect((await crearTicket(a, soloLectura)).status).toBe(403);
    const comentario = await llamar(soloLectura, 'POST', `/${creado.data.id}/comentarios`, {
      texto: 'x',
    });
    expect(comentario.status).toBe(403);
    expect(await a.tenant.ticket.count()).toBe(1);
    expect(await a.tenant.operacionTicket.count({ where: { ticketId: creado.data.id } })).toBe(1);
  });

  it('una clave revocada recibe 401', async () => {
    const a = await crearEntorno(DB_A);
    const revocada = await emitirClave(a, TODOS, true);

    expect((await llamar(revocada, 'GET', '')).status).toBe(401);
  });

  it('CA1: no hay rutas de transicion ni de asignacion', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, TODOS);
    const creado = await crearTicket(a, clave);

    const estado = await llamar(clave, 'PATCH', `/${creado.data.id}/estado`, {
      nuevoEstadoCodigo: 'CERRADO',
    });
    const asignar = await llamar(clave, 'PATCH', `/${creado.data.id}/asignar`, {
      asignadoId: a.adminId,
    });

    expect(estado.status).toBe(404);
    expect(asignar.status).toBe(404);
  });
});
