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
import { NotFoundException, UnprocessableEntityException, StreamableFile } from '@nestjs/common';
import { ReparacionesController, toHttpException } from './reparaciones.controller';
import { ACCIONES_KEY } from '../../../auth/infrastructure/guards/decorators';
import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import {
  SolicitanteInvalidoError,
  TipoTicketNoEncontradoError,
  TipoTicketNoPermitidoEnAltaError,
  SinCicloActivoError,
} from '../../../tickets/domain/errors/tickets.errors';
import {
  TicketEdiliciaNoEncontradoError,
  CompraNoEncontradaError,
  VinculoNoEncontradoError,
  ReparacionNoEditableError,
  ComentarioReparacionNoPermitidoError,
} from '../../domain/errors/reparaciones.errors';
import * as ReparacionesErrors from '../../domain/errors/reparaciones.errors';
import { payloadDeTest } from '../../../auth/test-helpers/payload-de-test';
import { unstubbed } from '../../../testing/mocks';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { CrearTicketEdilicioUseCase } from '../../application/use-cases/crear-ticket-edilicio.use-case';
import {
  ListarReparacionesUseCase,
  type ReparacionConTicket,
} from '../../application/use-cases/listar-reparaciones.use-case';
import { CrearComentarioReparacionUseCase } from '../../application/use-cases/crear-comentario-reparacion.use-case';
import { ListarComentariosReparacionUseCase } from '../../application/use-cases/listar-comentarios-reparacion.use-case';
import { ExportarReparacionesUseCase } from '../../application/use-cases/exportar-reparaciones.use-case';
import { VincularCompraAReparacionUseCase } from '../../application/use-cases/vincular-compra-a-reparacion.use-case';
import { DesvincularCompraDeReparacionUseCase } from '../../application/use-cases/desvincular-compra-de-reparacion.use-case';
import { EditarReparacionUseCase } from '../../application/use-cases/editar-reparacion.use-case';
import { espiado, type Espiado } from '../../../shared/test-helpers/espiado';

const USER = payloadDeTest({
  sub: 'usuario-uuid',
  cliente_id: 'cliente-uuid',
  rol: 'TECNICO',
  permisos: ['ticket:crear', 'subtarea:actualizar'],
  cliente_nombre: 'Cliente Test',
});

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
    getAutorizacionModulos: unstubbed('usuarioMasterChecker.getAutorizacionModulos'),
    listarTecnicosAsignables: unstubbed('usuarioMasterChecker.listarTecnicosAsignables'),
  };
}

