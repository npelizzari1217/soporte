import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Cupo del throttler `contexto`: 30 consultas por slug y origen en la ventana (ADR-8). */
export const CONTEXTO_THROTTLE_LIMIT = 30;

/** Ventana del throttler `contexto`, en milisegundos (60 s). */
export const CONTEXTO_THROTTLE_TTL_MS = 60_000;

/**
 * PedidoPublicoThrottlerGuard — rate limiting de las rutas públicas del pedido (ADR-8).
 *
 * Throttler `contexto` (`GET contexto`): tracker `${xff}:${slug}`, molde de `CsatThrottlerGuard`.
 * Todo el frontend habla con el backend por el BFF, así que el backend ve una sola IP: el slug es
 * el componente que separa los cupos y `x-forwarded-for` es solo un discriminador falsificable.
 * Solo frena la enumeración de slugs y tokens; no protege ninguna escritura. Un slug inexistente
 * tiene su propio contador, así que el 429 tampoco revela existencia.
 *
 * Los throttlers con nombre (`getOptionsToken()`) y el `ThrottlerStorage` se proveen locales en
 * `FormularioPublicoModule`; no hay `ThrottlerModule.forRoot` ni `APP_GUARD`.
 *
 * Ref design: ADR-8. Tarea: 12.3.
 */
@Injectable()
export class PedidoPublicoThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const params = req.params as Record<string, string> | undefined;
    const slug = params?.slug ?? 'sin-slug';

    const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
    const xffRaw = headers?.['x-forwarded-for'];
    const xff = (Array.isArray(xffRaw) ? xffRaw[0] : xffRaw) ?? 'sin-ip';

    return `${xff}:${slug}`;
  }
}
