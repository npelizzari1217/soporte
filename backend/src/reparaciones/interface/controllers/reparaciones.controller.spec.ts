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
import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
  StreamableFile,
} from '@nestjs/common';
import { ReparacionesController, toHttpException } from './reparaciones.controller';
import { accionesPorRuta } from '../../../shared/test-helpers/acciones-por-ruta';
import { CargadorAlcanceTicket } from '../../../tickets/interface/alcance-ticket';
import { PermisosTipoTicketEnMemoria } from '../../../tickets/test-helpers/permisos-tipo-ticket-en-memoria';
import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import {
  AccionSobreTipoNoPermitidaError,
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  TipoTicketNoPermitidoEnAltaError,
  SinCicloActivoError,
  TicketNoEncontradoError,
  TicketSoloComentariosError,
} from '../../../tickets/domain/errors/tickets.errors';
import { ReparacionNoEditableError } from '../../domain/errors/reparaciones.errors';
import * as ReparacionesErrors from '../../domain/errors/reparaciones.errors';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { unstubbed } from '../../../testing/mocks';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { CrearTicketEdilicioUseCase } from '../../application/use-cases/crear-ticket-edilicio.use-case';
import {
  ListarReparacionesUseCase,
  type ReparacionConTicket,
} from '../../application/use-cases/listar-reparaciones.use-case';
import { CrearComentarioUseCase } from '../../../tickets/application/use-cases/crear-comentario.use-case';
import { ListarComentariosReparacionUseCase } from '../../application/use-cases/listar-comentarios-reparacion.use-case';
import { ExportarReparacionesUseCase } from '../../application/use-cases/exportar-reparaciones.use-case';
import { EditarReparacionUseCase } from '../../application/use-cases/editar-reparacion.use-case';
import { espiado, type Espiado } from '../../../shared/test-helpers/espiado';

const USER = payloadDeTest({
  sub: 'usuario-uuid',
  cliente_id: 'cliente-uuid',
  rol: 'TECNICO',
  permisos: ['ticket:crear', 'subtarea:actualizar'],
  cliente_nombre: 'Cliente Test',
});

/**
 * Permisos por tipo de `usuario-uuid` en la tabla del tenant (odd/permisos-por-tipo-ticket, D5 a):
 * ve y modifica el tipo EDILICIA. El controller los carga y los pasa; deciden los casos de uso.
 */
const ALCANCE_USER = {
  actorId: 'usuario-uuid',
  permisosPorTipo: new Map([['tipo-edilicia-uuid', new Set(['LECTURA', 'MODIFICACION'])]]),
};

/** Cargador real sobre la tabla en memoria con las filas de `ALCANCE_USER`. */
function cargadorDeAlcance(): CargadorAlcanceTicket {
  return new CargadorAlcanceTicket(
    new PermisosTipoTicketEnMemoria(
      [],
      [
        { usuarioId: 'usuario-uuid', tipoId: 'tipo-edilicia-uuid', accion: 'LECTURA' },
        { usuarioId: 'usuario-uuid', tipoId: 'tipo-edilicia-uuid', accion: 'MODIFICACION' },
      ],
    ),
  );
}

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

/** Un COMENTARIO del timeline del ticket (odd/ticket-unificado, S3). */
function comentario(id: string, texto: string, autorId = 'usuario-uuid'): OperacionTicketEntity {
  return OperacionTicketEntity.create(
    {
      ticketId: 'ticket-uuid',
      tipoOperacionId: 'tipo-op-comentario',
      descripcion: texto,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId,
      esInterno: false,
      metadata: null,
    },
    id,
  );
}

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

/**
 * Checker de master completo: el controller solo usa `resolverNombres`; el
 * resto falla si producción empieza a llamarlo.
 */
function usuarioMasterCheckerFalso() {
  return {
    existeEnTenant: unstubbed('usuarioMasterChecker.existeEnTenant'),
    estaActivoEnTenant: unstubbed('usuarioMasterChecker.estaActivoEnTenant'),
    resolverNombres: vi.fn<IUsuarioMasterChecker['resolverNombres']>().mockResolvedValue(new Map()),
    listarAgentes: unstubbed('usuarioMasterChecker.listarAgentes'),
  };
}

