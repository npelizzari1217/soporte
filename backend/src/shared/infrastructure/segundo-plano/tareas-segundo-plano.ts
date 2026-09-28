import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ITareasSegundoPlano } from '../../domain/ports/i-tareas-segundo-plano.port';
import { ILogger } from '../../domain/ports/i-logger.port';

/**
 * TareasSegundoPlano — implementación de `ITareasSegundoPlano` con
 * `setImmediate` (ADR-2, `reseteo-contrasena-olvidada`).
 *
 * Cada `lanzar()` difiere `tarea` al siguiente tick con `setImmediate` y la
 * registra en un `Set` de pendientes hasta que termina. Un rechazo se
 * atrapa y loguea con `SEGUNDO_PLANO_ERROR | tarea=<etiqueta> |
 * error=<nombre>` (solo el TIPO del error, [S2]) — nunca se propaga ni
 * revienta el proceso.
 *
 * `esperarPendientes()` resuelve cuando el `Set` queda vacío: la usan los
 * tests (sin `sleep`) y `onApplicationShutdown()`, para no cortar envíos en
 * curso al apagar.
 *
 * Ref design: ADR-2. Tarea: 4.2.
 */
@Injectable()
export class TareasSegundoPlano implements ITareasSegundoPlano, OnApplicationShutdown {
  private readonly pendientes = new Set<Promise<void>>();

  constructor(private readonly logger: ILogger) {}

  lanzar(etiqueta: string, tarea: () => Promise<void>): void {
    // `promesa` se referencia dentro del callback de `setImmediate`, que
    // corre en un tick posterior: para entonces esta constante ya está
    // asignada, sin problema de TDZ.
    const promesa: Promise<void> = new Promise<void>((resolve) => {
      setImmediate(() => {
        Promise.resolve()
          .then(() => tarea())
          .catch((error: unknown) => {
            // [S2] Solo el TIPO del error, nunca `.message` — puede traer un
            // email u otro dato sensible de la tarea diferida.
            const tipo = error instanceof Error ? error.name : typeof error;
            this.logger.error(`SEGUNDO_PLANO_ERROR | tarea=${etiqueta} | error=${tipo}`);
          })
          .finally(() => {
            this.pendientes.delete(promesa);
            resolve();
          });
      });
    });
    this.pendientes.add(promesa);
  }

  /** Resuelve cuando no queda ninguna tarea diferida pendiente. */
  async esperarPendientes(): Promise<void> {
    // `Promise.all` toma una foto del Set: se repite hasta vaciarlo, porque
    // una tarea puede lanzar otra mientras se espera.
    while (this.pendientes.size > 0) {
      await Promise.all(this.pendientes);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.esperarPendientes();
  }
}
