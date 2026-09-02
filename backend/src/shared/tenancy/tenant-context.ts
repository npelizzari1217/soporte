import { AsyncLocalStorage } from 'node:async_hooks';
import { ZonaHoraria } from '../domain/zona-horaria';

/**
 * TenantContextData — datos del tenant activo para el request actual.
 *
 * Se inyecta por request vía un guard/middleware de tenant (a implementar en
 * el módulo auth) y se recupera por los repositorios de infraestructura sin
 * que estos conozcan el ORM directamente.
 */
export interface TenantContextData {
  /** Cliente Prisma del tenant activo (normal o dentro de una transacción). */
  prismaClient: unknown;
  /** Nombre de la base de datos PostgreSQL del tenant (ej. "cliente_acme"). */
  dbName: string;
  /** UUID del cliente en la DB master (master.clientes.id). */
  clienteId: string;
  /**
   * Zona horaria operativa del tenant activo (sdd/zona-horaria-por-tenant,
   * D3). La bindean los DOS caminos que resuelven el cliente contra master:
   * `TenantGuard` (pipeline HTTP) y `ResolverEncuestaTokenService` (token
   * público de encuesta, sin JWT). Los dos la sacan del mismo `findById` que
   * ya ejecutan — cero queries nuevas. Los repositorios de infraestructura
   * que necesiten la zona la leen de acá, nunca re-consultando
   * `IClienteRepository`.
   *
   * OPCIONAL, igual criterio que `enTransaccion`/`postCommitCallbacks`: los
   * schedulers de barrido (`preventivo-sweep.scheduler.ts`,
   * `sla-sweep.scheduler.ts`) y los tests de infraestructura bindean un
   * `TenantContextData` a mano y NO la llevan — quedan sin tocar (fuera de
   * alcance de WU-3, C3a; ver la deuda abierta de D3 en `tasks.md`).
   * `undefined` en ese caso, nunca un default silencioso.
   */
  zonaHoraria?: ZonaHoraria;
  /**
   * `true` cuando `prismaClient` es un `Prisma.TransactionClient` (re-bindeado
   * por `PrismaTenantTransactionRunner.run()` al abrir una transacción).
   *
   * Un `TransactionClient` NO expone `$transaction` (deny-list de Prisma):
   * llamado con el cast que usaba `run()`, revienta en runtime con
   * `TypeError`, no al compilar. Este flag es lo que hace a `run()`
   * re-entrante — si ya está marcado, un `run()` anidado participa de la
   * transacción en curso en vez de intentar abrir una nueva.
   *
   * Ref: sdd/preventivo/design ADR-PV5, sdd/preventivo/tasks WU-0 (0.1/0.2).
   */
  enTransaccion?: boolean;
  /**
   * Cola de callbacks post-commit encolados vía `ITenantTransactionRunner.alCommitear()`.
   *
   * La crea `PrismaTenantTransactionRunner.run()` al abrir la transacción MÁS
   * EXTERNA (mismo array durante toda su vida). Un `run()` anidado (re-entrante,
   * `enTransaccion: true`) reutiliza el MISMO objeto `ctx` — nunca crea uno
   * nuevo — así que comparte esta misma cola: un `alCommitear()` llamado
   * desde dentro de un caller re-entrante (ej. `CrearTicketUseCase` invocado
   * por `GenerarPreventivosUseCase`, ADR-PV5) queda diferido hasta que
   * comitea la transacción de más afuera, no la interna.
   *
   * Ref: sdd/preventivo/apply-progress-wu5-postcommit.
   */
  postCommitCallbacks?: Array<() => void>;
}

/**
 * TenantStore — contenedor mutable interno del AsyncLocalStorage.
 *
 * Se usa un wrapper mutable (en vez de guardar TenantContextData
 * directamente) para que un guard que corre luego de un middleware pueda
 * mutar el store compartido y que el controller/los repositorios —que heredan
 * la misma referencia desde el `run()` del middleware— vean el contexto
 * actualizado sin depender de la propagación de `enterWith()` entre recursos
 * async hermanos.
 */
type TenantStore = { data: TenantContextData | null };

/**
 * TenantContext — wrapper de AsyncLocalStorage para aislamiento por request.
 *
 * Uso previsto (a implementar junto con el guard de tenant en auth/):
 * - `initScope(fn)` desde un middleware: abre un scope mutable ANTES de los
 *   guards.
 * - `bind(ctx)` desde el guard de tenant: bindea el contexto mutando el scope
 *   activo, o usa `enterWith()` como fallback si no hay scope (tests, scripts).
 * - `get()` / `getClient()`: leídos por los repositorios de infraestructura.
 */
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  /** Inicia un scope mutable vacío para la duración del request HTTP. */
  initScope(fn: () => void): void {
    this.storage.run({ data: null }, fn);
  }

  /** Ejecuta `fn` dentro de un scope con `ctx` como valor activo. */
  async run<T>(ctx: TenantContextData, fn: () => Promise<T>): Promise<T> {
    return this.storage.run({ data: ctx }, fn);
  }

  /** Retorna el contexto del tenant activo, o `undefined` fuera de scope. */
  get(): TenantContextData | undefined {
    return this.storage.getStore()?.data ?? undefined;
  }

  /**
   * Retorna el PrismaClient activo (directo o transaccional).
   *
   * @throws Error si no hay TenantContext activo.
   */
  getClient(): unknown {
    const ctx = this.get();
    if (!ctx) {
      throw new Error('No hay TenantContext activo. ¿Falta el guard/middleware de tenant?');
    }
    return ctx.prismaClient;
  }

  /**
   * Vincula el contexto del tenant al scope asíncrono actual.
   *
   * Si ya hay un scope mutable activo (creado por `initScope()`), muta el
   * objeto compartido. Si no hay scope activo (unit tests, scripts), usa
   * `enterWith()` como fallback.
   */
  bind(ctx: TenantContextData): void {
    const store = this.storage.getStore();
    if (store !== undefined) {
      store.data = ctx;
    } else {
      this.storage.enterWith({ data: ctx });
    }
  }
}
