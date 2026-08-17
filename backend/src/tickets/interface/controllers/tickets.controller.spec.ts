/**
 * tickets.controller.spec.ts — regresión del bypass ROOT en los chequeos de
 * permiso INLINE del controller (los que NO pasan por `PermissionsGuard` porque
 * dependen del `body`/`query`, no de metadata estática por ruta).
 *
 * Bug (sdd/root-access-fix): un ROOT (`is_global_admin=true`) tiene `permisos=[]`
 * cuando trabaja scopeado a un tenant sin membresía. Los chequeos inline
 * (`user.permisos.includes(...)`) le negaban por 403 el comentario interno
 * (`ticket:observar`) y le degradaban el scope de `ticket:ver_todos` en
 * list/detalle/timeline. `PermissionsGuard` ya bypassea al ROOT; estos chequeos
 * inline deben honrar el MISMO criterio.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import {
  TicketNoEncontradoError,
  TicketBloqueadoParaEdicionError,
} from '../../domain/errors/tickets.errors';

type Ctor = ConstructorParameters<typeof TicketsController>;

/** Operación de dominio mínima para alimentar `toOperacionResponseDto`. */
function fakeOperacion(esInterno: boolean): OperacionTicketEntity {
  return {
    id: 'op-1',
    ticketId: 'ticket-1',
    tipoOperacionId: 'tipo-op-comentario',
    descripcion: 'Nota interna del ROOT',
    estadoAnteriorId: null,
    estadoNuevoId: null,
    autorId: 'root-1',
    esInterno,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  } as unknown as OperacionTicketEntity;
}

const ROOT: JwtPayload = payloadDeTest({
  sub: 'root-1',
  cliente_id: 'cliente-1',
  rol: null,
  permisos: [], // ROOT scopeado a un tenant sin membresía → sin permisos de rol
  is_global_admin: true,
  cliente_nombre: 'Cliente 1',
  modulos: [], // ROOT no necesita módulos: bypassa por is_global_admin
});

const USUARIO_SIN_OBSERVAR: JwtPayload = payloadDeTest({
  sub: 'usr-1',
  cliente_id: 'cliente-1',
  rol: 'USUARIO',
  permisos: ['ticket:comentar'], // tiene comentar, NO observar
  cliente_nombre: 'Cliente 1',
  modulos: ['SOPORTE'],
});

const ADMINISTRADOR: JwtPayload = payloadDeTest({
  sub: 'admin-1',
  cliente_id: 'cliente-1',
  rol: 'ADMINISTRADOR',
  permisos: ['ticket:ver_todos'],
  cliente_nombre: 'Cliente 1',
  modulos: ['SOPORTE', 'COMPRAS', 'EDILICIA', 'EQUIPOS'],
});

const USUARIO_SOPORTE: JwtPayload = payloadDeTest({
  sub: 'usr-2',
  cliente_id: 'cliente-1',
  rol: 'USUARIO',
  permisos: [],
  cliente_nombre: 'Cliente 1',
  modulos: ['SOPORTE'],
});

