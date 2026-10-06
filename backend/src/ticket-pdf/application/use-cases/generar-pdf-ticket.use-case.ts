import { DomainError, Result } from '../../../shared/domain/result';
import { diaArgentinoCsv, fechaHoraCsv } from '../../../shared/infrastructure/csv/csv';
import { VerLogoClienteUseCase } from '../../../clientes/application/use-cases/ver-logo-cliente.use-case';
import { IEquipoInformaticoRepository } from '../../../equipos/domain/ports/i-equipo-informatico.repository';
import { ITicketSoporteRepository } from '../../../equipos/domain/ports/i-ticket-soporte.repository';
import { ISubtareaEdiliciaRepository } from '../../../reparaciones/domain/ports/i-subtarea-edilicia.repository';
import { ITicketEdiliciaRepository } from '../../../reparaciones/domain/ports/i-ticket-edilicia.repository';
import { IEstadoRepository } from '../../../tickets/domain/ports/i-estado.repository';
import { IPrioridadRepository } from '../../../tickets/domain/ports/i-prioridad.repository';
import { ISolicitanteExternoRepository } from '../../../tickets/domain/ports/i-solicitante-externo.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { ListarTimelineUseCase } from '../../../tickets/application/use-cases/listar-timeline.use-case';
import { ObtenerTicketUseCase } from '../../../tickets/application/use-cases/obtener-ticket.use-case';
import { IGeneradorPdfTicket } from '../../domain/ports/i-generador-pdf-ticket';
import {
  EdiliciaPdf,
  EventoHistorialPdf,
  LogoPdf,
  SoportePdf,
  TicketPdfVista,
} from '../../domain/ticket-pdf-vista';

/**
 * Entrada de `GenerarPdfTicketUseCase`. NO lleva `tienePermisoObservar`, y
 * es a propósito: el PDF es un documento que se descarga y se reenvía, así
 * que NUNCA incluye comentarios internos, ni siquiera para quien tiene
 * `TICKETS:OBSERVAR` en pantalla. Que el campo no exista impide que un
 * caller lo active por error.
 */
export interface GenerarPdfTicketDto {
  ticketId: string;
  actorId: string;
  /** `TICKETS:VER_TODOS` del actor: mismo scope de acceso que `GET /tickets/:id`. */
  tienePermisoVerTodos: boolean;
  /** `cliente_id` del JWT, para resolver el logo. */
  clienteId: string;
  /** `cliente_nombre` del JWT: se imprime si no hay logo embebible. */
  clienteNombre: string;
}

export interface GenerarPdfTicketResult {
  buffer: Buffer;
  /** `ticket-<numero>.pdf`. */
  nombreArchivo: string;
}

const MIME_LOGO: Readonly<Record<string, LogoPdf['formato']>> = {
  'image/png': 'png',
  'image/jpeg': 'jpeg',
};

const CODIGO_COMENTARIO = 'COMENTARIO';
const CODIGO_CAMBIO_ESTADO = 'CAMBIO_ESTADO';

/**
 * GenerarPdfTicketUseCase — arma el modelo de vista de la ficha PDF de un
 * ticket y se la entrega al generador.
 *
 * El acceso lo deciden `ObtenerTicketUseCase` y `ListarTimelineUseCase`
 * (reusados, no reimplementados): sin `TICKETS:VER_TODOS` solo el solicitante
 * obtiene su ticket y cualquier otro recibe 404, igual que en el detalle.
 *
 * Cubre tickets de soporte y edilicios con la misma ruta: la reparación ES un
 * ticket con satélite `TicketEdilicia`, así que `/tickets/:id` ya la sirve;
 * lo específico de cada flujo se agrega según qué satélite exista.
 *
 * Historial: solo comentarios PÚBLICOS y cambios de estado. Los internos se
 * excluyen dos veces: el timeline se pide sin `tienePermisoObservar` y,
 * además, se descartan acá todos los `esInterno` (defensa en profundidad,
 * por si alguien cambia el filtro de aguas arriba).
 */