describe('ReparacionesController (T8.6, T9.6)', () => {
  function buildController() {
    const crearTicketEdilicioUseCase = espiado(CrearTicketEdilicioUseCase);
    const listarReparacionesUseCase = espiado(ListarReparacionesUseCase);
    const crearComentarioUseCase = espiado(CrearComentarioReparacionUseCase);
    const listarComentariosUseCase = espiado(ListarComentariosReparacionUseCase);
    // Default: master no resuelve ningún nombre (usuario dado de baja) — los
    // tests que verifican el enriquecimiento lo sobrescriben.
    const usuarioMasterChecker = usuarioMasterCheckerFalso();
    const exportarReparacionesUseCase = espiado(ExportarReparacionesUseCase);
    // Agregados al final (WU5, mismo criterio que exportarReparacionesUseCase):
    // no reindexan los args posicionales anteriores.
    const vincularCompraUseCase = espiado(VincularCompraAReparacionUseCase);
    const desvincularCompraUseCase = espiado(DesvincularCompraDeReparacionUseCase);
    const editarReparacionUseCase = espiado(EditarReparacionUseCase);

    const controller = new ReparacionesController(
      crearTicketEdilicioUseCase.caso,
      listarReparacionesUseCase.caso,
      crearComentarioUseCase.caso,
      listarComentariosUseCase.caso,
      usuarioMasterChecker,
      exportarReparacionesUseCase.caso,
      vincularCompraUseCase.caso,
      desvincularCompraUseCase.caso,
      editarReparacionUseCase.caso,
    );

    return {
      controller,
      crearTicketEdilicioUseCase,
      listarReparacionesUseCase,
      crearComentarioUseCase,
      listarComentariosUseCase,
      usuarioMasterChecker,
      exportarReparacionesUseCase,
      vincularCompraUseCase,
      desvincularCompraUseCase,
      editarReparacionUseCase,
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
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, ticketEdilicia, sectorNombre: null }),
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

      expect(result.id).toBe('edilicia-uuid');
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
      ticket.actualizarDatos({ sectorId: 'sector-uuid' });
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: 'Patio' },
        'edilicia-uuid',
      );
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, ticketEdilicia, sectorNombre: 'Mantenimiento' }),
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
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: null },
        'edilicia-uuid',
      );
      crearTicketEdilicioUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, ticketEdilicia, sectorNombre: null }),
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
        .mockResolvedValueOnce(
          Result.fail(new TipoTicketNoPermitidoEnAltaError('PREVENTIVO', 'EDILICIA')),
        )
        .mockResolvedValueOnce(Result.fail(new TipoTicketNoEncontradoError('tipo-uuid')));

      await expect(
        controller.crear({ titulo: 'X', prioridadId: 'p', tipoId: 'tipo-uuid' }, USER),
      ).rejects.toThrow(
        new UnprocessableEntityException(
          'El tipo de ticket "PREVENTIVO" no se puede usar en el alta del módulo EDILICIA.',
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

    it('declara @RequiereAcciones("EDILICIA:ALTAS")', () => {
      const permisos = Reflect.getMetadata(ACCIONES_KEY, ReparacionesController.prototype.crear);
      expect(permisos).toEqual(['EDILICIA:ALTAS']);
    });
  });

  describe('GET /reparaciones', () => {
    /** Envuelve los items en la forma de página que devuelve el caso de uso. */
    function pagina(items: ReparacionConTicket[]) {
      return { items, total: items.length, pagina: 1, porPagina: 20 };
    }

    it('pide la página con los defaults (1, 20, TODAS) y devuelve items mapeados con la metadata', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const spy = vi
        .spyOn(listarReparacionesUseCase.caso, 'executePaginado')
        .mockResolvedValue(Result.ok({ items: [], total: 57, pagina: 1, porPagina: 20 }));

      const respuesta = await controller.listar({});

      expect(spy).toHaveBeenCalledWith({ pagina: 1, porPagina: 20, bloqueo: 'TODAS' });
      expect(respuesta).toEqual({ items: [], total: 57, pagina: 1, porPagina: 20 });
    });

    it('pasa al caso de uso la página, el tamaño y el filtro de la query', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const spy = vi
        .spyOn(listarReparacionesUseCase.caso, 'executePaginado')
        .mockResolvedValue(Result.ok({ items: [], total: 0, pagina: 3, porPagina: 5 }));

      await controller.listar({ pagina: 3, porPagina: 5, bloqueo: 'BLOQUEADAS' });

      expect(spy).toHaveBeenCalledWith({ pagina: 3, porPagina: 5, bloqueo: 'BLOQUEADAS' });
    });

    it('lista las reparaciones del tenant', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const ticket = makeTicket();
      // La Ubicacion general del ticket no viaja en Edilicia: se ve la del satelite.
      ticket.actualizarDatos({ sectorId: 'sector-uuid', ubicacion: 'Ubicacion general' });
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: 'Edificio Central' },
        'edilicia-uuid',
      );
      vi.spyOn(listarReparacionesUseCase.caso, 'executePaginado').mockResolvedValue(
        Result.ok(
          pagina([
            {
              ticket,
              ticketEdilicia,
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

      const { items: result } = await controller.listar({});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('edilicia-uuid');
      expect(result[0].subtareas).toEqual([]);
      // El listado expone SÓLO el conteo — los comentarios tienen su GET propio.
      expect(result[0].cantidadComentarios).toBe(2);
      expect(result[0]).toMatchObject({
        ubicacion: 'Edificio Central',
        sectorId: 'sector-uuid',
        sectorNombre: 'Mantenimiento',
      });
    });

    it('embebe las subtareas activas, que ahora son las tareas del ticket, con su avance (odd/tareas-con-tecnico T3)', async () => {
      const { controller, listarReparacionesUseCase } = buildController();
      const ticket = makeTicket();
      const ticketEdilicia = TicketEdiliciaEntity.create(
        { ticketId: ticket.id, ubicacion: 'Edificio Central' },
        'edilicia-uuid',
      );
      const tarea = TareaTicketEntity.crear(
        { ticketId: ticket.id, descripcion: 'Cambiar cañería', orden: 0 },
        'subtarea-uuid',
      );
      vi.spyOn(listarReparacionesUseCase.caso, 'executePaginado').mockResolvedValue(
        Result.ok(
          pagina([
            {
              ticket,
              ticketEdilicia,
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

      const { items: result } = await controller.listar({});

      expect(result[0].porcentajeAvance).toBe(37.5);
      expect(result[0]).not.toHaveProperty('personalAsignadoId');
      expect(result[0].subtareas).toHaveLength(1);
      expect(Object.keys(result[0].subtareas[0]).sort()).toEqual(CAMPOS_SUBTAREA);
      expect(result[0].subtareas[0]).toMatchObject({
        id: 'subtarea-uuid',
        ticketEdiliciaId: 'edilicia-uuid',
        descripcion: 'Cambiar cañería',
        completada: false,
      });
    });

    it('declara @RequiereAcciones("EDILICIA:LECTURA") (WU-7.3: reemplaza el gate de módulo puro)', () => {
      const permisos = Reflect.getMetadata(ACCIONES_KEY, ReparacionesController.prototype.listar);
      expect(permisos).toEqual(['EDILICIA:LECTURA']);
    });
  });

  it.each(['crearSubtarea', 'completarSubtarea', 'eliminarSubtarea'])(
    'ya no expone la ruta vieja %s (odd/tareas-con-tecnico T8): las tareas viven en /tickets/:id/tareas',
    (metodo) => {
      expect(metodo in ReparacionesController.prototype).toBe(false);
    },
  );

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
        { texto: 'Falta el repuesto X' },
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
        controller.crearComentario('edilicia-uuid', { texto: 'X' }, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mapea ComentarioReparacionNoPermitidoError → 422 con el motivo (odd/ticket-cerrado-solo-lectura)', async () => {
      const { controller, crearComentarioUseCase } = buildController();
      crearComentarioUseCase.execute.mockResolvedValue(
        Result.fail(new ComentarioReparacionNoPermitidoError('cerrado')),
      );

      await expect(
        controller.crearComentario('edilicia-uuid', { texto: 'X' }, USER),
      ).rejects.toMatchObject({
        status: 422,
        message: 'El ticket está cerrado y no acepta comentarios nuevos.',
      });
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

  describe('POST /reparaciones/:reparacionId/compras', () => {
    it('vincula la compra a la reparación', async () => {
      const { controller, vincularCompraUseCase } = buildController();
      vincularCompraUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.vincularCompra('edilicia-uuid', { compraId: 'compra-uuid' });

      expect(vincularCompraUseCase.execute).toHaveBeenCalledWith({
        ticketEdiliciaId: 'edilicia-uuid',
        compraId: 'compra-uuid',
      });
    });

    it('mapea TicketEdiliciaNoEncontradoError → 404', async () => {
      const { controller, vincularCompraUseCase } = buildController();
      vincularCompraUseCase.execute.mockResolvedValue(
        Result.fail(new TicketEdiliciaNoEncontradoError('edilicia-uuid')),
      );

      await expect(
        controller.vincularCompra('edilicia-uuid', { compraId: 'compra-uuid' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('mapea CompraNoEncontradaError → 404', async () => {
      const { controller, vincularCompraUseCase } = buildController();
      vincularCompraUseCase.execute.mockResolvedValue(
        Result.fail(new CompraNoEncontradaError('compra-uuid')),
      );

      await expect(
        controller.vincularCompra('edilicia-uuid', { compraId: 'compra-uuid' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // WU5.9: decorador COMPLETO — decisión de producto #2435, R3 (AND). El
    // test de autorización real por HTTP (`reparaciones.e2e.spec.ts`, WU5.8)
    // demostró que con UN solo argumento un actor con SOLO EDILICIA:ALTAS
    // pasaba y recibía 201/404, nunca 403.
    it('declara @RequiereAcciones("EDILICIA:ALTAS", "COMPRAS:LECTURA")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.vincularCompra,
      );
      expect(permisos).toEqual(['EDILICIA:ALTAS', 'COMPRAS:LECTURA']);
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
      },
      'ticket-uuid',
    );
    const satelite = TicketEdiliciaEntity.create(
      { ticketId: 'ticket-uuid', ubicacion: 'Aula 3' },
      'edilicia-uuid',
    );

    it('pasa los campos del body y actorEsRoot al caso de uso y responde el shape unificado', async () => {
      const { controller, editarReparacionUseCase } = buildController();
      editarReparacionUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, ticketEdilicia: satelite, sectorNombre: 'Secundario' }),
      );

      const respuesta = await controller.editar(
        'edilicia-uuid',
        { titulo: 'Titulo nuevo', ubicacion: 'Aula 3', sectorId: 'sector-uuid' },
        USER,
      );

      expect(editarReparacionUseCase.execute).toHaveBeenCalledWith({
        reparacionId: 'edilicia-uuid',
        titulo: 'Titulo nuevo',
        descripcion: undefined,
        prioridadId: undefined,
        ubicacion: 'Aula 3',
        sectorId: 'sector-uuid',
        actorEsRoot: false,
      });
      expect(respuesta).toMatchObject({
        id: 'edilicia-uuid',
        ticketId: 'ticket-uuid',
        titulo: 'Titulo nuevo',
        ubicacion: 'Aula 3',
        sectorNombre: 'Secundario',
      });
    });

    it('ROOT viaja como actorEsRoot: true', async () => {
      const { controller, editarReparacionUseCase } = buildController();
      editarReparacionUseCase.execute.mockResolvedValue(
        Result.ok({ ticket, ticketEdilicia: satelite, sectorNombre: null }),
      );

      await controller.editar(
        'edilicia-uuid',
        {},
        payloadDeTest({ ...USER, is_global_admin: true }),
      );

      expect(editarReparacionUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ actorEsRoot: true }),
      );
    });

    it.each<[string, () => DomainError, number]>([
      ['TicketEdiliciaNoEncontradoError', () => new TicketEdiliciaNoEncontradoError('x'), 404],
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
    ])('mapea %s → HTTP %i', async (_nombre, error, http) => {
      const { controller, editarReparacionUseCase } = buildController();
      editarReparacionUseCase.execute.mockResolvedValue(Result.fail(error()));

      await expect(controller.editar('edilicia-uuid', {}, USER)).rejects.toMatchObject({
        status: http,
      });
    });

    it('declara @RequiereAcciones("EDILICIA:MODIFICACION")', () => {
      const permisos = Reflect.getMetadata(ACCIONES_KEY, ReparacionesController.prototype.editar);
      expect(permisos).toEqual(['EDILICIA:MODIFICACION']);
    });
  });

  describe('DELETE /reparaciones/:reparacionId/compras/:compraId', () => {
    it('desvincula la compra de la reparación', async () => {
      const { controller, desvincularCompraUseCase } = buildController();
      desvincularCompraUseCase.execute.mockResolvedValue(Result.ok(undefined));

      await controller.desvincularCompra('edilicia-uuid', 'compra-uuid');

      expect(desvincularCompraUseCase.execute).toHaveBeenCalledWith({
        ticketEdiliciaId: 'edilicia-uuid',
        compraId: 'compra-uuid',
      });
    });

    it('mapea VinculoNoEncontradoError → 404', async () => {
      const { controller, desvincularCompraUseCase } = buildController();
      desvincularCompraUseCase.execute.mockResolvedValue(
        Result.fail(new VinculoNoEncontradoError('edilicia-uuid', 'compra-uuid')),
      );

      await expect(
        controller.desvincularCompra('edilicia-uuid', 'compra-uuid'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // Desvincular NO exige COMPRAS:LECTURA (ver design + tasks, WU5, "Por qué
    // desvincular NO tiene el mismo problema"): el `numero` que ve quien
    // desvincula sale de `comprasQueBloquean[]` en `GET /reparaciones`
    // (EDILICIA:LECTURA), no de `GET /compras`.
    it('declara @RequiereAcciones("EDILICIA:BORRADO")', () => {
      const permisos = Reflect.getMetadata(
        ACCIONES_KEY,
        ReparacionesController.prototype.desvincularCompra,
      );
      expect(permisos).toEqual(['EDILICIA:BORRADO']);
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
      espiado(CrearComentarioReparacionUseCase).caso,
      espiado(ListarComentariosReparacionUseCase).caso,
      usuarioMasterCheckerFalso(),
      exportarReparaciones.caso,
      espiado(VincularCompraAReparacionUseCase).caso,
      espiado(DesvincularCompraDeReparacionUseCase).caso,
      espiado(EditarReparacionUseCase).caso,
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

  it('declara @RequiereAcciones("EDILICIA:LECTURA")', () => {
    const meta = Reflect.getMetadata(ACCIONES_KEY, ReparacionesController.prototype.exportar);
    expect(meta).toEqual(['EDILICIA:LECTURA']);
  });

  it('entrega el CSV como descarga, con el nombre que resolvió el use case', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.ok({ contenido: 'Número;Título', nombreArchivo: 'reparaciones-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarReparaciones });
    const { res, headers } = respuestaFalsa();

    const salida = await controller.exportar(res);

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

    const salida = await controller.exportar(res, 'xlsx');

    expect(salida).toBeInstanceOf(StreamableFile);
    expect(exportarReparaciones.execute).toHaveBeenLastCalledWith('xlsx');
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

    const salida = await controller.exportar(res);

    expect(salida).toBe('a;b');
    expect(exportarReparaciones.execute).toHaveBeenLastCalledWith('csv');
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });

  it('no recibe query ni filtros — llama a execute() solo con el formato', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.ok({ contenido: '', nombreArchivo: 'reparaciones-2026-08-19.csv' }),
    );
    const { controller } = buildController({ exportarReparaciones });

    await controller.exportar(respuestaFalsa().res);

    expect(exportarReparaciones.execute).toHaveBeenCalledWith('csv');
  });

  it('traduce el tope excedido a 422 y no escribe headers de descarga', async () => {
    const exportarReparaciones = espiado(ExportarReparacionesUseCase);
    exportarReparaciones.execute.mockResolvedValue(
      Result.fail(new ReparacionesErrors.ExportacionDemasiadoGrandeError(6000, 5000)),
    );
    const { controller } = buildController({ exportarReparaciones });
    const { res, headers } = respuestaFalsa();

    await expect(controller.exportar(res)).rejects.toBeInstanceOf(UnprocessableEntityException);
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

  it('el catálogo tiene EXACTAMENTE 6 clases de error (ComentarioReparacionNoPermitidoError se sumó en odd/ticket-cerrado-solo-lectura)', () => {
    expect(CLASES_DE_ERROR).toHaveLength(6);
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
    // odd/ticket-cerrado-solo-lectura (S3): el ticket está cerrado/cancelado o la reparación bloqueada.
    [
      'ComentarioReparacionNoPermitidoError',
      () => new ReparacionesErrors.ComentarioReparacionNoPermitidoError('bloqueado'),
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
