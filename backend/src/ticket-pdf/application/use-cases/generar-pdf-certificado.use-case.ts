import { logoParaPdf } from '../services/logo-pdf';
import { DomainError, Result } from '../../../shared/domain/result';
import { fechaHoraCsv } from '../../../shared/infrastructure/csv/csv';
import { VerLogoClienteUseCase } from '../../../clientes/application/use-cases/ver-logo-cliente.use-case';
import { ObtenerTicketUseCase } from '../../../tickets/application/use-cases/obtener-ticket.use-case';
import {
  AlcanceActorTicket,
  tieneAccionSobreTipo,
} from '../../../tickets/application/services/visibilidad-ticket';
import { CertificadoNoEncontradoError } from '../../../tickets/domain/errors/certificados.errors';
import { AccionSobreTipoNoPermitidaError } from '../../../tickets/domain/errors/tickets.errors';
import { ICertificadoAvanceRepository } from '../../../tickets/domain/ports/i-certificado-avance.repository';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { IUsuarioMasterChecker } from '../../../tickets/domain/ports/i-usuario-master.checker';
import { CertificadoPdfVista } from '../../domain/certificado-pdf-vista';
import { IGeneradorPdfCertificado } from '../../domain/ports/i-generador-pdf-certificado';

export interface GenerarPdfCertificadoDto extends AlcanceActorTicket {
  ticketId: string;
  certificadoId: string;
  /** `cliente_id` del JWT, para resolver el logo. */
  clienteId: string;
  /** `cliente_nombre` del JWT: se imprime si no hay logo embebible. */
  clienteNombre: string;
}

export interface GenerarPdfCertificadoResult {
  buffer: Buffer;
  /** `certificado-<numero ticket>-<numero>.pdf`. */
  nombreArchivo: string;
}

/**
 * GenerarPdfCertificadoUseCase — PDF de un certificado de avance (odd/edilicia-obra-externa, S7),
 * la salida hacia administración: el sistema no registra pagos.
 *
 * Mismo acceso que la ficha PDF del ticket: quien ve el ticket (si no, 404) y tiene `IMPRESION`
 * sobre su tipo (si no, 403). Un certificado de otro ticket es 404. Un certificado anulado se puede
 * descargar, pero el PDF lo marca como anulado con su motivo.
 */
export class GenerarPdfCertificadoUseCase {
  constructor(
    private readonly obtenerTicket: Pick<ObtenerTicketUseCase, 'execute'>,
    private readonly certificadoRepo: Pick<ICertificadoAvanceRepository, 'listarPorTicket'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly usuarioMasterChecker: Pick<IUsuarioMasterChecker, 'resolverNombres'>,
    private readonly verLogoCliente: Pick<VerLogoClienteUseCase, 'execute'>,
    private readonly generador: IGeneradorPdfCertificado,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /**
   * @param dto Ticket, certificado, alcance del actor y datos del cliente.
   * @returns El PDF y su nombre de archivo, o el 404/403 que corresponde.
   */
  async execute(
    dto: GenerarPdfCertificadoDto,
  ): Promise<Result<GenerarPdfCertificadoResult, DomainError>> {
    const alcance: AlcanceActorTicket = {
      actorId: dto.actorId,
      permisosPorTipo: dto.permisosPorTipo,
    };
    const ticketResult = await this.obtenerTicket.execute({ ticketId: dto.ticketId, ...alcance });
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();
    if (!tieneAccionSobreTipo(alcance, ticket.tipoId, 'IMPRESION')) {
      return Result.fail(new AccionSobreTipoNoPermitidaError('IMPRESION'));
    }

    const certificados = await this.certificadoRepo.listarPorTicket(ticket.id);
    const certificado = certificados.find((c) => c.id === dto.certificadoId);
    if (!certificado) return Result.fail(new CertificadoNoEncontradoError(dto.certificadoId));

    const ids = [
      certificado.emitidoPorId,
      ...(certificado.anuladoPorId ? [certificado.anuladoPorId] : []),
    ];
    const [tareas, tipo, nombres, logo] = await Promise.all([
      this.tareaRepo.listarPorTicket(ticket.id),
      this.tipoTicketRepo.findById(ticket.tipoId),
      this.usuarioMasterChecker.resolverNombres(ids),
      logoParaPdf(this.verLogoCliente, dto.clienteId),
    ]);
    const descripcion = new Map(tareas.map((t) => [t.id, t.descripcion]));
    const nombreDe = (id: string): string => {
      const n = nombres.get(id);
      return n ? `${n.nombre} ${n.apellido}`.trim() : 'Usuario';
    };

    const vista: CertificadoPdfVista = {
      cliente: { nombre: dto.clienteNombre, logo },
      ticket: {
        numero: ticket.numero,
        titulo: ticket.titulo,
        tipo: tipo?.nombre ?? '—',
        ubicacion: ticket.ubicacion?.trim() ? ticket.ubicacion : null,
      },
      numero: certificado.numero,
      porcentaje: certificado.porcentaje,
      acumuladoVigente: certificados.filter((c) => c.vigente).reduce((s, c) => s + c.porcentaje, 0),
      emitidoPor: nombreDe(certificado.emitidoPorId),
      emitidoEn: fechaHoraCsv(certificado.emitidoEn),
      anulacion:
        certificado.anuladoEn && certificado.anuladoPorId && certificado.motivoAnulacion
          ? {
              por: nombreDe(certificado.anuladoPorId),
              en: fechaHoraCsv(certificado.anuladoEn),
              motivo: certificado.motivoAnulacion,
            }
          : null,
      // Una tarea certificada no se borra (S8), pero la de un certificado anulado sí: queda rotulada.
      tareas: certificado.tareas.map((t) => ({
        descripcion: descripcion.get(t.tareaId) ?? 'Tarea eliminada',
        peso: t.peso,
      })),
      generadoEl: fechaHoraCsv(this.ahora()),
    };

    return Result.ok({
      buffer: await this.generador.generarCertificado(vista),
      nombreArchivo: `certificado-${ticket.numero}-${certificado.numero}.pdf`,
    });
  }
}
