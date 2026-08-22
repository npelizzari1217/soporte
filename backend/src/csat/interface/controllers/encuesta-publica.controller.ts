/**
 * EncuestaPublicaController — `GET`/`POST /publico/encuesta/:token` (WU7,
 * tarea 7.2). Endpoint público: primera ruta del repo que ESCRIBE en la
 * base de un tenant SIN sesión.
 *
 * SIN `@UseGuards` de autenticación — es el punto de entrada, ningún
 * destinatario del mail tiene una sesión. La única protección de acceso es
 * `CsatThrottlerGuard` (ADR-C6) + la resolución del token en sí
 * (`ResolverEncuestaTokenService`, ADR-C1, dentro de cada use case).
 *
 * Todo rechazo (token inexistente, vencido, usado, revocado, cliente
 * inactivo o sin `csatHabilitado`) mapea al MISMO 404 con el MISMO cuerpo
 * (`toHttpException`) — nunca se distingue el motivo (`csat.errors.ts`,
 * `EncuestaLinkInvalidoError`): un actor anónimo no puede usar la respuesta
 * como oráculo para enumerar tokens.
 *
 * El controller NO tiene lógica de negocio: solo traduce HTTP ↔ use cases,
 * mismo patrón que `AuthController`.
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Respuesta HTTP mínima", "Rate limiting en las rutas públicas".
 * Ref design: ADR-C1, ADR-C6, sección "Contratos". Tarea: 7.2.
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConsultarEncuestaUseCase } from '../../application/use-cases/consultar-encuesta.use-case';
import { ResponderEncuestaUseCase } from '../../application/use-cases/responder-encuesta.use-case';
import {
  CSAT_THROTTLE_LIMIT,
  CSAT_THROTTLE_TTL_MS,
  CsatThrottlerGuard,
} from '../../infrastructure/guards/csat-throttler.guard';
import { PuntajeInvalidoError } from '../../domain/errors/csat.errors';
import { DomainError } from '../../../shared/domain/result';
import { EncuestaPublicaResponseDto, ResponderEncuestaRequestDto } from '../dtos/encuesta.dto';

/** Cuerpo ÚNICO de rechazo — deliberadamente el mismo texto para TODO motivo (ver doc de clase). */
const MENSAJE_LINK_INVALIDO = 'El link de la encuesta no es válido.';

@Controller('publico/encuesta')
@UseGuards(CsatThrottlerGuard)
@Throttle({ default: { limit: CSAT_THROTTLE_LIMIT, ttl: CSAT_THROTTLE_TTL_MS } })
export class EncuestaPublicaController {
  constructor(
    private readonly consultarEncuestaUseCase: ConsultarEncuestaUseCase,
    private readonly responderEncuestaUseCase: ResponderEncuestaUseCase,
  ) {}

  /**
   * Mapea un `DomainError` de CSAT a la `HttpException` pública. Cualquier
   * `DomainError` que no sea `PuntajeInvalidoError` (incluido cualquier
   * error futuro no contemplado) cae al MISMO 404 genérico — fail-closed:
   * nunca un motivo nuevo se filtra por accidente.
   */
  private toHttpException(error: DomainError): BadRequestException | NotFoundException {
    if (error instanceof PuntajeInvalidoError) {
      return new BadRequestException(error.message);
    }
    return new NotFoundException(MENSAJE_LINK_INVALIDO);
  }

  @Get(':token')
  async consultar(@Param('token') token: string): Promise<EncuestaPublicaResponseDto> {
    const resultado = await this.consultarEncuestaUseCase.ejecutar(token);
    if (resultado.isFail()) {
      throw this.toHttpException(resultado.getError());
    }
    return resultado.getValue();
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  async responder(
    @Param('token') token: string,
    @Body() dto: ResponderEncuestaRequestDto,
  ): Promise<EncuestaPublicaResponseDto> {
    const resultado = await this.responderEncuestaUseCase.ejecutar({
      rawToken: token,
      puntaje: dto.puntaje,
      comentario: dto.comentario ?? null,
    });
    if (resultado.isFail()) {
      throw this.toHttpException(resultado.getError());
    }
    return resultado.getValue();
  }
}
