import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * RecuperacionPasswordThrottlerGuard — rate limiting propio de
 * `POST /auth/forgot-password` y `POST /auth/reset-password` (ADR-3,
 * `reseteo-contrasena-olvidada`).
 *
 * El tracker es **solo** el email (normalizado) o **solo** el token del
 * body, **sin** `x-forwarded-for`. A diferencia de `CsatThrottlerGuard`
 * (`${xff}:${token}`), acá sumar el `xff` sería un bypass: basta con
 * rotarlo — es falsificable — para obtener un cupo nuevo sobre el mismo
 * buzón o token.
 *
 * `ThrottlerModule` es `@Global()` y `CsatModule` ya llama `forRoot`: un
 * segundo `forRoot` registraría dos `THROTTLER_OPTIONS` globales (sin
 * verificar cómo lo resuelve Nest). Por eso este guard se instancia por
 * `useFactory` en `RecuperacionPasswordModule`, con su propia
 * `ThrottlerStorageService` — nunca vía `ThrottlerModule.forRoot`.
 *
 * Los límites reales (3/15min solicitud, 5/15min confirmación) se fijan
 * por ruta con `@Throttle({ default: { limit, ttl } })` en el controller
 * (WU-7/WU-8); las opciones del constructor son solo el fallback base.
 *
 * Ref design: ADR-3. Tarea: 4.4.
 */
@Injectable()
export class RecuperacionPasswordThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as Record<string, unknown> | undefined;

    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : undefined;
    if (email) {
      return email;
    }

    const token = typeof body?.token === 'string' ? body.token : undefined;
    // Un body sin email ni token comparte este único contador. Ningún cliente
    // legítimo lo alcanza (siempre manda uno de los dos) y el pedido igual
    // falla la validación del DTO: agotarlo solo frena pedidos malformados.
    return token ?? 'sin-identificador';
  }
}
