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
import { ForbiddenException } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';

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

const ROOT: JwtPayload = {
  sub: 'root-1',
  cliente_id: 'cliente-1',
  rol: null,
  permisos: [], // ROOT scopeado a un tenant sin membresía → sin permisos de rol
  is_global_admin: true,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: [], // ROOT no necesita módulos: bypassa por is_global_admin
};

const USUARIO_SIN_OBSERVAR: JwtPayload = {
  sub: 'usr-1',
  cliente_id: 'cliente-1',
  rol: 'USUARIO',
  permisos: ['ticket:comentar'], // tiene comentar, NO observar
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: ['SOPORTE'],
};

const ADMINISTRADOR: JwtPayload = {
  sub: 'admin-1',
  cliente_id: 'cliente-1',
  rol: 'ADMINISTRADOR',
  permisos: ['ticket:ver_todos'],
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: ['SOPORTE', 'COMPRAS', 'EDILICIA', 'EQUIPOS'],
};

const USUARIO_SOPORTE: JwtPayload = {
  sub: 'usr-2',
  cliente_id: 'cliente-1',
  rol: 'USUARIO',
  permisos: [],
  is_global_admin: false,
  cliente_nombre: 'Cliente 1',
  membresias: [],
  modulos: ['SOPORTE'],
};

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
