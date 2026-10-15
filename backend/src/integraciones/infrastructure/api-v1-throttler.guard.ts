/**
 * ApiV1ThrottlerGuard — limite de pedidos por clave de la API publica (CA6).
 *
 * El tracker es el id de la clave que dejo `ApiClaveGuard`, no la IP: todo el trafico llega por el
 * BFF y el backend ve una sola IP. Debe correr DESPUES de `ApiClaveGuard`; si no hay clave
 * autenticada (no deberia pasar) usa un tracker fijo en vez de abrir un cupo por IP.
 * El cupo es UNO por clave para toda la API `v1`: la key de storage no lleva clase ni handler (a
 * diferencia de `ThrottlerGuard`), asi que todas las rutas `v1` descuentan del mismo cupo.
 * Storage en Postgres (`PostgresThrottlerStorage`): el cupo es uno solo aunque corran varios procesos.
 */
import { createHash } from 'node:crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiClaveAutenticada } from './api-clave.guard';

/** Pedidos por clave por ventana, por defecto. Se sobreescribe con `API_V1_RATE_LIMIT`. */
export const API_V1_LIMITE_POR_DEFECTO = 60;
/** Ventana del cupo, en milisegundos (1 minuto). */
export const API_V1_VENTANA_MS = 60_000;

/** Limite vigente: `API_V1_RATE_LIMIT` si es un entero positivo, si no el valor por defecto. */
export function limiteApiV1(env: NodeJS.ProcessEnv = process.env): number {
  const valor = Number(env.API_V1_RATE_LIMIT);
  return Number.isInteger(valor) && valor > 0 ? valor : API_V1_LIMITE_POR_DEFECTO;
}

@Injectable()
export class ApiV1ThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: { apiClave?: ApiClaveAutenticada }): Promise<string> {
    return req.apiClave?.id ?? 'sin-clave';
  }

  /** Key de storage: solo el throttler y la clave, nunca la ruta (un cupo por clave, CA6). */
  protected generateKey(_context: ExecutionContext, suffix: string, name: string): string {
    return createHash('sha256').update(`api-v1-${name}-${suffix}`).digest('hex');
  }
}
