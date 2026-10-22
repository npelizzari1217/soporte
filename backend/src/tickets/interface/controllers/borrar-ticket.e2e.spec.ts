/**
 * borrar-ticket.e2e.spec.ts — borrado lógico y recuperación de tickets por HTTP
 * (odd/tasks/permisos-por-tipo-ticket.md, T10, S8, L39-L41).
 *
 * Endpoints reales (`DELETE /tickets/:id`, `POST /tickets/:id/recuperar`, `GET /tickets?borrados=true`,
 * los lectores de tickets y `PUT /usuarios/:id/permisos-por-tipo`) con guards reales, master de test
 * y una base de tenant efímera migrada y sembrada con `TenantSeederAdapter`. Los asserts son de
 * contenido, contra la respuesta y contra la base. No trunca master: cada fila lleva un sufijo
 * aleatorio y se borra al final.
 */
import { randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../../auth/auth.module';
import { TicketsModule } from '../../tickets.module';
import { DashboardModule } from '../../../dashboard/dashboard.module';
import { ReparacionesModule } from '../../../reparaciones/reparaciones.module';
import { TicketPdfModule } from '../../../ticket-pdf/ticket-pdf.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../../clientes/infrastructure/tenant-seeder.adapter';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';
import { AccionTipoTicket } from '../../domain/permisos-tipo-ticket';
import {
  ListTicketsResponseDto,
  OperacionResponseDto,
  TicketResponseDto,
} from '../dtos/ticket.dto';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const SUFIJO = randomBytes(4).toString('hex');
const TENANT_DB = `soporte_prov_borrarE2E_${SUFIJO}_test`;
const PASSWORD = 'E2eBorrarTicket!123';

@Module({
  imports: [
    SharedModule,
    AuthModule,
    TicketsModule,
    DashboardModule,
    ReparacionesModule,
    TicketPdfModule,
  ],
})
class HarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Borrar y recuperar tickets (odd/permisos-por-tipo-ticket, T10, S8)', () => {
  const admin = new PostgresAdminService(URL_MASTER);
  let app: INestApplication;
  let baseUrl: string;
  let prisma: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tenant: InstanceType<typeof TenantPrismaClient>;
  let emailKeyOriginal: string | undefined;
  let clienteId: string;
  let cicloId: string;
  let prioridadId: string;
  /** Tipo sobre el que el técnico tiene Borrar. */
  let tipoConBorrar: string;
  /** Tipo que el técnico ve entero, sin Borrar. */
  let tipoSinBorrar: string;
  let adminId: string;
  let tecnicoId: string;
  let tokenAdmin: string;
  let tokenTecnico: string;
  const usuarioIds: string[] = [];

  type Respuesta<T> = { status: number; body: T };

  async function http<T = unknown>(
    metodo: string,
    ruta: string,
    token: string,
    body?: object,
  ): Promise<Respuesta<T>> {
    const res = await fetch(`${baseUrl}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as T };
  }

  async function exportarCsv(token: string, tipoId: string): Promise<string> {
    const res = await fetch(`${baseUrl}/tickets/export?tipo=${tipoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    return res.text();
  }

  async function rolId(codigo: string): Promise<string> {
    const rol =
      (await master.role.findFirst({ where: { codigo } })) ??
      (await master.role.create({ data: { codigo, nombre: codigo } }));
    return rol.id;
  }

  async function crearUsuario(etiqueta: string, rolCodigo: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `borrar-${etiqueta}-${SUFIJO}@test.local`,
      nombre: 'Borrar',
      apellido: etiqueta,
      passwordHash: await new Argon2HashProvider().hash(PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await new PrismaUsuarioRepository(prisma).save(usuario);
    usuarioIds.push(usuario.id);
    await master.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: await rolId(rolCodigo), activo: true },
    });
    return usuario;
  }

  async function login(email: string): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    return ((await res.json()) as { accessToken: string }).accessToken;
  }

  /** Fija las filas por tipo del técnico directo en la tabla del tenant. */
  async function fijarFilasTecnico(
    permisos: Record<string, readonly AccionTipoTicket[]>,
  ): Promise<void> {
    await tenant.permisoTipoTicket.deleteMany({ where: { usuarioId: tecnicoId } });
    await tenant.permisoTipoTicket.createMany({
      data: Object.entries(permisos).flatMap(([tipoId, acciones]) =>
        acciones.map((accion) => ({ usuarioId: tecnicoId, tipoId, accion })),
      ),
    });
  }

  async function crearTicket(tipoId: string, titulo: string): Promise<TicketResponseDto> {
    const { status, body } = await http<TicketResponseDto>('POST', '/tickets', tokenAdmin, {
      titulo: `${titulo} ${SUFIJO}`,
      tipoId,
      prioridadId,
    });
    expect(status).toBe(201);
    return body;
  }

  async function deletedAtDe(ticketId: string): Promise<Date | null> {
    return (await tenant.ticket.findUniqueOrThrow({ where: { id: ticketId } })).deletedAt;
  }

  async function operacionesDe(ticketId: string, codigo: string) {
    return tenant.operacionTicket.findMany({
      where: { ticketId, tipoOperacion: { codigo } },
    });
  }

  /** Entradas de borrado y recuperación que el timeline le muestra a `token`, como [código, autor]. */
  async function entradasDeBorrado(ticketId: string, token: string): Promise<string[][]> {
    const tipos = await tenant.tipoOperacion.findMany({
      where: { codigo: { in: ['TICKET_BORRADO', 'TICKET_RECUPERADO'] } },
    });
    const codigoDe = new Map(tipos.map((t) => [t.id, t.codigo]));
    const timeline = await http<OperacionResponseDto[]>(
      'GET',
      `/tickets/${ticketId}/timeline`,
      token,
    );
    expect(timeline.status).toBe(200);
    return timeline.body
      .filter((op) => codigoDe.has(op.tipoOperacionId))
      .map((op) => [codigoDe.get(op.tipoOperacionId) ?? '', op.autorId]);
  }

  async function idsDelListado(token: string, query: string): Promise<string[]> {
    const { status, body } = await http<ListTicketsResponseDto>(
      'GET',
      `/tickets?${query}&porPagina=100`,
      token,
    );
    expect(status).toBe(200);
    return body.items.map((t) => t.id);
  }

  async function totalDelTipoEnDashboard(token: string, tipoId: string): Promise<number> {
    const { status, body } = await http<{
      distribucionPorTipo: { tipoId: string; total: number }[];
    }>('GET', '/dashboard/metricas', token);
    expect(status).toBe(200);
    return body.distribucionPorTipo.find((d) => d.tipoId === tipoId)?.total ?? 0;
  }

  beforeAll(async () => {
    emailKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = 'f'.repeat(64);
    process.env.DATABASE_URL_MASTER ??= URL_MASTER;

    await admin.createDatabase(TENANT_DB);
    await new TenantMigrationRunnerAdapter(URL_MASTER).run(TENANT_DB);
    await new TenantSeederAdapter(URL_MASTER).seed(TENANT_DB);

    prisma = new PrismaService(URL_MASTER);
    master = prisma.getMasterClient();
    tenant = prisma.getTenantClient(TENANT_DB);
    prioridadId = (await tenant.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } })).id;
    cicloId = (
      await tenant.cicloCliente.create({
        data: {
          cicloVigenteId: '01900000-0000-7000-8000-000000000001',
          nombre: 'Ciclo borrar E2E',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: true,
        },
      })
    ).id;
    tipoConBorrar = (
      await tenant.tipoTicket.create({
        data: { codigo: `ALF${SUFIJO}`, nombre: 'Con borrar', modulo: 'TICKETS' },
      })
    ).id;
    tipoSinBorrar = (
      await tenant.tipoTicket.create({
        data: { codigo: `BET${SUFIJO}`, nombre: 'Sin borrar', modulo: 'TICKETS' },
      })
    ).id;

    const cliente = ClienteEntity.create({
      nombre: `Borrar E2E ${SUFIJO}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB,
      activo: true,
    });
    await new PrismaClienteRepository(prisma).save(cliente);
    clienteId = cliente.id;

    const usuarioAdmin = await crearUsuario('admin', 'ADMINISTRADOR');
    const usuarioTecnico = await crearUsuario('tecnico', 'TECNICO');
    adminId = usuarioAdmin.id;
    tecnicoId = usuarioTecnico.id;
    // El dashboard sigue decidiéndose por la celda de módulo; los tickets, por las filas por tipo.
    await new PrismaMatrizPermisosRepository(prisma).setPermisos(tecnicoId, clienteId, [
      'DASHBOARD:LECTURA',
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [HarnessModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    tokenAdmin = await login(usuarioAdmin.email);
    tokenTecnico = await login(usuarioTecnico.email);
  }, 120_000);

  beforeEach(async () => {
    // Ve los dos tipos enteros; Borrar solo sobre uno (S2).
    await fijarFilasTecnico({
      [tipoConBorrar]: ['LECTURA', 'VER_TODOS', 'IMPRESION', 'BORRADO'],
      [tipoSinBorrar]: ['LECTURA', 'VER_TODOS', 'IMPRESION'],
    });
  });

  afterAll(async () => {
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      for (const usuarioId of usuarioIds) {
        await master.usuarioClientePermiso.deleteMany({ where: { usuarioId } });
        await master.refreshToken.deleteMany({ where: { usuarioId } });
        await master.membresia.deleteMany({ where: { usuarioId } });
        await master.usuario.deleteMany({ where: { id: usuarioId } });
      }
      if (clienteId) await master.cliente.deleteMany({ where: { id: clienteId } });
    } catch {
      /* no-op */
    }
    try {
      await prisma?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(TENANT_DB);
  }, 60_000);

  it('DELETE según el tipo: 204 con Borrar sobre ese tipo, 403 sin él (S2), y deja el historial', async () => {
    const conBorrar = await crearTicket(tipoConBorrar, 'Con borrar');
    const sinBorrar = await crearTicket(tipoSinBorrar, 'Sin borrar');

    const permitido = await http('DELETE', `/tickets/${conBorrar.id}`, tokenTecnico);
    const prohibido = await http<{ message: string }>(
      'DELETE',
      `/tickets/${sinBorrar.id}`,
      tokenTecnico,
    );

    expect(permitido.status).toBe(204);
    expect(await deletedAtDe(conBorrar.id)).not.toBeNull();
    const [borrado] = await operacionesDe(conBorrar.id, 'TICKET_BORRADO');
    expect(borrado?.autorId).toBe(tecnicoId);
    expect(prohibido.status).toBe(403);
    expect(prohibido.body.message).toBe(
      'El usuario no tiene el permiso "BORRADO" sobre el tipo de este ticket.',
    );
    expect(await deletedAtDe(sinBorrar.id)).toBeNull();
    expect(await operacionesDe(sinBorrar.id, 'TICKET_BORRADO')).toEqual([]);
  });

  it('un ticket borrado desaparece para quien lo veía: listado, detalle, timeline, PDF, exportación, dashboard y reparaciones', async () => {
    const ticket = await crearTicket(tipoConBorrar, 'Visible antes');
    const satelite = await tenant.ticketEdilicia.create({ data: { ticketId: ticket.id } });
    const reparacionesAdmin = async () =>
      (
        await http<{ items: { id: string }[] }>('GET', '/reparaciones?porPagina=100', tokenAdmin)
      ).body.items.map((r) => r.id);

    // Antes: lo ve en todos lados.
    expect(await idsDelListado(tokenTecnico, `tipo=${tipoConBorrar}`)).toContain(ticket.id);
    expect((await http('GET', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(200);
    expect(await exportarCsv(tokenTecnico, tipoConBorrar)).toContain(ticket.numero);
    // El dashboard de un TECNICO cuenta solo lo que tiene asignado (D2): se mira el del administrador.
    const enDashboardAntes = await totalDelTipoEnDashboard(tokenAdmin, tipoConBorrar);
    expect(enDashboardAntes).toBeGreaterThan(0);
    expect(await reparacionesAdmin()).toContain(satelite.id);

    expect((await http('DELETE', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(204);

    expect(await idsDelListado(tokenTecnico, `tipo=${tipoConBorrar}`)).not.toContain(ticket.id);
    expect(await idsDelListado(tokenAdmin, `tipo=${tipoConBorrar}`)).not.toContain(ticket.id);
    expect((await http('GET', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(404);
    expect((await http('GET', `/tickets/${ticket.id}`, tokenAdmin)).status).toBe(404);
    expect((await http('GET', `/tickets/${ticket.id}/timeline`, tokenTecnico)).status).toBe(404);
    expect((await http('GET', `/tickets/${ticket.id}/pdf`, tokenTecnico)).status).toBe(404);
    expect(await exportarCsv(tokenTecnico, tipoConBorrar)).not.toContain(ticket.numero);
    expect(await totalDelTipoEnDashboard(tokenAdmin, tipoConBorrar)).toBe(enDashboardAntes - 1);
    expect(await reparacionesAdmin()).not.toContain(satelite.id);
    // Otra operación por id tampoco lo encuentra.
    const comentario = await http('POST', `/tickets/${ticket.id}/comentarios`, tokenAdmin, {
      texto: 'Sobre un ticket borrado',
    });
    expect(comentario.status).toBe(404);
  });

  it('con una tarea pendiente: 422 que dice qué resolver, y nada cambia', async () => {
    const ticket = await crearTicket(tipoConBorrar, 'Con tarea');
    await tenant.tareaTicket.create({
      data: { ticketId: ticket.id, descripcion: 'Revisar cableado', orden: 1 },
    });

    const { status, body } = await http<{ message: string }>(
      'DELETE',
      `/tickets/${ticket.id}`,
      tokenTecnico,
    );

    expect(status).toBe(422);
    expect(body.message).toBe(
      'No se puede borrar el ticket: antes hay que completar o eliminar su tarea pendiente.',
    );
    expect(await deletedAtDe(ticket.id)).toBeNull();
    expect(await operacionesDe(ticket.id, 'TICKET_BORRADO')).toEqual([]);
    expect(await idsDelListado(tokenTecnico, `tipo=${tipoConBorrar}`)).toContain(ticket.id);
  });

  it('con una compra vinculada a su reparación: 422 que la nombra, y nada cambia', async () => {
    const ticket = await crearTicket(tipoConBorrar, 'Con compra');
    const satelite = await tenant.ticketEdilicia.create({ data: { ticketId: ticket.id } });
    const numeroCompra = `C${SUFIJO}`;
    const compra = await tenant.compra.create({
      data: {
        numero: numeroCompra,
        fechaSolicitud: new Date('2026-10-01'),
        motivo: 'Repuesto',
        solicitanteId: adminId,
        cicloId,
      },
    });
    await tenant.reparacionCompra.create({
      data: { ticketEdiliciaId: satelite.id, compraId: compra.id },
    });

    const { status, body } = await http<{ message: string }>(
      'DELETE',
      `/tickets/${ticket.id}`,
      tokenAdmin,
    );

    expect(status).toBe(422);
    expect(body.message).toBe(
      `No se puede borrar el ticket: antes hay que desvincular de la reparación la compra ${numeroCompra}.`,
    );
    expect(await deletedAtDe(ticket.id)).toBeNull();
    expect(await operacionesDe(ticket.id, 'TICKET_BORRADO')).toEqual([]);
  });

  it('solo ADMINISTRADOR ve los borrados y los recupera: vuelve al mismo estado, con el historial de los dos pasos', async () => {
    const ticket = await crearTicket(tipoConBorrar, 'Para recuperar');
    expect((await http('DELETE', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(204);

    // El técnico, aunque pueda borrar, no lista borrados ni recupera.
    const listaTecnico = await http<{ message: string }>(
      'GET',
      `/tickets?borrados=true&tipo=${tipoConBorrar}`,
      tokenTecnico,
    );
    expect(listaTecnico.status).toBe(403);
    expect(listaTecnico.body.message).toBe(
      'Solo un administrador puede ver o recuperar tickets borrados.',
    );
    expect((await http('POST', `/tickets/${ticket.id}/recuperar`, tokenTecnico)).status).toBe(403);
    expect(await deletedAtDe(ticket.id)).not.toBeNull();

    // El administrador lo ve con el filtro, marcado, y solo ahí.
    const borrados = await http<ListTicketsResponseDto>(
      'GET',
      `/tickets?borrados=true&tipo=${tipoConBorrar}&porPagina=100`,
      tokenAdmin,
    );
    expect(borrados.status).toBe(200);
    const fila = borrados.body.items.find((t) => t.id === ticket.id);
    expect(fila?.borradoEn).not.toBeNull();
    expect(borrados.body.items.every((t) => t.borradoEn !== null)).toBe(true);
    expect(await idsDelListado(tokenAdmin, `tipo=${tipoConBorrar}`)).not.toContain(ticket.id);

    const recuperado = await http<TicketResponseDto>(
      'POST',
      `/tickets/${ticket.id}/recuperar`,
      tokenAdmin,
    );
    expect(recuperado.status).toBe(200);
    expect(recuperado.body.estadoId).toBe(ticket.estadoId);
    expect(recuperado.body.borradoEn).toBeNull();
    expect(await deletedAtDe(ticket.id)).toBeNull();
    expect(await idsDelListado(tokenTecnico, `tipo=${tipoConBorrar}`)).toContain(ticket.id);
    expect((await http('GET', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(200);

    // Historial: borrado por el técnico, recuperado por el administrador, en ese orden.
    expect(await entradasDeBorrado(ticket.id, tokenAdmin)).toEqual([
      ['TICKET_BORRADO', tecnicoId],
      ['TICKET_RECUPERADO', adminId],
    ]);

    // Recuperar algo que no está borrado: 404.
    expect((await http('POST', `/tickets/${ticket.id}/recuperar`, tokenAdmin)).status).toBe(404);
  });

  it('las entradas de borrado y recuperación son internas: el solicitante sin OBSERVAR no las ve, con OBSERVAR sí (L45)', async () => {
    // El técnico abre el ticket: lo ve por ser su solicitante, sin Ver todos.
    await fijarFilasTecnico({ [tipoConBorrar]: ['LECTURA', 'ALTAS'] });
    const alta = await http<TicketResponseDto>('POST', '/tickets', tokenTecnico, {
      titulo: `Propio ${SUFIJO}`,
      tipoId: tipoConBorrar,
      prioridadId,
    });
    expect(alta.status).toBe(201);
    expect(alta.body.solicitanteId).toBe(tecnicoId);
    expect((await http('DELETE', `/tickets/${alta.body.id}`, tokenAdmin)).status).toBe(204);
    expect((await http('POST', `/tickets/${alta.body.id}/recuperar`, tokenAdmin)).status).toBe(200);

    expect(await entradasDeBorrado(alta.body.id, tokenTecnico)).toEqual([]);

    await fijarFilasTecnico({ [tipoConBorrar]: ['LECTURA', 'ALTAS', 'OBSERVAR'] });
    expect(await entradasDeBorrado(alta.body.id, tokenTecnico)).toEqual([
      ['TICKET_BORRADO', adminId],
      ['TICKET_RECUPERADO', adminId],
    ]);
  });

  it('un ticket PREVENTIVO no se borra, ni siquiera el administrador: 422 y nada cambia (L45)', async () => {
    const tipoPreventivo = await tenant.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'PREVENTIVO' },
    });
    const estado = await tenant.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } });
    const preventivo = await tenant.ticket.create({
      data: {
        numero: `PRV-${SUFIJO}`,
        titulo: `Preventivo ${SUFIJO}`,
        tipoId: tipoPreventivo.id,
        estadoId: estado.id,
        prioridadId,
        solicitanteId: adminId,
      },
    });

    const { status, body } = await http<{ message: string }>(
      'DELETE',
      `/tickets/${preventivo.id}`,
      tokenAdmin,
    );

    expect(status).toBe(422);
    expect(body.message).toBe(
      'No se puede borrar un ticket de mantenimiento preventivo: lo genera el sistema a partir ' +
        'de su plan.',
    );
    expect(await deletedAtDe(preventivo.id)).toBeNull();
    expect(await operacionesDe(preventivo.id, 'TICKET_BORRADO')).toEqual([]);
  });

  it('PUT permisos-por-tipo acepta Borrar con Ver y lo rechaza sin Ver; concedido, el usuario borra en el próximo request', async () => {
    const ticket = await crearTicket(tipoSinBorrar, 'Borrar concedido');

    const sinVer = await http<{ message: string }>(
      'PUT',
      `/usuarios/${tecnicoId}/permisos-por-tipo`,
      tokenAdmin,
      { tipos: [{ tipoId: tipoSinBorrar, acciones: ['BORRADO'] }] },
    );
    expect(sinVer.status).toBe(422);
    expect(sinVer.body.message).toBe(
      'Sin Ver no se puede conceder ninguna otra acción en el tipo «Sin borrar» (se pidió BORRADO).',
    );
    expect((await http('DELETE', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(403);

    const conVer = await http('PUT', `/usuarios/${tecnicoId}/permisos-por-tipo`, tokenAdmin, {
      tipos: [{ tipoId: tipoSinBorrar, acciones: ['LECTURA', 'VER_TODOS', 'BORRADO'] }],
    });
    expect(conVer.status).toBe(200);
    const filas = await tenant.permisoTipoTicket.findMany({
      where: { usuarioId: tecnicoId, tipoId: tipoSinBorrar },
    });
    expect(filas.map((f) => f.accion).sort()).toEqual(['BORRADO', 'LECTURA', 'VER_TODOS']);

    expect((await http('DELETE', `/tickets/${ticket.id}`, tokenTecnico)).status).toBe(204);
    expect(await deletedAtDe(ticket.id)).not.toBeNull();
  });
});
