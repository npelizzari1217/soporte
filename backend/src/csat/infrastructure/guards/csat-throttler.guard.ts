/**
 * CsatThrottlerGuard — rate limiting del endpoint público de encuesta
 * (ADR-C6 del design, WU7 tarea 7.3).
 *
 * CLAVE: `${xff}:${token}` — el TOKEN es el componente PRIMARIO del
 * tracker, NO la IP. Todo el frontend habla con el backend a través del
 * proxy BFF (`frontend/src/app/api/[...path]/route.ts`), que hace `fetch()`
 * desde el server de Next: el backend ve UNA sola IP para TODOS los
 * usuarios. Una clave con la IP como componente primario colapsaría el
 * límite en un cupo compartido entre cualquier visitante. El token es la
 * unidad de abuso que importa acá (spam de POSTs sobre un link real).
 *
 * `x-forwarded-for` se agrega solo como discriminador NO confiable (es
 * falsificable, y `trust proxy` NO se habilita — deuda anotada en el
 * design): evita que dos usuarios distintos compartan cupo entre sí, pero
 * NO es un control de seguridad por sí mismo.
 *
 * Storage en memoria de un solo proceso (`ThrottlerModule.forRoot`, sin
 * `APP_GUARD`) — se aplica SOLO a `EncuestaPublicaController` vía
 * `@UseGuards`, nunca global (design: "Deuda anotada: storage en memoria de
 * un proceso. Hoy corre una sola instancia; al escalar horizontal el
 * límite se multiplica").
 *
 * Ref design: ADR-C6. Tarea: 7.3.
 */
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Cupo de requests permitidas por token dentro de la ventana (ADR-C6). */
export const CSAT_THROTTLE_LIMIT = 10;

/** Ventana del cupo, en milisegundos (60s). */
export const CSAT_THROTTLE_TTL_MS = 60_000;

@Injectable()
export class CsatThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const params = req.params as Record<string, string> | undefined;
    const token = params?.token ?? 'sin-token';

    const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
    const xffRaw = headers?.['x-forwarded-for'];
    const xff = (Array.isArray(xffRaw) ? xffRaw[0] : xffRaw) ?? 'sin-ip';

    return `${xff}:${token}`;
  }
}
