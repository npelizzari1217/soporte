/**
 * RecuperacionPasswordController — WU-7: `POST /auth/forgot-password`
 * (ADR-1, ADR-2, ADR-3 del design).
 *
 * Ruta PÚBLICA, sin `JwtAuthGuard` — quien la llama no tiene sesión.
 * Protegida por `RecuperacionPasswordThrottlerGuard` (ADR-3): 3 solicitudes
 * cada 15 min POR EMAIL, sin `x-forwarded-for` (es falsificable, sumarlo
 * sería un bypass del cupo).
 *
 * El handler NUNCA awaitea `SolicitarResetPasswordUseCase.ejecutar`: solo
 * encola la tarea vía `ITareasSegundoPlano.lanzar` y responde 204 de
 * inmediato (ADR-2) — así el código, el cuerpo y los headers de la
 * respuesta son idénticos en toda rama (existencia del email, membresías,
 * SMTP del tenant).
 *
 * `POST /auth/reset-password` (confirmación) se suma en WU-8.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "La solicitud de
 * reset devuelve una respuesta uniforme", "La solicitud no filtra
 * información por tiempo de respuesta", "Ambas rutas aplican rate limiting
 * propio". Ref design: ADR-1, ADR-2, ADR-3. Tarea: 7.2.
 */
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SolicitarResetDto } from '../dtos/recuperacion-password.dto';
import { SolicitarResetPasswordUseCase } from '../../application/use-cases/solicitar-reset-password.use-case';
import { RecuperacionPasswordThrottlerGuard } from '../../infrastructure/guards/recuperacion-password-throttler.guard';
import {
  ITareasSegundoPlano,
  TAREAS_SEGUNDO_PLANO,
} from '../../../shared/domain/ports/i-tareas-segundo-plano.port';

/** Cupo de `POST /auth/forgot-password`: 3 solicitudes cada 15 min por email (ADR-3). */
const THROTTLE_LIMIT_SOLICITUD = 3;
const THROTTLE_TTL_MS_SOLICITUD = 900_000;

@Controller('auth')
export class RecuperacionPasswordController {
  constructor(
    @Inject(TAREAS_SEGUNDO_PLANO) private readonly tareas: ITareasSegundoPlano,
    private readonly solicitar: SolicitarResetPasswordUseCase,
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
}
