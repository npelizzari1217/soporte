/**
 * ConsultarEncuestaUseCase — GET público `/publico/encuesta/:token` (WU7,
 * tarea 7.1). Resuelve el token vía `ResolverEncuestaTokenService` (ADR-C1,
 * WU5) y devuelve ÚNICAMENTE el número del ticket.
 *
 * Deliberadamente NO devuelve título, descripción, ni ningún otro campo del
 * ticket: el endpoint es anónimo, y cualquier eco adicional le confirma
 * información a un actor no autenticado (spec, Requirement "Respuesta HTTP
 * mínima").
 *
 * `clienteId`/`ticketId` salen SIEMPRE de `EncuestaTokenResuelto` (la fila
 * del token) — este use case no recibe ni acepta ningún identificador
 * adicional del caller.
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Respuesta HTTP mínima". Ref design: ADR-C1, sección
 * "Contratos". Tarea: 7.1.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { EncuestaLinkInvalidoError } from '../../domain/errors/csat.errors';
import { ResolverEncuestaTokenService } from '../services/resolver-encuesta-token.service';
import {
  TICKET_REPOSITORY,
  ITicketRepository,
} from '../../../tickets/domain/ports/i-ticket.repository';

/**
 * EncuestaPublicaResult — respuesta pública de GET/POST
 * `/publico/encuesta/:token`. SOLO el número del ticket (spec, "Respuesta
 * HTTP mínima") — compartida por `ConsultarEncuestaUseCase` y
 * `ResponderEncuestaUseCase` para que ambos endpoints respondan exactamente
 * la misma forma.
 */
export interface EncuestaPublicaResult {
  readonly numero: string;
}

@Injectable()
export class ConsultarEncuestaUseCase {
  constructor(
    private readonly resolverEncuestaTokenService: ResolverEncuestaTokenService,
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
  ) {}

  async ejecutar(
    rawToken: string,
  ): Promise<Result<EncuestaPublicaResult, EncuestaLinkInvalidoError>> {
    const resuelto = await this.resolverEncuestaTokenService.resolver(rawToken);
    if (resuelto.isFail()) {
      return Result.fail(resuelto.getError());
    }

    const ticket = await this.ticketRepo.findById(resuelto.getValue().ticketId);
    if (!ticket) {
      // Soft ref roto (no debería pasar en operación normal): mismo rechazo
      // genérico, nunca una fuga adicional de información al caller anónimo.
      return Result.fail(new EncuestaLinkInvalidoError());
    }

    return Result.ok({ numero: ticket.numero });
  }
}
