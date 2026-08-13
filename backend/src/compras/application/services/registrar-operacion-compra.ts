import {
  CrearOperacionCompraProps,
  IOperacionCompraRepository,
} from '../../domain/ports/i-operacion-compra.repository';

/**
 * RegistrarOperacionCompra — colaborador de aplicación que escribe la
 * bitácora de una `Compra` (§4.10, ADR-C4). Clase PLANA, sin `@Injectable`
 * (mismo patrón que `NumeradorCompra`/`NumeradorTicket`): no depende del
 * contenedor DI de NestJS, cada caso de uso mutador la instancia con su
 * repo de bitácora.
 *
 * **Contrato — LANZA, no `Result.fail`**: `registrar()` propaga tal cual
 * cualquier error de `IOperacionCompraRepository.crear()`. Esto NO es una
 * omisión de manejo de errores: es el MECANISMO de S36 ("si falla la
 * escritura de la operación, la mutación se revierte"). Un `Result.fail`
 * permitiría que un caso de uso IGNORE el fallo y COMMITEE la mutación
 * igual — violando S36 en silencio. El `throw`, en cambio, propaga hasta el
 * callback de `client.$transaction(...)` (`PrismaTenantTransactionRunner`,
 * ver `shared/infrastructure/persistence/tenant-transaction-runner.ts`),
 * que lo rechaza y Postgres revierte TODA la transacción — incluida la
 * mutación de dominio que se acababa de persistir. Ver
 * `registrar-operacion-compra.s36.integration.spec.ts` para la prueba
 * contra Postgres real (no un mock) de este mecanismo.
 *
 * **NO abre transacción propia**: el constructor deliberadamente NO recibe
 * un `ITenantTransactionRunner` (aridad 1: solo el repo de bitácora) — debe
 * invocarse SIEMPRE desde DENTRO de la transacción abierta por el caso de
 * uso mutador que la usa. El advisory-lock/rollback de esa transacción solo
 * protege la sección crítica si `registrar()` corre en la MISMA
 * transacción que la mutación que registra.
 *
 * **Tres capas contra el olvido de cablear esta clase** (design, ADR-C4):
 * (1) compilación — argumento obligatorio del constructor de todo caso de
 * uso mutador; (2) wiring — regla "tx ⇒ bitácora" en
 * `compras.module.spec.ts` (fuera de alcance de PR-13); (3) comportamiento
 * — specs table-driven con spy sobre cada caso de uso (PR-14 en adelante).
 * Esta clase es la pieza que las tres capas protegen.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.10 (S35-S37). Ref design:
 * ADR-C4. Tarea: PR-13.
 */
export class RegistrarOperacionCompra {
  constructor(private readonly operacionRepo: Pick<IOperacionCompraRepository, 'crear'>) {}

  /**
   * Persiste una operación de bitácora (S35: exactamente 1 por mutación
   * exitosa). `datos` es opcional en la entrada — se normaliza a `null`
   * cuando no se provee, coherente con `CrearOperacionCompraProps.datos:
   * Record<string, unknown> | null` (nunca `undefined` hacia el repo).
   *
   * @throws lo que sea que lance `IOperacionCompraRepository.crear()` — ver
   * el JSDoc de la clase para por qué esto es el mecanismo de S36, no un
   * descuido.
   */
  async registrar(
    op: Omit<CrearOperacionCompraProps, 'datos'> & { datos?: Record<string, unknown> | null },
  ): Promise<void> {
    await this.operacionRepo.crear({
      compraId: op.compraId,
      itemCompraId: op.itemCompraId,
      tipo: op.tipo,
      usuarioId: op.usuarioId,
      detalle: op.detalle,
      datos: op.datos ?? null,
    });
  }
}