describe('TicketsController — bypass ROOT en chequeos inline (sdd/root-access-fix)', () => {
  function buildController(overrides: {
    crearComentario?: { execute: ReturnType<typeof vi.fn> };
    listarTimeline?: { execute: ReturnType<typeof vi.fn> };
    listarTickets?: { execute: ReturnType<typeof vi.fn> };
  }) {
    const stub = () => ({ execute: vi.fn() });
    const crearComentario = overrides.crearComentario ?? stub();
    const listarTimeline = overrides.listarTimeline ?? stub();
    const listarTickets = overrides.listarTickets ?? stub();
    // `findAll` resuelve nombres batch de los items — con lista vacía devuelve
    // un Map vacío sin N+1.
    const usuarioMasterChecker = { resolverNombres: vi.fn().mockResolvedValue(new Map()) };

    const controller = new TicketsController(
      stub() as Ctor[0], // crearTicketUseCase
      stub() as Ctor[1], // obtenerTicketUseCase
      listarTickets as unknown as Ctor[2], // listarTicketsUseCase
      stub() as Ctor[3], // editarTicketUseCase
      stub() as Ctor[4], // transicionarEstadoUseCase
      stub() as Ctor[5], // asignarTicketUseCase
      crearComentario as unknown as Ctor[6], // crearComentarioUseCase
      listarTimeline as unknown as Ctor[7], // listarTimelineUseCase
      usuarioMasterChecker as unknown as Ctor[8], // usuarioMasterChecker
    );
    return { controller, crearComentario, listarTimeline, listarTickets };
  }

  it('ROOT con permisos=[] PUEDE crear un comentario interno (no 403) y lo delega con esInterno=true', async () => {
    const crearComentario = { execute: vi.fn().mockResolvedValue(Result.ok(fakeOperacion(true))) };
    const { controller } = buildController({ crearComentario });

    const res = await controller.comentar(ROOT, 'ticket-1', {
      texto: 'Nota interna del ROOT',
      esInterno: true,
    });

    expect(crearComentario.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', autorId: 'root-1', esInterno: true }),
    );
    expect(res.esInterno).toBe(true);
  });

  it('preserva el guard: NO-ROOT sin ticket:observar recibe 403 al comentar interno', async () => {
    const crearComentario = { execute: vi.fn() };
    const { controller } = buildController({ crearComentario });

    await expect(
      controller.comentar(USUARIO_SIN_OBSERVAR, 'ticket-1', {
        texto: 'Intento de nota interna',
        esInterno: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(crearComentario.execute).not.toHaveBeenCalled();
  });

  it('ROOT ve TODO el scope: timeline se invoca con ver_todos y observar en true', async () => {
    const listarTimeline = { execute: vi.fn().mockResolvedValue(Result.ok([])) };
    const { controller } = buildController({ listarTimeline });

    await controller.timeline(ROOT, 'ticket-1');

    expect(listarTimeline.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tienePermisoVerTodos: true, tienePermisoObservar: true }),
    );
  });
});

describe('TicketsController.findAll — gate de módulo (5.2 CAPA 2)', () => {
  function buildController() {
    const stub = () => ({ execute: vi.fn() });
    const listarTickets = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.ok({ items: [], total: 0, pagina: 1, porPagina: 20 })),
    };
    const usuarioMasterChecker = { resolverNombres: vi.fn().mockResolvedValue(new Map()) };

    const controller = new TicketsController(
      stub() as Ctor[0],
      stub() as Ctor[1],
      listarTickets as unknown as Ctor[2],
      stub() as Ctor[3],
      stub() as Ctor[4],
      stub() as Ctor[5],
      stub() as Ctor[6],
      stub() as Ctor[7],
      usuarioMasterChecker as unknown as Ctor[8],
    );
    return { controller, listarTickets };
  }

  it('ADMINISTRADOR → pasa modulosPermitidos=null (sin restricción de módulo)', async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(ADMINISTRADOR, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: null }),
    );
  });

  it("usuario normal con modulos=['SOPORTE'] → pasa modulosPermitidos=['SOPORTE']", async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(USUARIO_SOPORTE, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: ['SOPORTE'] }),
    );
  });

  it('ROOT → pasa modulosPermitidos=null (bypass por is_global_admin)', async () => {
    const { controller, listarTickets } = buildController();

    await controller.findAll(ROOT, {});

    expect(listarTickets.execute).toHaveBeenCalledWith(
      expect.objectContaining({ modulosPermitidos: null }),
    );
  });
});

