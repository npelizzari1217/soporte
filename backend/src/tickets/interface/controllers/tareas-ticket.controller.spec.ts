/**
 * TareasTicketController (odd/tareas-con-tecnico, T3) — unit: el `ActorTarea` que arma la capa de
 * interface (JWT más permisos por tipo, odd/permisos-por-tipo-ticket D5 a), el
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
  TareaTicketNoEditableError,
  TareaYaCompletadaError,
  TecnicoTareaNoElegibleError,
} from '../../domain/errors/tareas.errors';
import {
  AccionSobreTipoNoPermitidaError,
  TicketNoEncontradoError,
  TicketSoloComentariosError,
} from '../../domain/errors/tickets.errors';
import { ListarTecnicosElegiblesTareaUseCase } from '../../application/use-cases/listar-tecnicos-elegibles-tarea.use-case';
import { alcancePorTipo, alcanceSinRestriccion } from '../../test-helpers/alcance-ticket';
import { MasterAgentesEnMemoria } from '../../test-helpers/master-agentes-en-memoria';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ElegibilidadAsignado } from '../../application/services/elegibilidad-asignado';
import { actorTareaDesdeAlcance } from '../actor-tarea';
import { TareasTicketController, toHttpExceptionTareas } from './tareas-ticket.controller';

describe('actorTareaDesdeAlcance', () => {
  it('TECNICO: los permisos por tipo salen del alcance cargado, sin ser administrador; las celdas del JWT no cuentan', () => {
    const alcance = alcancePorTipo('tecnico-uuid', {
      'tipo-edilicia': ['LECTURA', 'MODIFICACION'],
    });
    const actor = actorTareaDesdeAlcance(
      payloadDeTest({
        sub: 'tecnico-uuid',
        cliente_id: 'cliente-uuid',
        rol: 'TECNICO',
        permisos: ['EDILICIA:MODIFICACION', 'TICKETS:LECTURA', 'TICKETS:VER_TODOS'],
        modulos: ['EDILICIA', 'TICKETS'],
      }),
      alcance,
    );

    expect(actor).toEqual({
      id: 'tecnico-uuid',
      esAdministrador: false,
      permisosPorTipo: alcance.permisosPorTipo,
    });
  });

  it.each([
    ['ADMINISTRADOR', payloadDeTest({ rol: 'ADMINISTRADOR', cliente_id: 'cliente-uuid' })],
    ['ROOT', payloadDeTest({ is_global_admin: true })],
  ])('%s es administrador y queda sin restricción por tipo', (_rol, user) => {
    const actor = actorTareaDesdeAlcance(user, alcanceSinRestriccion(user.sub));

    expect(actor.esAdministrador).toBe(true);
    expect(actor.permisosPorTipo).toBeNull();
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
      'ACCION_SOBRE_TIPO_NO_PERMITIDA',
      new AccionSobreTipoNoPermitidaError('MODIFICACION'),
      ForbiddenException,
    ],
    [
      'TECNICO_TAREA_NO_ELEGIBLE',
      new TecnicoTareaNoElegibleError('u'),
      UnprocessableEntityException,
    ],
    ['TAREA_TICKET_NO_EDITABLE', new TareaTicketNoEditableError(), UnprocessableEntityException],
    [
      'TICKET_SOLO_COMENTARIOS',
      new TicketSoloComentariosError('RESUELTO'),
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
    // Ana tiene LECTURA sobre el tipo de Edilicia; Beto solo la celda del módulo, que no cuenta.
    const master = new MasterAgentesEnMemoria();
    master.agregar({
      id: 'tecnico-uuid',
      rol: 'TECNICO',
      celdas: [],
      nombre: 'Ana',
      apellido: 'Gómez',
    });
    master.agregar({ id: 'beto-uuid', rol: 'TECNICO', celdas: ['EDILICIA:LECTURA'] });
    const elegibilidad = new ElegibilidadAsignado(
      master,
      new PermisosTipoTicketEnMemoria(
        [],
        [{ usuarioId: 'tecnico-uuid', tipoId: 'tipo-edilicia', accion: 'LECTURA' }],
      ),
    );
    const listarAgentesDeTipo = vi.spyOn(elegibilidad, 'listarAgentesDeTipo');
    const useCase = new ListarTecnicosElegiblesTareaUseCase(
      {
        findById: vi.fn().mockResolvedValue(ticket),
        esVisiblePara: vi.fn().mockResolvedValue(false),
        bloquear: vi.fn().mockResolvedValue(undefined),
      },
      { findById: vi.fn().mockResolvedValue(tipo) },
      elegibilidad,
    );
    return { useCase, listarAgentesDeTipo };
  }

  const PERMISOS = { 'tipo-edilicia': ['LECTURA', 'VER_TODOS', 'MODIFICACION'] } as const;

  it('el responsable con MODIFICACION sobre el tipo recibe los elegibles del tipo', async () => {
    const { useCase, listarAgentesDeTipo } = armar();

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      actor: {
        id: 'responsable-uuid',
        esAdministrador: false,
        permisosPorTipo: alcancePorTipo('responsable-uuid', PERMISOS).permisosPorTipo,
      },
    });

    expect(result.getValue()).toEqual([{ id: 'tecnico-uuid', nombre: 'Ana', apellido: 'Gómez' }]);
    expect(listarAgentesDeTipo).toHaveBeenCalledWith('cliente-uuid', 'tipo-edilicia');
  });

  it('quien no puede asignar recibe el rechazo y la elegibilidad no se consulta', async () => {
    const { useCase, listarAgentesDeTipo } = armar();

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      clienteId: 'cliente-uuid',
      actor: {
        id: 'otro-uuid',
        esAdministrador: false,
        permisosPorTipo: alcancePorTipo('otro-uuid', PERMISOS).permisosPorTipo,
      },
    });

    expect(result.getError()).toBeInstanceOf(TareaAccionNoPermitidaError);
    expect(listarAgentesDeTipo).not.toHaveBeenCalled();
  });
});
