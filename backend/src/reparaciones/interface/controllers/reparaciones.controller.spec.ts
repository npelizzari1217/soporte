/**
 * T8.6/T9.6 [CONTROLLER][RED→GREEN] — `ReparacionesController`.
 *
 * Unit test: instancia el controller directamente con use cases mockeados
 * (sin bootstrapear NestJS ni pasar por guards/ValidationPipe — mismo
 * patrón que `compras.controller.spec.ts`). Verifica: traducción HTTP ↔ use
 * case, mapeo de errores de dominio → HttpException, y que cada endpoint
 * protegido declara el `@RequirePermissions(...)` correcto — la lógica de
 * 403 del `PermissionsGuard` en sí ya está cubierta genéricamente por
 * `permissions.guard.spec.ts`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4, F3-E5.
 * Tarea: T8.6, T9.6.
 */
import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ReparacionesController } from './reparaciones.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { SubtareaEdiliciaEntity } from '../../domain/entities/subtarea-edilicia.entity';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import {
  SolicitanteInvalidoError,
  SinCicloActivoError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  TicketEdiliciaNoEncontradoError,
  SubtareaNoEncontradaError,
} from '../../domain/errors/reparaciones.errors';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';

const USER = payloadDeTest({
  sub: 'usuario-uuid',
  cliente_id: 'cliente-uuid',
  rol: 'TECNICO',
  permisos: ['ticket:crear', 'subtarea:actualizar'],
  cliente_nombre: 'Cliente Test',
});

function makeTicket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'EDI-2026-00001',
      titulo: 'Reparar cañería',
      descripcion: null,
      tipoId: 'tipo-edilicia-uuid',
      estadoId: 'estado-nuevo-uuid',
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'usuario-uuid',
    },
    'ticket-uuid',
  );
}