describe('ReparacionesController (T8.6, T9.6)', () => {
  function buildController() {
    const crearTicketEdilicioUseCase = espiado(CrearTicketEdilicioUseCase);
    const listarReparacionesUseCase = espiado(ListarReparacionesUseCase);
    const crearComentarioUseCase = espiado(CrearComentarioUseCase);
    const listarComentariosUseCase = espiado(ListarComentariosReparacionUseCase);
    // Default: master no resuelve ningún nombre (usuario dado de baja) — los
    // tests que verifican el enriquecimiento lo sobrescriben.
    const usuarioMasterChecker = usuarioMasterCheckerFalso();
    const exportarReparacionesUseCase = espiado(ExportarReparacionesUseCase);
    const editarReparacionUseCase = espiado(EditarReparacionUseCase);

    const controller = new ReparacionesController(
      crearTicketEdilicioUseCase.caso,
      listarReparacionesUseCase.caso,
      crearComentarioUseCase.caso,
      listarComentariosUseCase.caso,
      usuarioMasterChecker,
      exportarReparacionesUseCase.caso,
      editarReparacionUseCase.caso,
      cargadorDeAlcance(),
    );

    return {
      controller,
      crearTicketEdilicioUseCase,
      listarReparacionesUseCase,
      crearComentarioUseCase,
      listarComentariosUseCase,
      usuarioMasterChecker,
      exportarReparacionesUseCase,
      editarReparacionUseCase,
    };
  }

  describe('POST /reparaciones', () => {
    it('crea el ticket edilicio → response unificado', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      const ticket = makeTicket();
      ticket.actualizarDatos({ ubicacion: 'Edificio Central' });
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, sectorNombre: null }),
      );

      const result = await controller.crear(
        {
          titulo: 'Reparar cañería',
          descripcion: null,
          prioridadId: 'prioridad-uuid',
          ubicacion: 'Edificio Central',
        },
        USER,
      );

      // `id` es el del ticket desde odd/ticket-unificado; la ubicación, la del ticket.
      expect(result.id).toBe('ticket-uuid');
      expect(result.ticketId).toBe('ticket-uuid');
      expect(result.ubicacion).toBe('Edificio Central');
      expect(result.numero).toBe('EDI-2026-00001');
      // Una reparación recién creada no tiene tareas; `personalAsignadoId` se retiró en T8 (CA9).
      expect(result.porcentajeAvance).toBe(0);
      expect(result).not.toHaveProperty('personalAsignadoId');
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

    it('con sector: lo pasa al caso de uso y responde sectorId y sectorNombre (odd/ubicacion-sector-ticket)', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      const ticket = makeTicket();
      ticket.actualizarDatos({ sectorId: 'sector-uuid', ubicacion: 'Patio' });
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, sectorNombre: 'Mantenimiento' }),
      );

      const result = await controller.crear(
        { titulo: 'Reparar', prioridadId: 'prioridad-uuid', sectorId: 'sector-uuid' },
        USER,
      );

      expect(crearTicketEdilicioUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ sectorId: 'sector-uuid' }),
      );
      expect(result).toMatchObject({
        ubicacion: 'Patio',
        sectorId: 'sector-uuid',
        sectorNombre: 'Mantenimiento',
      });
    });

    it('pasa el tipoId elegido al caso de uso, y null si no viene (S2)', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      const ticket = makeTicket();
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, sectorNombre: null }),
      );

      await controller.crear({ titulo: 'X', prioridadId: 'p', tipoId: 'tipo-uuid' }, USER);
      await controller.crear({ titulo: 'X', prioridadId: 'p' }, USER);

      expect(crearTicketEdilicioUseCase.execute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tipoId: 'tipo-uuid' }),
      );
      expect(crearTicketEdilicioUseCase.execute).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ tipoId: null }),
      );
    });

    it('mapea TipoTicketNoPermitidoEnAltaError y TipoTicketNoEncontradoError → 422 (S2)', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      crearTicketEdilicioUseCase.execute
        .mockResolvedValueOnce(Result.fail(new TipoTicketNoPermitidoEnAltaError('PREVENTIVO')))
        .mockResolvedValueOnce(Result.fail(new TipoTicketNoEncontradoError('tipo-uuid')));

      await expect(
        controller.crear({ titulo: 'X', prioridadId: 'p', tipoId: 'tipo-uuid' }, USER),
      ).rejects.toThrow(
        new UnprocessableEntityException(
          'El tipo de ticket "PREVENTIVO" no admite altas manuales.',
        ),
      );
      await expect(
        controller.crear({ titulo: 'X', prioridadId: 'p', tipoId: 'tipo-uuid' }, USER),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('mapea SolicitanteInvalidoError → 422', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.fail(new SolicitanteInvalidoError('usuario-uuid')),
      );

      await expect(
        controller.crear(
          { titulo: 'X', descripcion: null, prioridadId: 'p', ubicacion: null },
          USER,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('mapea SinCicloActivoError → 409 (ConflictException)', async () => {
      const { controller, crearTicketEdilicioUseCase } = buildController();
      crearTicketEdilicioUseCase.execute.mockResolvedValue(Result.fail(new SinCicloActivoError()));

      await expect(
        controller.crear(
          { titulo: 'X', descripcion: null, prioridadId: 'p', ubicacion: null },
          USER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('GET /reparaciones', () => {
    /** Envuelve los items en la forma de página que devuelve el caso de uso. */
    function pagina(items: ReparacionConTicket[]) {
      return { items, total: items.length, pagina: 1, porPagina: 20 };
    }

    it('pide la página con los defaults (1, 20, TODAS, sin tipo) y devuelve items mapeados con la metadata', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const spy = vi
        .spyOn(listarReparacionesUseCase.caso, 'executePaginado')
        .mockResolvedValue(Result.ok({ items: [], total: 57, pagina: 1, porPagina: 20 }));

      const respuesta = await controller.listar(USER, {});

      expect(spy).toHaveBeenCalledWith({
        pagina: 1,
        porPagina: 20,
        bloqueo: 'TODAS',
        tipoId: null,
        alcance: ALCANCE_USER,
      });
      expect(respuesta).toEqual({ items: [], total: 57, pagina: 1, porPagina: 20 });
    });

    it('pasa al caso de uso la página, el tamaño y el filtro de la query', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const spy = vi
        .spyOn(listarReparacionesUseCase.caso, 'executePaginado')
        .mockResolvedValue(Result.ok({ items: [], total: 0, pagina: 3, porPagina: 5 }));

      await controller.listar(USER, {
        pagina: 3,
        porPagina: 5,
        bloqueo: 'BLOQUEADAS',
        tipo: 'tipo-soporte-uuid',
      });

      // El tipo del selector de la pantalla (odd/ticket-unificado, S2).
      expect(spy).toHaveBeenCalledWith({
        pagina: 3,
        porPagina: 5,
        bloqueo: 'BLOQUEADAS',
        tipoId: 'tipo-soporte-uuid',
        alcance: ALCANCE_USER,
      });
    });

    it('lista los tickets con el id y la ubicación del ticket', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const ticket = makeTicket();
      ticket.actualizarDatos({ sectorId: 'sector-uuid', ubicacion: 'Edificio Central' });
      vi.spyOn(listarReparacionesUseCase.caso, 'executePaginado').mockResolvedValue(
        Result.ok(
          pagina([
            {
              ticket,
              subtareas: [],
              porcentajeAvance: 0,
              cantidadComentarios: 2,
              bloqueada: false,
              comprasQueBloquean: [],
              sectorNombre: 'Mantenimiento',
            },
          ]),
        ),
      );

      const { items: result } = await controller.listar(USER, {});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('ticket-uuid');
      expect(result[0].ticketId).toBe('ticket-uuid');
      expect(result[0].subtareas).toEqual([]);
      // El listado expone SÓLO el conteo — los comentarios tienen su GET propio.
      expect(result[0].cantidadComentarios).toBe(2);
      expect(result[0]).toMatchObject({
        ubicacion: 'Edificio Central',
        sectorId: 'sector-uuid',
        sectorNombre: 'Mantenimiento',
        // El frontend gatea cada fila por el tipo del ticket base (odd/permisos-por-tipo-ticket, T6).
        tipoId: 'tipo-edilicia-uuid',
      });
    });

    it('embebe las subtareas activas, que ahora son las tareas del ticket, con su avance (odd/tareas-con-tecnico T3)', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const ticket = makeTicket();
      const tarea = TareaTicketEntity.crear(
        { ticketId: ticket.id, descripcion: 'Cambiar cañería', orden: 0 },
        'subtarea-uuid',
      );
      vi.spyOn(listarReparacionesUseCase.caso, 'executePaginado').mockResolvedValue(
        Result.ok(
          pagina([
            {
              ticket,
              subtareas: [tarea],
              porcentajeAvance: 37.5,
              cantidadComentarios: 0,
              bloqueada: false,
              comprasQueBloquean: [],
              sectorNombre: null,
            },
          ]),
        ),
      );

      const { items: result } = await controller.listar(USER, {});

      expect(result[0].porcentajeAvance).toBe(37.5);
      expect(result[0]).not.toHaveProperty('personalAsignadoId');
      expect(result[0].subtareas).toHaveLength(1);
      expect(Object.keys(result[0].subtareas[0]).sort()).toEqual(CAMPOS_SUBTAREA);
      expect(result[0].subtareas[0]).toMatchObject({
        id: 'subtarea-uuid',
        ticketEdiliciaId: 'ticket-uuid',
        descripcion: 'Cambiar cañería',
        completada: false,
      });
    });
  });

  it.each(['crearSubtarea', 'completarSubtarea', 'eliminarSubtarea'])(
    'ya no expone la ruta vieja %s (odd/tareas-con-tecnico T8): las tareas viven en /tickets/:id/tareas',
    (metodo) => {
      expect(metodo in ReparacionesController.prototype).toBe(false);
    },
  );

  it.each(['vincularCompra', 'desvincularCompra'])(
    'ya no expone el alias %s (odd/ticket-unificado T4a): las compras viven en /tickets/:ticketId/compras',
    (metodo) => {
      expect(metodo in ReparacionesController.prototype).toBe(false);
    },
  );

  describe('POST /reparaciones/:reparacionId/comentarios', () => {
    it('crea un comentario INTERNO del ticket con el caso de uso de Tickets, con el autorId del JWT, y resuelve el nombre del autor (L19)', async () => {
      const { controller, crearComentarioUseCase, usuarioMasterChecker } = buildController();
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.ok(comentario('comentario-uuid', 'Falta el repuesto X')),
      );
      usuarioMasterChecker.resolverNombres.mockResolvedValue(
        new Map([['usuario-uuid', { nombre: 'Ana', apellido: 'Gómez' }]]),
      );

      const result = await controller.crearComentario(
        'ticket-uuid',
        { texto: 'Falta el repuesto X' },
        USER,
      );

      expect(result).toEqual({
        id: 'comentario-uuid',
        ticketEdiliciaId: 'ticket-uuid',
        texto: 'Falta el repuesto X',
        autorId: 'usuario-uuid',
        autorNombre: 'Ana',
        autorApellido: 'Gómez',
        createdAt: expect.any(String),
      });
      // El mismo DTO que `POST /tickets/:id/comentarios` con `esInterno: true`: mismo permiso
      // (COMENTAR y OBSERVAR sobre el tipo), mismas reglas y sin evento ni primera respuesta.
      expect(crearComentarioUseCase.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-uuid',
        texto: 'Falta el repuesto X',
        autorId: 'usuario-uuid',
        esInterno: true,
        ...ALCANCE_USER,
      });
    });

    it('el id de la ruta es el del ticket: no se traduce desde el satélite viejo (T4a)', async () => {
      const { controller, crearComentarioUseCase } = buildController();
      crearComentarioUseCase.execute.mockResolvedValue(Result.ok(comentario('c1', 'X')));

      await controller.crearComentario('edilicia-uuid', { texto: 'X' }, USER);

      expect(crearComentarioUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ ticketId: 'edilicia-uuid' }),
      );
    });

    it('un ticket que no existe o no ve llega como 404 que nombra la reparación pedida', async () => {
      const { controller, crearComentarioUseCase } = buildController();
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-uuid')),
      );

      await expect(controller.crearComentario('ticket-uuid', { texto: 'X' }, USER)).rejects.toThrow(
        new NotFoundException('Ticket edilicio con id "ticket-uuid" no encontrado.'),
      );
    });

    it('sin OBSERVAR sobre el tipo → 403 con el mensaje del caso de uso de Tickets', async () => {
      const { controller, crearComentarioUseCase } = buildController();
      const error = new AccionSobreTipoNoPermitidaError('OBSERVAR');
      crearComentarioUseCase.execute.mockResolvedValue(Result.fail(error));

      await expect(controller.crearComentario('ticket-uuid', { texto: 'X' }, USER)).rejects.toThrow(
        new ForbiddenException(error.message),
      );
    });
  });

  describe('GET /reparaciones/:reparacionId/comentarios', () => {
    it('resuelve los nombres en UN solo batch sin ids repetidos (sin N+1)', async () => {
      const { controller, listarComentariosUseCase, usuarioMasterChecker } = buildController();
      listarComentariosUseCase.execute.mockResolvedValue(
        Result.ok([comentario('c2', 'Sigue sin llegar'), comentario('c1', 'Se pidió el repuesto')]),
      );
      usuarioMasterChecker.resolverNombres.mockResolvedValue(
        new Map([['usuario-uuid', { nombre: 'Ana', apellido: 'Gómez' }]]),
      );

      const result = await controller.listarComentarios('ticket-uuid', USER);

      expect(result.map((c) => c.id)).toEqual(['c2', 'c1']);
      expect(result.map((c) => c.texto)).toEqual(['Sigue sin llegar', 'Se pidió el repuesto']);
      expect(result.every((c) => c.autorNombre === 'Ana')).toBe(true);
      expect(listarComentariosUseCase.execute).toHaveBeenCalledWith('ticket-uuid', ALCANCE_USER);
      expect(usuarioMasterChecker.resolverNombres).toHaveBeenCalledTimes(1);
      expect(usuarioMasterChecker.resolverNombres).toHaveBeenCalledWith(['usuario-uuid']);
    });

    it('deja autorNombre/autorApellido en null cuando master no resuelve al autor (usuario dado de baja)', async () => {
      const { controller, listarComentariosUseCase } = buildController();
      listarComentariosUseCase.execute.mockResolvedValue(
        Result.ok([comentario('c1', 'Demorado', 'baja-uuid')]),
      );

      const result = await controller.listarComentarios('ticket-uuid', USER);

      expect(result[0].autorId).toBe('baja-uuid');
      expect(result[0].autorNombre).toBeNull();
      expect(result[0].autorApellido).toBeNull();
    });

    it('un ticket que el actor no ve → 404', async () => {
      const { controller, listarComentariosUseCase } = buildController();
      listarComentariosUseCase.execute.mockResolvedValue(
        Result.fail(new TicketNoEncontradoError('ticket-uuid')),
      );

      await expect(controller.listarComentarios('ticket-uuid', USER)).rejects.toThrow(
        new NotFoundException('Ticket edilicio con id "ticket-uuid" no encontrado.'),
      );
    });
  });

  describe('PATCH /reparaciones/:reparacionId (odd/detalle-ticket-legible, S4-S5)', () => {
    const ticket = TicketEntity.create(
      {
        numero: 'EDI-2026-000001',
        titulo: 'Titulo nuevo',
        descripcion: null,
        tipoId: 'tipo-edilicia',
        estadoId: 'estado-nuevo',
        prioridadId: 'prioridad-media',
        cicloId: null,
        ticketReferenciaId: null,
        solicitanteId: 'usuario-uuid',
        ubicacion: 'Aula 3',
      },
      'ticket-uuid',
    );

    it('pasa los campos del body, el ticket de la reparación y actorEsRoot al caso de uso y responde el shape unificado', async () => {
      const { controller, editarReparacionUseCase } = buildController();
      editarReparacionUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, sectorNombre: 'Secundario' }),
      );

      const respuesta = await controller.editar(
        'ticket-uuid',
        { titulo: 'Titulo nuevo', ubicacion: 'Aula 3', sectorId: 'sector-uuid' },
        USER,
      );

      expect(editarReparacionUseCase.execute).toHaveBeenCalledWith({
        ticketId: 'ticket-uuid',
        titulo: 'Titulo nuevo',
        descripcion: undefined,
        prioridadId: undefined,
        ubicacion: 'Aula 3',
        sectorId: 'sector-uuid',
        actorEsRoot: false,
        alcance: ALCANCE_USER,
      });
      expect(respuesta).toMatchObject({
        id: 'ticket-uuid',
        ticketId: 'ticket-uuid',
        tipoId: 'tipo-edilicia',
        titulo: 'Titulo nuevo',
        ubicacion: 'Aula 3',
        sectorNombre: 'Secundario',
      });
    });

    it('ROOT viaja como actorEsRoot: true', async () => {
      const { controller, editarReparacionUseCase } = buildController();
      editarReparacionUseCase.execute.mockResolvedValue(Result.ok({ ticket, sectorNombre: null }));

      await controller.editar('ticket-uuid', {}, payloadDeTest({ ...USER, is_global_admin: true }));

      expect(editarReparacionUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ actorEsRoot: true }),
      );
    });

    it.each<[string, () => DomainError, number]>([
      ['TicketNoEncontradoError', () => new TicketNoEncontradoError('x'), 404],
      [
        'ReparacionNoEditableError EN_PROCESO',
        () => new ReparacionNoEditableError('EN_PROCESO'),
        422,
      ],
      [
        'ReparacionNoEditableError BLOQUEADA',
        () => new ReparacionNoEditableError('BLOQUEADA'),
        422,
      ],
      [
        'TicketSoloComentariosError (odd/cerrado-solo-comentarios)',
        () => new TicketSoloComentariosError('CERRADO'),
        422,
      ],
    ])('mapea %s → HTTP %i', async (_nombre, error, http) => {
      const { controller, editarReparacionUseCase } = buildController();
      editarReparacionUseCase.execute.mockResolvedValue(Result.fail(error()));

      await expect(controller.editar('ticket-uuid', {}, USER)).rejects.toMatchObject({
        status: http,
      });
    });
  });
});

