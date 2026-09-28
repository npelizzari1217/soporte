/**
 * RecuperacionPasswordController — `POST /auth/forgot-password` (WU-7) y
 * `POST /auth/reset-password` (WU-8). ADR-1, ADR-2, ADR-3, ADR-5 del design.
 *
 * Las dos rutas son PÚBLICAS, sin `JwtAuthGuard`. Cada una lleva su propio
 * `@Throttle` con `RecuperacionPasswordThrottlerGuard` (ADR-3): el guard lee
 * el tracker del body (`email` o `token`, sin `x-forwarded-for` — es
 * falsificable, sumarlo sería un bypass del cupo).
 *
 * `forgotPassword` NUNCA awaitea `SolicitarResetPasswordUseCase.ejecutar`:
 * solo encola la tarea vía `ITareasSegundoPlano.lanzar` y responde 204 de
 * inmediato (ADR-2) — así el código, el cuerpo y los headers de la
 * respuesta son idénticos en toda rama (existencia del email, membresías,
 * SMTP del tenant).
 *
 * `resetPassword` SÍ awaitea `ConfirmarResetPasswordUseCase.ejecutar`: el
 * token es la autorización, no hay rama que ocultar por timing (ADR-5). Toda
 * causa de rechazo (las 4 del token + cuenta no disponible) cae en el mismo
 * `ResetLinkInvalidoError` → 400 con un único mensaje. Nunca 401: un 401
 * dispararía el refresh de `apiFetch` (`client.ts:74`).
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme", "La solicitud no filtra
 * información por tiempo de respuesta", "Confirmar con un token inválido
 * responde igual sin importar la causa", "Ambas rutas aplican rate limiting
 * propio". Ref design: ADR-1, ADR-2, ADR-3, ADR-5. Tarea: 7.2, 8.2.
 */
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfirmarResetDto, SolicitarResetDto } from '../dtos/recuperacion-password.dto';
import { SolicitarResetPasswordUseCase } from '../../application/use-cases/solicitar-reset-password.use-case';
import { ConfirmarResetPasswordUseCase } from '../../application/use-cases/confirmar-reset-password.use-case';
import { RecuperacionPasswordThrottlerGuard } from '../../infrastructure/guards/recuperacion-password-throttler.guard';
import {
  ITareasSegundoPlano,
  TAREAS_SEGUNDO_PLANO,
} from '../../../shared/domain/ports/i-tareas-segundo-plano.port';

/** Cupo de `POST /auth/forgot-password`: 3 solicitudes cada 15 min por email (ADR-3). */
const THROTTLE_LIMIT_SOLICITUD = 3;
const THROTTLE_TTL_MS_SOLICITUD = 900_000;

/** Cupo de `POST /auth/reset-password`: 5 solicitudes cada 15 min por token (ADR-3). */
const THROTTLE_LIMIT_CONFIRMACION = 5;
const THROTTLE_TTL_MS_CONFIRMACION = 900_000;

@Controller('auth')
export class RecuperacionPasswordController {
  constructor(
    @Inject(TAREAS_SEGUNDO_PLANO) private readonly tareas: ITareasSegundoPlano,
    private readonly solicitar: SolicitarResetPasswordUseCase,
    private readonly confirmar: ConfirmarResetPasswordUseCase,
  ) {}

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RecuperacionPasswordThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT_SOLICITUD, ttl: THROTTLE_TTL_MS_SOLICITUD } })
  forgotPassword(@Body() dto: SolicitarResetDto): void {
    // Nunca `await` acá (ADR-2): `lanzar` encola y retorna de inmediato, el
    // handler responde 204 antes de que corra una sola línea dependiente de
    // la rama (existencia del email, membresías, SMTP del tenant).
    this.tareas.lanzar('reset-password.solicitud', () => this.solicitar.ejecutar(dto.email));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(RecuperacionPasswordThrottlerGuard)
  @Throttle({ default: { limit: THROTTLE_LIMIT_CONFIRMACION, ttl: THROTTLE_TTL_MS_CONFIRMACION } })
  async resetPassword(@Body() dto: ConfirmarResetDto): Promise<void> {
    const resultado = await this.confirmar.ejecutar(dto.token, dto.passwordNueva);
    if (resultado.isFail()) {
      // Mismo mensaje para las 4 causas de token inválido + cuenta no
      // disponible (ADR-5, Requirement "responde igual sin importar la
      // causa"). Nunca 401 (dispararía el refresh de `apiFetch`).
      throw new BadRequestException(resultado.getError().message);
    }
  }
}