describe('ReparacionesController (T8.6, T9.6)', () => {
  function buildController() {
    const crearTicketEdilicioUseCase = { execute: vi.fn() };
    const listarReparacionesUseCase = { execute: vi.fn() };
    const crearSubtareaUseCase = { execute: vi.fn() };
    const completarSubtareaUseCase = { execute: vi.fn() };
    const eliminarSubtareaUseCase = { execute: vi.fn() };
    const crearComentarioUseCase = { execute: vi.fn() };
    const listarComentariosUseCase = { execute: vi.fn() };
    // Default: master no resuelve ningún nombre (usuario dado de baja) — los
    // tests que verifican el enriquecimiento lo sobrescriben.
    const usuarioMasterChecker = { resolverNombres: vi.fn().mockResolvedValue(new Map()) };

    const controller = new ReparacionesController(
      crearTicketEdilicioUseCase as any,
      listarReparacionesUseCase as any,
      crearSubtareaUseCase as any,
      completarSubtareaUseCase as any,
      eliminarSubtareaUseCase as any,
      crearComentarioUseCase as any,
      listarComentariosUseCase as any,
      usuarioMasterChecker as any,
    );

    return {
      controller,
      crearTicketEdilicioUseCase,
      listarReparacionesUseCase,
      crearSubtareaUseCase,
      completarSubtareaUseCase,
      eliminarSubtareaUseCase,
      crearComentarioUseCase,
      listarComentariosUseCase,
      usuarioMasterChecker,
    };
  }

  describe('POST /reparaciones', () => {
    it('crea el ticket edilicio → response unificado', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      const ticket = makeTicket();
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: 'Edificio Central' },
        'edilicia-uuid',
      );
      crearTicketEdilicioUseCase.execute.mockResolvedValue(Result.ok({ ticket, ticketEdilicia }));

      const result = await controller.crear(
        {
          titulo: 'Reparar cañería',
          descripcion: null,
          prioridadId: 'prioridad-uuid',
          ubicacion: 'Edificio Central',
        } as any,
        USER,
      );

      expect(result.id).toBe('edilicia-uuid');
      expect(result.numero).toBe('EDI-2026-00001');
      expect(crearTicketEdilicioUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          titulo: 'Reparar cañería',
          ubicacion: 'Edificio Central',
          solicitanteId: 'usuario-uuid',
          clienteId: 'cliente-uuid',
          autorId: 'usuario-uuid',
        }),
      );
    });

    it('mapea SolicitanteInvalidoError → 422', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('usuario-uuid')),
      );

      await expect(
        controller.crear(
          { titulo: 'X', descripcion: null, prioridadId: 'p', ubicacion: null } as any,
          USER,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('mapea SinCicloActivoError → 409 (ConflictException)', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      crearTicketEdilicioUseCase.execute.mockResolvedValue(Result.fail(new SinCicloActivoError()));

      await expect(
        controller.crear(
          { titulo: 'X', descripcion: null, prioridadId: 'p', ubicacion: null } as any,
          USER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('declara @RequiereAcciones("EDILICIA:ALTAS")', () => {
      const permisos = Reflect.getMetadata(ACCIONES_KEY, ReparacionesController.prototype.crear);
      expect(permisos).toEqual(['EDILICIA:ALTAS']);
    });
  });

  describe('GET /reparaciones', () => {
    it('lista las reparaciones del tenant', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const ticket = makeTicket();
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: 'Edificio Central' },
        'edilicia-uuid',
      );
      listarReparacionesUseCase.execute.mockResolvedValue(
        Result.ok([{ ticket, ticketEdilicia, subtareas: [] }]),
      );

      const result = await controller.listar();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('edilicia-uuid');
      expect(result[0].subtareas).toEqual([]);
    });

    it('embebe las subtareas activas del ticket_edilicia (item 1 — G7)', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const ticket = makeTicket();
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: 'Edificio Central' },
        'edilicia-uuid',
      );
      const subtarea = SubtareaEdiliciaEntity.create(
        { ticketEdiliciaId: 'edilicia-uuid', descripcion: 'Cambiar cañería', orden: 0 },
        'subtarea-uuid',
      );
      listarReparacionesUseCase.execute.mockResolvedValue(
        Result.ok([{ ticket, ticketEdilicia, subtareas: [subtarea] }]),
      );

      const result = await controller.listar();

      expect(result[0].subtareas).toHaveLength(1);
      expect(result[0].subtareas[0].id).toBe('subtarea-uuid');
      expect(result[0].subtareas[0].descripcion).toBe('Cambiar cañería');
    });

    it('declara @RequiereAcciones("EDILICIA:LECTURA") (WU-7.3: reemplaza el gate de módulo puro)', () => {
      const permisos = Reflect.getMetadata(ACCIONES_KEY, ReparacionesController.prototype.listar);
      expect(permisos).toEqual(['EDILICIA:LECTURA']);
    });
  });

  describe('POST /reparaciones/:reparacionId/subtareas', () => {
    it('crea la subtarea', async () => {
      const { controller, crearSubtareaUseCase } = buildController();
      const subtarea = SubtareaEdiliciaEntity.create(
        { ticketEdiliciaId: 'edilicia-uuid', descripcion: 'Reparar cañería' },
        'subtarea-uuid',
      );
      crearSubtareaUseCase.execute.mockResolvedValue(Result.ok(subtarea));

      const result = await controller.crearSubtarea(
        'edilicia-uuid',
        { descripcion: 'Reparar cañería' } as any,
        USER,
      );

      expect(result.id).toBe('subtarea-uuid');
      expect(crearSubtareaUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          ticketEdiliciaId: 'edilicia-uuid',
          descripcion: 'Reparar cañería',
        }),
      );
    });

    it('mapea TicketEdiliciaNoEncontradoError → 404', async () => {
      const { controller, crearSubtareaUseCase } = buildController();
      crearSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new TicketEdiliciaNoEncontradoError('edilicia-uuid')),
      );

      await expect(
        controller.crearSubtarea('edilicia-uuid', { descripcion: 'X' } as any, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('declara @RequiereAcciones("EDILICIA:ALTAS")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.crearSubtarea,
      );
      expect(permisos).toEqual(['EDILICIA:ALTAS']);
    });
  });

  describe('POST /reparaciones/subtareas/:subtareaId/completar', () => {
    it('completa la subtarea', async () => {
      const { controller, completarSubtareaUseCase } = buildController();
      const subtarea = SubtareaEdiliciaEntity.create(
        { ticketEdiliciaId: 'edilicia-uuid', descripcion: 'X' },
        'subtarea-uuid',
      );
      subtarea.completar(USER.sub);
      completarSubtareaUseCase.execute.mockResolvedValue(Result.ok(subtarea));

      const result = await controller.completarSubtarea('subtarea-uuid', USER);

      expect(result.completada).toBe(true);
      expect(completarSubtareaUseCase.execute).toHaveBeenCalledWith({
        subtareaId: 'subtarea-uuid',
        completadaPorId: 'usuario-uuid',
      });
    });

    it('mapea SubtareaNoEncontradaError → 404', async () => {
      const { controller, completarSubtareaUseCase } = buildController();
      completarSubtareaUseCase.execute.mockResolvedValue(
        Result.fail(new SubtareaNoEncontradaError('subtarea-uuid')),
      );

      await expect(controller.completarSubtarea('subtarea-uuid', USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('declara @RequiereAcciones("EDILICIA:MODIFICACION")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.completarSubtarea,
      );
      expect(permisos).toEqual(['EDILICIA:MODIFICACION']);
    });
  });

  describe('DELETE /reparaciones/subtareas/:subtareaId', () => {
    it('elimina la subtarea', async () => {
      const { controller, eliminarSubtareaUseCase } = buildController();
      eliminarSubtareaUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.eliminarSubtarea('subtarea-uuid', USER);

      expect(eliminarSubtareaUseCase.execute).toHaveBeenCalledWith({
        subtareaId: 'subtarea-uuid',
        autorId: 'usuario-uuid',
      });
    });

    it('declara @RequiereAcciones("EDILICIA:BORRADO")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.eliminarSubtarea,
      );
      expect(permisos).toEqual(['EDILICIA:BORRADO']);
    });
  });

  describe('POST /reparaciones/:reparacionId/comentarios', () => {
    it('crea el comentario con el autorId del JWT y resuelve el nombre del autor', async () => {
      const { controller, crearComentarioUseCase, usuarioMasterChecker } = buildController();
      const comentario = ComentarioReparacionEntity.create(
        {
          ticketEdiliciaId: 'edilicia-uuid',
          texto: 'Falta el repuesto X',
          autorId: 'usuario-uuid',
        },
        'comentario-uuid',
      );
      crearComentarioUseCase.execute.mockResolvedValue(Result.ok(comentario));
      usuarioMasterChecker.resolverNombres.mockResolvedValue(
        new Map([['usuario-uuid', { nombre: 'Ana', apellido: 'Gómez' }]]),
      );

      const result = await controller.crearComentario(
        'edilicia-uuid',
        { texto: 'Falta el repuesto X' } as any,
        USER,
      );

      expect(result.id).toBe('comentario-uuid');
      expect(result.autorNombre).toBe('Ana');
      expect(result.autorApellido).toBe('Gómez');
      expect(crearComentarioUseCase.execute).toHaveBeenCalledWith({
        ticketEdiliciaId: 'edilicia-uuid',
        texto: 'Falta el repuesto X',
        autorId: 'usuario-uuid',
      });
    });

    it('mapea TicketEdiliciaNoEncontradoError → 404', async () => {
      const { controller, crearComentarioUseCase } = buildController();
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.fail(new TicketEdiliciaNoEncontradoError('edilicia-uuid')),
      );

      await expect(
        controller.crearComentario('edilicia-uuid', { texto: 'X' } as any, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('declara @RequiereAcciones("EDILICIA:ALTAS")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.crearComentario,
      );
      expect(permisos).toEqual(['EDILICIA:ALTAS']);
    });
  });

  describe('GET /reparaciones/:reparacionId/comentarios', () => {
    it('resuelve los nombres en UN solo batch sin ids repetidos (sin N+1)', async () => {
      const { controller, listarComentariosUseCase, usuarioMasterChecker } = buildController();
      const props = { ticketEdiliciaId: 'edilicia-uuid', autorId: 'usuario-uuid' };
      listarComentariosUseCase.execute.mockResolvedValue(
        Result.ok([
          ComentarioReparacionEntity.create({ ...props, texto: 'Sigue sin llegar' }, 'c2'),
          ComentarioReparacionEntity.create({ ...props, texto: 'Se pidió el repuesto' }, 'c1'),
        ]),
      );
      usuarioMasterChecker.resolverNombres.mockResolvedValue(
        new Map([['usuario-uuid', { nombre: 'Ana', apellido: 'Gómez' }]]),
      );

      const result = await controller.listarComentarios('edilicia-uuid');

      expect(result.map((c) => c.id)).toEqual(['c2', 'c1']);
      expect(result.every((c) => c.autorNombre === 'Ana')).toBe(true);
      expect(usuarioMasterChecker.resolverNombres).toHaveBeenCalledTimes(1);
      expect(usuarioMasterChecker.resolverNombres).toHaveBeenCalledWith(['usuario-uuid']);
    });

    it('deja autorNombre/autorApellido en null cuando master no resuelve al autor (usuario dado de baja)', async () => {
      const { controller, listarComentariosUseCase } = buildController();
      listarComentariosUseCase.execute.mockResolvedValue(
        Result.ok([
          ComentarioReparacionEntity.create(
            { ticketEdiliciaId: 'edilicia-uuid', texto: 'Demorado', autorId: 'baja-uuid' },
            'c1',
          ),
        ]),
      );

      const result = await controller.listarComentarios('edilicia-uuid');

      expect(result[0].autorId).toBe('baja-uuid');
      expect(result[0].autorNombre).toBeNull();
      expect(result[0].autorApellido).toBeNull();
    });

    it('mapea TicketEdiliciaNoEncontradoError → 404', async () => {
      const { controller, listarComentariosUseCase } = buildController();
      listarComentariosUseCase.execute.mockResolvedValue(
        Result.fail(new TicketEdiliciaNoEncontradoError('edilicia-uuid')),
      );

      await expect(controller.listarComentarios('edilicia-uuid')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('declara @RequiereAcciones("EDILICIA:LECTURA")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.listarComentarios,
      );
      expect(permisos).toEqual(['EDILICIA:LECTURA']);
    });
  });
});
