import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/** Cupo del throttler `contexto`: 30 consultas por slug y origen en la ventana (ADR-8). */
export const CONTEXTO_THROTTLE_LIMIT = 30;

/** Ventana del throttler `contexto`, en milisegundos (60 s). */
export const CONTEXTO_THROTTLE_TTL_MS = 60_000;

/** Cupo del throttler `email`: 3 solicitudes por cliente y email en la ventana (D10, ADR-8). */
export const EMAIL_THROTTLE_LIMIT = 3;

/** Ventana del throttler `email`, en milisegundos (15 min). */
export const EMAIL_THROTTLE_TTL_MS = 15 * 60_000;

/** Cupo del throttler `cliente`: 30 solicitudes por slug en la ventana (D10, ADR-8). */
export const CLIENTE_THROTTLE_LIMIT = 30;

/** Ventana del throttler `cliente`, en milisegundos (60 min). */
export const CLIENTE_THROTTLE_TTL_MS = 60 * 60_000;

/** Tope de caracteres del email en la clave: un body hostil no infla el storage en memoria. */
const EMAIL_CLAVE_MAX = 320;

function slugDe(req: Record<string, unknown>): string {
  const params = req.params as Record<string, string> | undefined;
  return params?.slug ?? 'sin-slug';
}

/**
 * Tracker del throttler `email`: `${slug}:${email normalizado}`. SIN `x-forwarded-for`: es
 * falsificable, y sumarlo permitiría rotarlo para obtener un cupo nuevo sobre el mismo buzón
 * (D10). Es por cliente, como el escenario de la spec. Un body sin email comparte un contador.
 */
export function trackerEmail(req: Record<string, unknown>): string {
  const body = req.body as Record<string, unknown> | undefined;
  const email =
    typeof body?.email === 'string'
      ? body.email.trim().toLowerCase().slice(0, EMAIL_CLAVE_MAX)
      : 'sin-email';
  return `${slugDe(req)}:${email}`;
}

/**
 * Tracker del throttler `cliente`: solo el slug. Un slug inexistente tiene su propio contador,
 * así que el 429 no revela si el cliente existe.
 */
export function trackerCliente(req: Record<string, unknown>): string {
  return slugDe(req);
}

/**
 * PedidoPublicoThrottlerGuard — rate limiting de las rutas públicas del pedido (ADR-8).
 *
 * Throttler `contexto` (`GET contexto`): tracker `${xff}:${slug}`, molde de `CsatThrottlerGuard`
 * (es el `getTracker` de la clase, el de cualquier throttler sin tracker propio). Los throttlers
 * `email` y `cliente` (`POST solicitud`) llevan su propio `getTracker` en las opciones del módulo
 * (`trackerEmail`, `trackerCliente`); cada ruta aplica `@SkipThrottle` sobre los que no le tocan.
 * Todo el frontend habla con el backend por el BFF, así que el backend ve una sola IP: el slug es
 * el componente que separa los cupos y `x-forwarded-for` es solo un discriminador falsificable.
 * Solo frena la enumeración de slugs y tokens; no protege ninguna escritura. Un slug inexistente
 * tiene su propio contador, así que el 429 tampoco revela existencia.
 *
 * Los throttlers con nombre (`getOptionsToken()`) y el `ThrottlerStorage` se proveen locales en
 * `FormularioPublicoModule`; no hay `ThrottlerModule.forRoot` ni `APP_GUARD`.
 *
 * Ref design: ADR-8. Tarea: 12.3, 13.3.
 */
@Injectable()
export class PedidoPublicoThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const slug = slugDe(req);

    const headers = req.headers as Record<string, string | string[] | undefined> | undefined;
    const xffRaw = headers?.['x-forwarded-for'];
    const xff = (Array.isArray(xffRaw) ? xffRaw[0] : xffRaw) ?? 'sin-ip';

    return `${xff}:${slug}`;
  }
}