export class GenerarPdfTicketUseCase {
  constructor(
    private readonly obtenerTicket: Pick<ObtenerTicketUseCase, 'execute'>,
    private readonly listarTimeline: Pick<ListarTimelineUseCase, 'execute'>,
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly prioridadRepo: Pick<IPrioridadRepository, 'findById'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findAllActive'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
    private readonly solicitanteExternoRepo: Pick<ISolicitanteExternoRepository, 'findById'>,
    private readonly ticketSoporteRepo: Pick<ITicketSoporteRepository, 'findByTicketId'>,
    private readonly equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'>,
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findByTicketId'>,
    private readonly subtareaRepo: Pick<
      ISubtareaEdiliciaRepository,
      'findActiveByTicketEdiliciaId'
    >,
    private readonly verLogoCliente: Pick<VerLogoClienteUseCase, 'execute'>,
    private readonly generador: IGeneradorPdfTicket,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: GenerarPdfTicketDto): Promise<Result<GenerarPdfTicketResult, DomainError>> {
    const ticketResult = await this.obtenerTicket.execute({
      ticketId: dto.ticketId,
      actorId: dto.actorId,
      tienePermisoVerTodos: dto.tienePermisoVerTodos,
    });
    if (ticketResult.isFail()) {
      return Result.fail(ticketResult.getError());
    }
    const ticket = ticketResult.getValue();

    const timelineResult = await this.listarTimeline.execute({
      ticketId: dto.ticketId,
      actorId: dto.actorId,
      tienePermisoVerTodos: dto.tienePermisoVerTodos,
      // Fijo en false: el PDF nunca incluye notas internas (ver docblock del DTO).
      tienePermisoObservar: false,
    });
    if (timelineResult.isFail()) {
      return Result.fail(timelineResult.getError());
    }
    const operaciones = timelineResult.getValue().filter((op) => !op.esInterno);

    const [tiposOperacion, estado, prioridad, tipo, soporte, edilicia, logo] = await Promise.all([
      this.tipoOperacionRepo.findAllActive(),
      this.estadoRepo.findById(ticket.estadoId),
      this.prioridadRepo.findById(ticket.prioridadId),
      this.tipoTicketRepo.findById(ticket.tipoId),
      this.ticketSoporteRepo.findByTicketId(ticket.id),
      this.ticketEdiliciaRepo.findByTicketId(ticket.id),
      this.resolverLogo(dto.clienteId),
    ]);

    const codigoPorTipoId = new Map(tiposOperacion.map((t) => [t.id, t.codigo]));
    const eventos = operaciones.filter((op) => {
      const codigo = codigoPorTipoId.get(op.tipoOperacionId);
      return codigo === CODIGO_COMENTARIO || codigo === CODIGO_CAMBIO_ESTADO;
    });

    const idsEstados = new Set<string>();
    for (const op of eventos) {
      if (op.estadoAnteriorId) idsEstados.add(op.estadoAnteriorId);
      if (op.estadoNuevoId) idsEstados.add(op.estadoNuevoId);
    }
    const idsUsuarios = new Set<string>(eventos.map((op) => op.autorId));
    if (ticket.solicitanteId) idsUsuarios.add(ticket.solicitanteId);
    if (ticket.asignadoId) idsUsuarios.add(ticket.asignadoId);

    const [estadosDeEventos, nombresUsuarios, externo] = await Promise.all([
      Promise.all([...idsEstados].map((id) => this.estadoRepo.findById(id))),
      this.usuarioMasterChecker.resolverNombres([...idsUsuarios]),
      ticket.solicitanteExternoId
        ? this.solicitanteExternoRepo.findById(ticket.solicitanteExternoId)
        : Promise.resolve(null),
    ]);

    const nombreEstado = new Map<string, string>();
    for (const e of estadosDeEventos) {
      if (e) nombreEstado.set(e.id, e.nombre);
    }
    const nombreDe = (id: string | null): string | null => {
      if (id === null) return null;
      const usuario = nombresUsuarios.get(id);
      return usuario ? `${usuario.nombre} ${usuario.apellido}`.trim() : null;
    };

    const historial: EventoHistorialPdf[] = eventos.map((op) => {
      const esComentario = codigoPorTipoId.get(op.tipoOperacionId) === CODIGO_COMENTARIO;
      return {
        fecha: fechaHoraCsv(op.createdAt),
        autor: nombreDe(op.autorId) ?? 'Usuario',
        tipo: esComentario ? 'COMENTARIO' : 'CAMBIO_ESTADO',
        texto: esComentario
          ? (op.descripcion ?? '')
          : `Estado: ${nombreEstado.get(op.estadoAnteriorId ?? '') ?? 'Nuevo'} -> ${
              nombreEstado.get(op.estadoNuevoId ?? '') ?? '—'
            }`,
      };
    });

    const vista: TicketPdfVista = {
      cliente: { nombre: dto.clienteNombre, logo },
      numero: ticket.numero,
      titulo: ticket.titulo,
      estado: estado?.nombre ?? '—',
      prioridad: prioridad?.nombre ?? '—',
      tipo: tipo?.nombre ?? '—',
      solicitante: externo ? externo.nombre : nombreDe(ticket.solicitanteId),
      asignado: nombreDe(ticket.asignadoId),
      creado: fechaHoraCsv(ticket.createdAt),
      cerrado: ticket.fechaCierre ? diaArgentinoCsv(ticket.fechaCierre) : null,
      vencimientoSla: ticket.slaVenceAt ? fechaHoraCsv(ticket.slaVenceAt) : null,
      descripcion: ticket.descripcion,
      soporte: await this.armarSoporte(soporte),
      edilicia: await this.armarEdilicia(edilicia),
      historial,
      generadoEl: fechaHoraCsv(this.ahora()),
    };

    const buffer = await this.generador.generar(vista);
    return Result.ok({ buffer, nombreArchivo: `ticket-${nombreSeguro(ticket.numero)}.pdf` });
  }