describe('ReparacionesController.exportar — GET /reparaciones/export (sdd/exportar-listados-csv)', () => {
  function buildController(overrides: {
    exportarReparaciones?: Espiado<ExportarReparacionesUseCase>;
  }) {
    const exportarReparaciones =
      overrides.exportarReparaciones ?? espiado(ExportarReparacionesUseCase);

    const controller = new ReparacionesController(
      espiado(CrearTicketEdilicioUseCase).caso,
      espiado(ListarReparacionesUseCase).caso,
      espiado(CrearComentarioUseCase).caso,
      espiado(ListarComentariosReparacionUseCase).caso,
      usuarioMasterCheckerFalso(),
      exportarReparaciones.caso,
      espiado(EditarReparacionUseCase).caso,
      cargadorDeAlcance(),
    );
    return { controller, exportarReparaciones };
  }

  /** Doble mínimo de la respuesta HTTP: sólo hace falta poder escribir headers. */
  function respuestaFalsa() {
    const headers = new Map<string, string>();
    return {
      res: { setHeader: (nombre: string, valor: string) => void headers.set(nombre, valor) },
      headers,
    };
  }

  it('entrega el CSV como descarga, con el nombre que resolvió el use case', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.ok({ contenido: 'Número;Título', nombreArchivo: 'reparaciones-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarReparaciones });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(USER, res, {});

    expect(salida).toBe('Número;Título');
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('Content-Disposition')).toBe(
      'attachment; filename="reparaciones-2026-08-19.csv"',
    );
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });

  it('con ?formato=xlsx entrega un StreamableFile con el content-type y el nombre de xlsx; el use case recibe el formato', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.ok({ contenido: Buffer.from('PK'), nombreArchivo: 'reparaciones-2026-08-19.xlsx' }),
    );
    const { controller } = buildController({ exportarReparaciones });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(USER, res, {}, 'xlsx');

    expect(salida).toBeInstanceOf(StreamableFile);
    expect(exportarReparaciones.execute).toHaveBeenLastCalledWith(ALCANCE_USER, 'xlsx', null);
    expect(headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(headers.get('Content-Disposition')).toBe(
      'attachment; filename="reparaciones-2026-08-19.xlsx"',
    );
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });

  it('sin ?formato sigue entregando CSV (default), el use case recibe csv', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.ok({ contenido: 'a;b', nombreArchivo: 'reparaciones-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarReparaciones });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(USER, res, {});

    expect(salida).toBe('a;b');
    expect(exportarReparaciones.execute).toHaveBeenLastCalledWith(ALCANCE_USER, 'csv', null);
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('sin filtros — llama a execute() con el alcance del actor, el formato y el tipo de la grilla', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'reparaciones-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarReparaciones });

    await controller.exportar(USER, respuestaFalsa().res, {});
    await controller.exportar(USER, respuestaFalsa().res, { tipo: 'tipo-soporte-uuid' });

    expect(exportarReparaciones.execute).toHaveBeenNthCalledWith(1, ALCANCE_USER, 'csv', null);
    expect(exportarReparaciones.execute).toHaveBeenNthCalledWith(
      2,
      ALCANCE_USER,
      'csv',
      'tipo-soporte-uuid',
    );
  });

  it('traduce el tope excedido a 422 y no escribe headers de descarga', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.fail(new ReparacionesErrors.ExportacionDemasiadoGrandeError(6000, 5000)),
    );
    const { controller } = buildController({ exportarReparaciones });
    const { res, headers } = respuestaFalsa();

    await expect(controller.exportar(USER, res, {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(headers.size).toBe(0);
  });
});

describe('toHttpException (reparaciones) — catálogo de errores propios → HTTP (sdd/exportar-listados-csv, decisión D2)', () => {
  /**
   * Clases de error exportadas por `reparaciones.errors.ts` — el número de
   * la verdad, no un literal a mano. Deliberadamente NO incluye los errores
   * de `tickets.errors.ts` que este MISMO `toHttpException` también mapea
   * (`SolicitanteInvalidoError`, `SinCicloActivoError`,
   * `SecuenciaAgotadaError`, `TicketNoEncontradoError`): ese catálogo vive en
   * OTRO módulo y tiene su propia reflexión ahí — mismo criterio que
   * `equipos.controller.spec.ts`, cuyo catálogo tampoco reflexiona sobre
   * errores de `tickets`.
   */
  // Sin type predicate a propósito: cada export de `reparaciones.errors.ts`
  // ya es `typeof AlgunErrorConcreto`, con sus estáticos heredados de
  // `Error` (captureStackTrace, etc.) — una firma de constructor inventada
  // acá los pierde y el chequeo TS2677 lo rechaza. El filtro es puro
  // guardarraíl runtime si el módulo alguna vez exporta algo que no sea
  // una clase.
  const CLASES_DE_ERROR = Object.values(ReparacionesErrors).filter(
    (valor) => typeof valor === 'function' && valor.prototype instanceof DomainError,
  );

  it('el catálogo tiene EXACTAMENTE 5 clases de error (ComentarioReparacionNoPermitidoError se retiró en odd/ticket-unificado T4a)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(5);
  });

  const TABLA: Array<[string, () => DomainError, 404 | 422]> = [
    [
      'TicketEdiliciaNoEncontradoError',
      () => new ReparacionesErrors.TicketEdiliciaNoEncontradoError('edilicia-1'),
      404,
    ],
    [
      'ExportacionDemasiadoGrandeError',
      () => new ReparacionesErrors.ExportacionDemasiadoGrandeError(6000, 5000),
      422,
    ],
    // Vínculo reparación-compra (sdd/reparacion-bloqueada-por-compra, WU1):
    // errores de dominio ya definidos, aunque los casos de uso que los
    // producen (vincular/desvincular) recién se crean en WU5.
    [
      'CompraNoEncontradaError',
      () => new ReparacionesErrors.CompraNoEncontradaError('compra-1'),
      404,
    ],
    [
      'VinculoNoEncontradoError',
      () => new ReparacionesErrors.VinculoNoEncontradoError('edilicia-1', 'compra-1'),
      404,
    ],
    // odd/detalle-ticket-legible (S5): la reparación ya se empezó a trabajar o está bloqueada.
    [
      'ReparacionNoEditableError',
      () => new ReparacionesErrors.ReparacionNoEditableError('BLOQUEADA'),
      422,
    ],
  ];

  it('TABLA cubre EXACTAMENTE las clases exportadas (ninguna falta, ninguna sobra)', () => {
    expect(TABLA).toHaveLength(CLASES_DE_ERROR.length);
    const nombresEnTabla = new Set(TABLA.map(([nombre]) => nombre));
    for (const clase of CLASES_DE_ERROR) {
      expect(nombresEnTabla.has(clase.name)).toBe(true);
    }
  });

  it.each(TABLA)('%s → HTTP %i', (_nombre, factory, httpEsperado) => {
    const excepcion = toHttpException(factory());

    expect(excepcion.getStatus()).toBe(httpEsperado);
    if (httpEsperado === 404) {
      expect(excepcion).toBeInstanceOf(NotFoundException);
    } else {
      expect(excepcion).toBeInstanceOf(UnprocessableEntityException);
    }
  });
});

describe('ReparacionesController — permisos por tipo (odd/permisos-por-tipo-ticket, D5 c-e)', () => {
  function armar() {
    const crearTicketEdilicio = espiado(CrearTicketEdilicioUseCase);
    const crearComentario = espiado(CrearComentarioUseCase);
    const editar = espiado(EditarReparacionUseCase);
    const controller = new ReparacionesController(
      crearTicketEdilicio.caso,
      espiado(ListarReparacionesUseCase).caso,
      crearComentario.caso,
      espiado(ListarComentariosReparacionUseCase).caso,
      usuarioMasterCheckerFalso(),
      espiado(ExportarReparacionesUseCase).caso,
      editar.caso,
      cargadorDeAlcance(),
    );
    return { controller, crearTicketEdilicio, crearComentario, editar };
  }

  /**
   * Las celdas `EDILICIA:*` dejan de decidir (D5 d): cada caso de uso exige su acción sobre el tipo.
   * Las rutas de compras, las únicas con `@RequiereAcciones('COMPRAS:LECTURA')`, viven en
   * `TicketComprasController` desde que se retiraron los alias (odd/ticket-unificado, T4a).
   */
  it('ninguna ruta declara @RequiereAcciones', () => {
    const rutas = accionesPorRuta(ReparacionesController);

    expect(rutas.size).toBe(6);
    expect(Object.fromEntries([...rutas].filter(([, acciones]) => acciones.length > 0))).toEqual(
      {},
    );
  });

  it('POST /reparaciones pasa el alcance; sin ALTAS sobre el tipo resultante responde 403', async () => {
    const { controller, crearTicketEdilicio } = armar();
    crearTicketEdilicio.execute.mockResolvedValue(
      Result.fail(new AccionSobreTipoNoPermitidaError('ALTAS')),
    );

    await expect(controller.crear({ titulo: 'X', prioridadId: 'p' }, USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(crearTicketEdilicio.execute).toHaveBeenCalledWith(
      expect.objectContaining({ tipoId: null, alcance: ALCANCE_USER }),
    );
  });

  it('una reparación que el actor ve sin la acción sobre su tipo llega como 403 (editar y comentar)', async () => {
    const { controller, crearComentario, editar } = armar();
    crearComentario.execute.mockResolvedValue(
      Result.fail(new AccionSobreTipoNoPermitidaError('COMENTAR')),
    );
    editar.execute.mockResolvedValue(
      Result.fail(new AccionSobreTipoNoPermitidaError('MODIFICACION')),
    );

    await expect(
      controller.crearComentario('ticket-uuid', { texto: 'X' }, USER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.editar('ticket-uuid', {}, USER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