describe('TicketsController — asignación unificada (asignables + asignar-en-proceso)', () => {
  function buildController(overrides: {
    listarTecnicos?: { execute: ReturnType<typeof vi.fn> };
    asignarEnProceso?: { execute: ReturnType<typeof vi.fn> };
  }) {
    const stub = () => ({ execute: vi.fn() });
    const listarTecnicos = overrides.listarTecnicos ?? stub();
    const asignarEnProceso = overrides.asignarEnProceso ?? stub();
    const usuarioMasterChecker = { resolverNombres: vi.fn().mockResolvedValue(new Map()) };

    const controller = new TicketsController(
      stub() as Ctor[0],
      stub() as Ctor[1],
      stub() as Ctor[2],
      stub() as Ctor[3],
      stub() as Ctor[4],
      stub() as Ctor[5],
      stub() as Ctor[6],
      stub() as Ctor[7],
      usuarioMasterChecker as unknown as Ctor[8],
      listarTecnicos as unknown as Ctor[9], // listarTecnicosAsignablesUseCase
      asignarEnProceso as unknown as Ctor[10], // asignarYPonerEnProcesoUseCase
    );
    return { controller, listarTecnicos, asignarEnProceso };
  }

  it('GET :id/asignables → delega con el clienteId del JWT y devuelve la lista de técnicos', async () => {
    const tecnicos = [{ id: 'tec-1', nombre: 'Ana', apellido: 'García' }];
    const listarTecnicos = { execute: vi.fn().mockResolvedValue(Result.ok(tecnicos)) };
    const { controller } = buildController({ listarTecnicos });

    const res = await controller.asignables(USUARIO_SOPORTE, 'ticket-1');

    expect(listarTecnicos.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      clienteId: 'cliente-1',
    });
    expect(res).toEqual(tecnicos);
  });

  it('GET :id/asignables → ticket inexistente propaga 404', async () => {
    const listarTecnicos = {
      execute: vi.fn().mockResolvedValue(Result.fail(new TicketNoEncontradoError('ticket-x'))),
    };
    const { controller } = buildController({ listarTecnicos });

    await expect(controller.asignables(USUARIO_SOPORTE, 'ticket-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PATCH :id/asignar-en-proceso → delega con asignadoId del body + autor/cliente del JWT', async () => {
    const ticket = TicketEntity.create(
      {
        numero: 'SOP-2026-0001',
        titulo: 'Ticket',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e-en-proceso',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'u-sol',
      },
      'ticket-1',
    );
    ticket.assignTo('agente-1');
    const asignarEnProceso = { execute: vi.fn().mockResolvedValue(Result.ok(ticket)) };
    const { controller } = buildController({ asignarEnProceso });

    await controller.asignarEnProceso(USUARIO_SOPORTE, 'ticket-1', { asignadoId: 'agente-1' });

    expect(asignarEnProceso.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      asignadoId: 'agente-1',
      autorId: 'usr-2',
      clienteId: 'cliente-1',
    });
  });
});

describe('TicketsController — bloqueo de edición y salto correctivo (actor flags)', () => {
  function makeTicketEntity(): TicketEntity {
    return TicketEntity.create(
      {
        numero: 'SOP-2026-0001',
        titulo: 'Ticket',
        descripcion: null,
        tipoId: 'ti1',
        estadoId: 'e-en-proceso',
        prioridadId: 'p1',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'u-sol',
      },
      'ticket-1',
    );
  }

  function buildController(overrides: {
    editarTicket?: { execute: ReturnType<typeof vi.fn> };
    transicionar?: { execute: ReturnType<typeof vi.fn> };
  }) {
    const stub = () => ({ execute: vi.fn() });
    const editarTicket = overrides.editarTicket ?? stub();
    const transicionar = overrides.transicionar ?? stub();
    const usuarioMasterChecker = { resolverNombres: vi.fn().mockResolvedValue(new Map()) };

    const controller = new TicketsController(
      stub() as Ctor[0],
      stub() as Ctor[1],
      stub() as Ctor[2],
      editarTicket as unknown as Ctor[3], // editarTicketUseCase
      transicionar as unknown as Ctor[4], // transicionarEstadoUseCase
      stub() as Ctor[5],
      stub() as Ctor[6],
      stub() as Ctor[7],
      usuarioMasterChecker as unknown as Ctor[8],
    );
    return { controller, editarTicket, transicionar };
  }

  it('update: ROOT → delega con actorEsRoot=true', async () => {
    const editarTicket = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ editarTicket });

    await controller.update(ROOT, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ ticketId: 'ticket-1', actorEsRoot: true }),
    );
  });

  it('update: ADMINISTRADOR (no-ROOT) → delega con actorEsRoot=false', async () => {
    const editarTicket = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ editarTicket });

    await controller.update(ADMINISTRADOR, 'ticket-1', { titulo: 'X' });

    expect(editarTicket.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsRoot: false }),
    );
  });

  it('update: TicketBloqueadoParaEdicionError → 403 ForbiddenException', async () => {
    const editarTicket = {
      execute: vi
        .fn()
        .mockResolvedValue(Result.fail(new TicketBloqueadoParaEdicionError('EN_PROCESO'))),
    };
    const { controller } = buildController({ editarTicket });

    await expect(
      controller.update(USUARIO_SOPORTE, 'ticket-1', { titulo: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transicionarEstado: ROOT → actorEsCorrector=true', async () => {
    const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ROOT, 'ticket-1', { nuevoEstadoCodigo: 'ASIGNADO' });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: true }),
    );
  });

  it('transicionarEstado: ADMINISTRADOR → actorEsCorrector=true', async () => {
    const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(ADMINISTRADOR, 'ticket-1', {
      nuevoEstadoCodigo: 'ASIGNADO',
    });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: true }),
    );
  });

  it('transicionarEstado: rol no-ADMINISTRADOR/no-ROOT → actorEsCorrector=false (solo arcos normales)', async () => {
    const transicionar = { execute: vi.fn().mockResolvedValue(Result.ok(makeTicketEntity())) };
    const { controller } = buildController({ transicionar });

    await controller.transicionarEstado(USUARIO_SOPORTE, 'ticket-1', {
      nuevoEstadoCodigo: 'CANCELADO',
    });

    expect(transicionar.execute).toHaveBeenCalledWith(
      expect.objectContaining({ actorEsCorrector: false }),
    );
  });
});
