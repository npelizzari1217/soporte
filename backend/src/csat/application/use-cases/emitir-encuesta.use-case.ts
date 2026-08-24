/**
 * EmitirEncuestaUseCase — orquesta la emisión de la encuesta de satisfacción
 * al cerrar un ticket (WU6, tarea 6.1).
 *
 * Secuencia estricta, sin ramas alternativas:
 * 1. Revoca TODO token vigente del mismo ticket ANTES de emitir uno nuevo —
 *    cubre "ticket reabierto y vuelto a cerrar" con un solo hook acá, en vez
 *    de un segundo camino en la transición de reapertura (decisión
 *    deliberada del WU: un solo lugar por donde se puede escapar el
 *    olvido).
 * 2. Genera un token opaco de 32 bytes (`crypto.randomBytes`), mismo patrón
 *    que `LoginUseCase`/`RefreshTokenUseCase` (auth/application).
 * 3. Persiste ÚNICAMENTE su hash SHA-256 en MASTER — el token crudo NUNCA se
 *    guarda, solo viaja embebido en el link del mail.
 * 4. Envía el mail con el link a la página pública `/encuesta/{token}`.
 *
 * El caller (`TicketCsatListener`) resuelve antes de invocar: el ticket
 * (numero/titulo), el destinatario (email del solicitante) y que
 * `Cliente.csatHabilitado` sea `true` — este use case no vuelve a
 * verificarlo, solo ejecuta la secuencia de emisión.
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket", "Revocación de tokens previos en reapertura". Ref design: flujo
 * de datos ("EmitirEncuestaUseCase: revocar previos del ticket → randomBytes(32)
 * → insert hash (MASTER)"). Tarea: 6.1.
 */
import * as crypto from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ENCUESTA_TOKEN_REPOSITORY,
  IEncuestaTokenRepository,
} from '../../domain/ports/i-encuesta-token.repository';
import { EncuestaTokenEntity } from '../../domain/entities/encuesta-token.entity';
import { templateEncuestaSatisfaccion } from '../../domain/templates/encuesta-email.template';
import { EMAIL_SENDER, IEmailSender } from '../../../shared/domain/ports/i-email-sender';

/** Vigencia del token de encuesta: emisión + 30 días (spec, migración WU1). */
const VIGENCIA_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * EmitirEncuestaRequest — datos ya resueltos por el caller. `appBaseUrl`
 * viaja como parámetro (no se lee `process.env` en application/, mismo
 * criterio que `templateEncuestaSatisfaccion`) — el listener (infra) es
 * quien resuelve `process.env.APP_BASE_URL`.
 */
export interface EmitirEncuestaRequest {
  readonly clienteId: string;
  readonly ticketId: string;
  readonly numeroTicket: string;
  readonly tituloTicket: string;
  readonly destinatarioEmail: string;
  readonly appBaseUrl: string;
}

@Injectable()
export class EmitirEncuestaUseCase {
  constructor(
    @Inject(ENCUESTA_TOKEN_REPOSITORY) private readonly tokenRepo: IEncuestaTokenRepository,
    @Inject(EMAIL_SENDER) private readonly emailSender: Pick<IEmailSender, 'send'>,
  ) {}

  async ejecutar(request: EmitirEncuestaRequest): Promise<void> {
    await this.tokenRepo.revocarVigentesDeTicket(request.clienteId, request.ticketId);

    const tokenCrudo = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenCrudo).digest('hex');

    const token = EncuestaTokenEntity.create({
      clienteId: request.clienteId,
      ticketId: request.ticketId,
      tokenHash,
      expiresAt: new Date(Date.now() + VIGENCIA_TOKEN_MS),
      usedAt: null,
      revokedAt: null,
    });

    await this.tokenRepo.save(token);

    const plantilla = templateEncuestaSatisfaccion({
      numero: request.numeroTicket,
      titulo: request.tituloTicket,
      token: tokenCrudo,
      appBaseUrl: request.appBaseUrl,
    });

    await this.emailSender.send({ to: request.destinatarioEmail, ...plantilla });
  }
}