  /** Solo png/jpeg se embeben; webp, sin logo o fallo de lectura → `null` (se imprime el nombre). */
  private async resolverLogo(clienteId: string): Promise<LogoPdf | null> {
    const resultado = await this.verLogoCliente.execute(clienteId);
    if (resultado.isFail()) {
      return null;
    }
    const { buffer, mimeType } = resultado.getValue();
    const formato = MIME_LOGO[mimeType.toLowerCase()];
    return formato ? { buffer, formato } : null;
  }

  private async armarSoporte(
    soporte: Awaited<ReturnType<ITicketSoporteRepository['findByTicketId']>>,
  ): Promise<SoportePdf | null> {
    if (!soporte) return null;
    const equipo = soporte.equipoId ? await this.equipoRepo.findById(soporte.equipoId) : null;
    return {
      equipo: equipo?.nombre ?? null,
      descripcionProblema: soporte.descripcionProblema,
      solucionAplicada: soporte.solucionAplicada,
    };
  }

  private async armarEdilicia(
    edilicia: Awaited<ReturnType<ITicketEdiliciaRepository['findByTicketId']>>,
  ): Promise<EdiliciaPdf | null> {
    if (!edilicia) return null;
    const subtareas = await this.subtareaRepo.findActiveByTicketEdiliciaId(edilicia.id);
    return {
      ubicacion: edilicia.ubicacion,
      porcentajeAvance: edilicia.porcentajeAvance,
      subtareas: [...subtareas]
        .sort((a, b) => a.orden - b.orden)
        .map((s) => ({ descripcion: s.descripcion, completada: s.completada })),
    };
  }
}

/** Deja solo caracteres seguros para un nombre de archivo y un header HTTP. */
function nombreSeguro(numero: string): string {
  return numero.replace(/[^A-Za-z0-9._-]/g, '_');
}
