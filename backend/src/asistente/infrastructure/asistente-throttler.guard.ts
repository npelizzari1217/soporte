import { createHash } from 'node:crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtPayload } from '../../auth/domain/ports/i-token.service';

/** Consultas al asistente por persona dentro de la ventana (S7). */
export const ASISTENTE_LIMITE = 10;
/** Ventana del cupo, en milisegundos (1 minuto). */
export const ASISTENTE_VENTANA_MS = 60_000;

/**
 * Tope de consultas al asistente por persona (S7). El tracker es el `sub` del JWT, no la IP: todo el
 * tráfico llega por el BFF y el backend ve una sola IP. Corre DESPUÉS de `JwtAuthGuard`.
 * Storage en Postgres (`PostgresThrottlerStorage`): el cupo vale entre procesos y reinicios.
 */
@Injectable()
export class AsistenteThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: { user?: JwtPayload | null }): Promise<string> {
    return req.user?.sub ?? 'sin-usuario';
  }

  /** Key de storage: solo el throttler y la persona (un cupo por persona). */
  protected generateKey(_context: ExecutionContext, suffix: string, name: string): string {
    return createHash('sha256').update(`asistente-${name}-${suffix}`).digest('hex');
  }
}
