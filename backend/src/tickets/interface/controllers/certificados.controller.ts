/**
 * CertificadosController — certificados de avance de obra de un ticket EXTERNA
 * (odd/edilicia-obra-externa, T3b, S5, S6, S8):
 *
 *   GET  /tickets/:id/certificados                              → lista (LECTURA sobre el tipo)
 *   POST /tickets/:id/certificados                              → emitir (CERTIFICAR)
 *   POST /tickets/:id/certificados/:certificadoId/anular        → anular con motivo (CERTIFICAR)
 *
 * Fino: arma el alcance, delega y mapea. Las reglas viven en los casos de uso.
 */
import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../../auth/infrastructure/guards/acciones.guard';
import { CurrentUser } from '../../../auth/infrastructure/guards/decorators';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { DomainError, Result } from '../../../shared/domain/result';
import { AnularCertificadoUseCase } from '../../application/use-cases/anular-certificado.use-case';
import { EmitirCertificadoUseCase } from '../../application/use-cases/emitir-certificado.use-case';
import { ListarCertificadosUseCase } from '../../application/use-cases/listar-certificados.use-case';
import { CertificadoAvanceEntity } from '../../domain/entities/certificado-avance.entity';
import {
  CertificacionTicketCerradoError,
  CertificadoNoEncontradoError,
  CertificadoSoloExternoError,
  CertificadoYaAnuladoError,
  PesosIncompletosParaCertificarError,
  TareaNoCertificableError,
} from '../../domain/errors/certificados.errors';
import {
  ITareaTicketRepository,
  TAREA_TICKET_REPOSITORY,
} from '../../domain/ports/i-tarea-ticket.repository';
import {
  IUsuarioMasterChecker,
  USUARIO_MASTER_CHECKER,
} from '../../domain/ports/i-usuario-master.checker';
import { CargadorAlcanceTicket } from '../alcance-ticket';
import {
  AnularCertificadoBodyDto,
  CertificadoResponseDto,
  EmitirCertificadoBodyDto,
  toCertificadoResponseDto,
  usuariosDeCertificados,
} from '../dtos/certificado.dto';
import { toHttpException } from './tickets.controller';

/**
 * Mapea los errores de certificados a HTTP; el resto (404 del ticket, 403 por falta de
 * `CERTIFICAR`) sigue el mapeo de tickets.
 *
 * @param error Error de dominio.
 * @returns La excepción HTTP.
 */
export function toHttpExceptionCertificados(
  error: DomainError,
): NotFoundException | ConflictException | ForbiddenException | UnprocessableEntityException {
  if (error instanceof CertificadoNoEncontradoError) return new NotFoundException(error.message);
  if (error instanceof CertificadoYaAnuladoError) return new ConflictException(error.message);
  if (
    error instanceof CertificadoSoloExternoError ||
    error instanceof PesosIncompletosParaCertificarError ||
    error instanceof TareaNoCertificableError ||
    error instanceof CertificacionTicketCerradoError
  ) {
    return new UnprocessableEntityException(error.message);
  }
  return toHttpException(error);
}

function valorOExcepcion<T>(result: Result<T, DomainError>): T {
  if (result.isFail()) throw toHttpExceptionCertificados(result.getError());
  return result.getValue();
}

@UseGuards(JwtAuthGuard, TenantGuard, AccionesGuard)
@Controller('tickets')
export class CertificadosController {
  constructor(
    private readonly listar: ListarCertificadosUseCase,
    private readonly emitir: EmitirCertificadoUseCase,
    private readonly anularCertificado: AnularCertificadoUseCase,
    @Inject(TAREA_TICKET_REPOSITORY)
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    @Inject(USUARIO_MASTER_CHECKER) private readonly usuarioMasterChecker: IUsuarioMasterChecker,
    private readonly alcances: CargadorAlcanceTicket,
  ) {}

  /** Nombres de master y descripciones de tareas en un lote cada uno (sin N+1). */
  private async aDtos(
    ticketId: string,
    certificados: readonly CertificadoAvanceEntity[],
  ): Promise<CertificadoResponseDto[]> {
    const [nombres, tareas] = await Promise.all([
      this.usuarioMasterChecker.resolverNombres(usuariosDeCertificados(certificados)),
      this.tareaRepo.listarPorTicket(ticketId),
    ]);
    const descripciones = new Map(tareas.map((t) => [t.id, t.descripcion]));
    return certificados.map((c) => toCertificadoResponseDto(c, nombres, descripciones));
  }

  /**
   * GET /tickets/:id/certificados — vigentes y anulados, por número.
   * @throws 404 ticket inexistente o que el actor no ve
   */
  @Get(':id/certificados')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
  ): Promise<CertificadoResponseDto[]> {
    const certificados = valorOExcepcion(
      await this.listar.execute({ ticketId, alcance: await this.alcances.cargar(user) }),
    );
    return this.aDtos(ticketId, certificados);
  }

  /**
   * POST /tickets/:id/certificados — emite un certificado con las tareas pedidas.
   * @throws 400 body inválido · 403 sin CERTIFICAR sobre el tipo · 404 ticket no visible
   *   · 422 ticket no externo, cerrado o cancelado, pesos que no suman 100, o tarea no certificable
   */
  @Post(':id/certificados')
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Body() body: EmitirCertificadoBodyDto,
  ): Promise<CertificadoResponseDto> {
    const certificado = valorOExcepcion(
      await this.emitir.execute({
        ticketId,
        alcance: await this.alcances.cargar(user),
        tareaIds: body.tareaIds,
      }),
    );
    const [dto] = await this.aDtos(ticketId, [certificado]);
    return dto;
  }

  /**
   * POST /tickets/:id/certificados/:certificadoId/anular — anula con motivo y libera sus tareas.
   * @throws 400 motivo vacío · 403 sin CERTIFICAR · 404 ticket o certificado · 409 ya anulado
   *   · 422 ticket cerrado o cancelado
   */
  @Post(':id/certificados/:certificadoId/anular')
  @HttpCode(HttpStatus.OK)
  async anular(
    @CurrentUser() user: JwtPayload,
    @Param('id') ticketId: string,
    @Param('certificadoId') certificadoId: string,
    @Body() body: AnularCertificadoBodyDto,
  ): Promise<CertificadoResponseDto> {
    const certificado = valorOExcepcion(
      await this.anularCertificado.execute({
        ticketId,
        certificadoId,
        alcance: await this.alcances.cargar(user),
        motivo: body.motivo,
      }),
    );
    const [dto] = await this.aDtos(ticketId, [certificado]);
    return dto;
  }
}
