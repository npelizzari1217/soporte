/**
 * ResponderEncuestaUseCase — POST público `/publico/encuesta/:token` (WU7,
 * tarea 7.1). Orden estricto, sin ramas alternativas:
 *
 * 1. Resuelve el token (`ResolverEncuestaTokenService`, ADR-C1) — rechazo
 *    genérico si no es válido.
 * 2. Busca el ticket (para el número de la respuesta) — si no existe, mismo
 *    rechazo genérico, SIN tocar el CAS ni escribir nada.
 * 3. Valida `puntaje` con `PuntajeCsat.create()` — entero 1..5, ANTES de
 *    cualquier escritura (spec: "puntaje fuera de rango → 400, sin
 *    escritura").
 * 4. CAS de uso único (`marcarUsadoSiNoUsado`, ADR-C2): `false` significa que
 *    el link ya se usó (carrera con otro POST simultáneo, o un reintento) →
 *    el MISMO rechazo genérico que un token inválido — no hay forma de
 *    distinguirlos desde afuera (spec, "Reintento con token ya usado").
 * 5. Inserta la respuesta en el tenant. Si el INSERT falla, compensa
 *    liberando el uso en MASTER (ADR-C2 — no hay transacción entre las dos
 *    DBs) y relanza el error de infraestructura.
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)". Ref design: ADR-C1, ADR-C2. Tarea: 7.1.
 */
import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { EncuestaLinkInvalidoError, PuntajeInvalidoError } from '../../domain/errors/csat.errors';
import { ResolverEncuestaTokenService } from '../services/resolver-encuesta-token.service';
import { PuntajeCsat } from '../../domain/value-objects/puntaje-csat';
import { EncuestaSatisfaccionEntity } from '../../domain/entities/encuesta-satisfaccion.entity';
import {
  ENCUESTA_TOKEN_REPOSITORY,
  IEncuestaTokenRepository,
} from '../../domain/ports/i-encuesta-token.repository';
import {
  ENCUESTA_SATISFACCION_REPOSITORY,
  IEncuestaSatisfaccionRepository,
} from '../../domain/ports/i-encuesta-satisfaccion.repository';
import {
  TICKET_REPOSITORY,
  ITicketRepository,
} from '../../../tickets/domain/ports/i-ticket.repository';
import { EncuestaPublicaResult } from './consultar-encuesta.use-case';

/** Datos de entrada de `ResponderEncuestaUseCase.ejecutar`. */
export interface ResponderEncuestaRequest {
  readonly rawToken: string;
  readonly puntaje: number;
  readonly comentario: string | null;
}

@Injectable()
export class ResponderEncuestaUseCase {
  constructor(
    private readonly resolverEncuestaTokenService: ResolverEncuestaTokenService,
    @Inject(ENCUESTA_TOKEN_REPOSITORY) private readonly tokenRepo: IEncuestaTokenRepository,
    @Inject(ENCUESTA_SATISFACCION_REPOSITORY)
    private readonly satisfaccionRepo: IEncuestaSatisfaccionRepository,
    @Inject(TICKET_REPOSITORY) private readonly ticketRepo: ITicketRepository,
  ) {}

  async ejecutar(
    request: ResponderEncuestaRequest,
  ): Promise<Result<EncuestaPublicaResult, EncuestaLinkInvalidoError | PuntajeInvalidoError>> {
    const resuelto = await this.resolverEncuestaTokenService.resolver(request.rawToken);
    if (resuelto.isFail()) {
      return Result.fail(resuelto.getError());
    }
    const { tokenId, ticketId } = resuelto.getValue();

    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket) {
      return Result.fail(new EncuestaLinkInvalidoError());
    }

    const puntajeResult = PuntajeCsat.create(request.puntaje);
    if (puntajeResult.isFail()) {
      return Result.fail(puntajeResult.getError());
    }

    const marcado = await this.tokenRepo.marcarUsadoSiNoUsado(tokenId);
    if (!marcado) {
      return Result.fail(new EncuestaLinkInvalidoError());
    }

    try {
      const respuesta = EncuestaSatisfaccionEntity.create({
        ticketId,
        tokenId,
        puntaje: puntajeResult.getValue(),
        comentario: request.comentario,
      });
      await this.satisfaccionRepo.guardar(respuesta);
    } catch (error) {
      await this.tokenRepo.liberarUso(tokenId);
      throw error;
    }

    return Result.ok({ numero: ticket.numero });
  }
}
