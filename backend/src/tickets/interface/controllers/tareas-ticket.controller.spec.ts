/**
 * TareasTicketController (odd/tareas-con-tecnico, T3) — unit: el `ActorTarea` que arma el JWT, el
 * mapeo de errores a HTTP y la proyección con nombres. El HTTP real, con guards y base, lo prueba
 * `tareas-ticket.e2e.spec.ts`.
 */
import 'reflect-metadata';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { DomainError } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import {
  TareaAccionNoPermitidaError,
  TareaNoCompletadaError,
  TareaNoEncontradaError,
  TareaYaCompletadaError,
  TecnicoTareaNoElegibleError,
} from '../../domain/errors/tareas.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ListarTecnicosElegiblesTareaUseCase } from '../../application/use-cases/listar-tecnicos-elegibles-tarea.use-case';
import { actorTareaDesdeJwt, modulosConLecturaDesdeJwt } from '../actor-tarea';
import { TareasTicketController, toHttpExceptionTareas } from './tareas-ticket.controller';

describe('actorTareaDesdeJwt', () => {
  it('TECNICO: los módulos con MODIFICACION salen de sus celdas, sin ser administrador', () => {
    const actor = actorTareaDesdeJwt(
      payloadDeTest({
        sub: 'tecnico-uuid',
        cliente_id: 'cliente-uuid',
        rol: 'TECNICO',
        permisos: ['EDILICIA:MODIFICACION', 'TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
      }),
    );

    expect(actor).toEqual({
      id: 'tecnico-uuid',
      esAdministrador: false,
      tienePermisoVerTodos: true,
      modulosConModificacion: ['EDILICIA'],
    });
  });

  it.each([
    ['ADMINISTRADOR', payloadDeTest({ rol: 'ADMINISTRADOR', cliente_id: 'cliente-uuid' })],
    ['ROOT', payloadDeTest({ is_global_admin: true })],
  ])('%s es administrador y tiene MODIFICACION en los cuatro módulos', (_rol, user) => {
    const actor = actorTareaDesdeJwt(user);

    expect(actor.esAdministrador).toBe(true);
    expect(actor.tienePermisoVerTodos).toBe(true);
    expect(actor.modulosConModificacion).toEqual(['TICKETS', 'COMPRAS', 'EDILICIA', 'EQUIPOS']);
  });
});

describe('modulosConLecturaDesdeJwt (T12)', () => {
  it('sale de las celdas <MODULO>:LECTURA del actor; VER_TODOS no cuenta como lectura', () => {
    const user = payloadDeTest({
      sub: 'colaborador-uuid',
      cliente_id: 'cliente-uuid',
      rol: 'COLABORADOR',
      permisos: ['EDILICIA:LECTURA', 'TICKETS:VER_TODOS', 'COMPRAS:MODIFICACION'],
    });

    expect(modulosConLecturaDesdeJwt(user)).toEqual(['EDILICIA']);
  });

  it.each([
    ['ADMINISTRADOR', payloadDeTest({ rol: 'ADMINISTRADOR', cliente_id: 'cliente-uuid' })],
    ['ROOT', payloadDeTest({ is_global_admin: true })],
  ])('%s tiene LECTURA en los cuatro módulos', (_rol, user) => {
    expect(modulosConLecturaDesdeJwt(user)).toEqual(['TICKETS', 'COMPRAS', 'EDILICIA', 'EQUIPOS']);
  });
});

describe('toHttpExceptionTareas', () => {
  it.each<[string, DomainError, new (...args: never[]) => Error]>([
    ['TAREA_NO_ENCONTRADA', new TareaNoEncontradaError('t'), NotFoundException],
    ['TICKET_NO_ENCONTRADO', new TicketNoEncontradoError('t'), NotFoundException],
    ['TAREA_YA_COMPLETADA', new TareaYaCompletadaError('t'), ConflictException],
    ['TAREA_NO_COMPLETADA', new TareaNoCompletadaError('t'), ConflictException],
    ['TAREA_ACCION_NO_PERMITIDA', new TareaAccionNoPermitidaError('crear'), ForbiddenException],
    [
      'TECNICO_TAREA_NO_ELEGIBLE',
      new TecnicoTareaNoElegibleError('u'),
      UnprocessableEntityException,
    ],
  ])('%s → %s', (_codigo, error, esperado) => {
    expect(toHttpExceptionTareas(error)).toBeInstanceOf(esperado);
  });
});

describe('TareasTicketController', () => {
  // La traducción HTTP ↔ caso de uso (actor, cliente, nombres, códigos) la prueba el e2e con la
  // app real; acá queda solo la metadata, que el e2e no puede afirmar en negativo.
  it('ninguna ruta declara @RequiereAcciones: la regla depende del ticket y la aplica el caso de uso', () => {
    const metodos = [
      'listar',
      'tecnicosElegibles',
      'crear',
      'asignar',
      'completar',
      'descompletar',
      'eliminar',
    ] as const;
    for (const metodo of metodos) {
      expect(Reflect.getMetadata(ACCIONES_KEY, TareasTicketController.prototype[metodo])).toBe(
        undefined,
      );
    }
  });
});

describe('ListarTecnicosElegiblesTareaUseCase', () => {
  const ticket = TicketEntity.create(
    {
      numero: 'ED-1',
      titulo: 'Pérdida',
      descripcion: null,
      tipoId: 'tipo-edilicia',
      estadoId: 'estado',
      prioridadId: 'prioridad',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
  ticket.assignTo('responsable-uuid');
  const tipo = TipoTicketEntity.create(
    { codigo: 'EDILICIA', nombre: 'Edilicia', modulo: 'EDILICIA', activo: true },
    'tipo-edilicia',
  );

  function armar() {
    const checker = {
      listarTecnicosAsignables: vi
        .fn()
        .mockResolvedValue([{ id: 'tecnico-uuid', nombre: 'Ana', apellido: 'Gómez' }]),
    };
    const useCase = new ListarTecnicosElegiblesTareaUseCase(
      {
        findById: vi.fn().mockResolvedValue(ticket),
        esVisiblePara: vi.fn().mockResolvedValue(false),
      },
      { findById: vi.fn().mockResolvedValue(tipo) },
      checker,
    );
    return { useCase, checker };
  }

  it('el responsable con el permiso del módulo recibe los elegibles del módulo del tipo', async () => {
    const { useCase, checker } = armar();

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      actor: {
        id: 'responsable-uuid',
        esAdministrador: false,
        tienePermisoVerTodos: true,
        modulosConModificacion: ['EDILICIA'],
      },
    });

    expect(result.getValue()).toEqual([{ id: 'tecnico-uuid', nombre: 'Ana', apellido: 'Gómez' }]);
    expect(checker.listarTecnicosAsignables).toHaveBeenCalledWith('cliente-uuid', 'EDILICIA');
  });

  it('quien no puede asignar recibe el rechazo y master no se consulta', async () => {
    const { useCase, checker } = armar();

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      actor: {
        id: 'otro-uuid',
        esAdministrador: false,
        tienePermisoVerTodos: true,
        modulosConModificacion: ['EDILICIA'],
      },
    });

    expect(result.getError()).toBeInstanceOf(TareaAccionNoPermitidaError);
    expect(checker.listarTecnicosAsignables).not.toHaveBeenCalled();
  });
});
