import { Result } from '../../../shared/domain/result';
import { SinCicloActivoError } from '../../domain/errors/compras.errors';
import { CicloClienteEntity } from '../../../tickets/domain/entities/ciclo-cliente.entity';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';

/**
 * ResolverCicloActivoCompra — colaborador de aplicación que resuelve el
 * ciclo ACTIVO del tenant para `CrearCompraUseCase` (spec §4.1, S1/S2).
 *
 * Por qué NO se reusa `ResolverCicloActivoParaCreacion` de `tickets/`: ese
 * colaborador traduce "sin ciclo activo" al `SinCicloActivoError` de
 * `tickets/domain/errors` (mensaje "...crear el ticket"). Antes de este
 * cambio, `CrearCompraUseCase` lo reusaba tal cual — filtraba ESA clase y
 * ESE mensaje al cliente HTTP de `compras/`, y como
 * `ComprasController.toHttpException` hace `instanceof` contra
 * `compras/domain/errors` (no contra `tickets/`), el `instanceof` nunca
 * daba `true` pese a que ambas clases comparten `code = 'SIN_CICLO_ACTIVO'`:
 * la creación de una compra sin ciclo activo devolvía 422 en vez del 409 de
 * la spec. Esta clase es la copia MÍNIMA que corrige eso: misma forma,
 * mismo puerto de lectura, error PROPIO de `compras/`.
 *
 * Por qué SÍ se reusa `ICicloClienteRepository` (puerto de
 * `tickets/domain/ports`) en lugar de definir un puerto propio de
 * `compras/`: es la MISMA tabla `CicloCliente`, compartida entre módulos,
 * no una copia — mismo criterio que ya aplican `dashboard/application/
 * use-cases/obtener-metricas.use-case.ts` y el propio `ComprasModule`
 * (token `CICLO_CLIENTE_REPOSITORY`, ya inyectado antes de este cambio) y
 * `equipos/reparaciones` (que reusan directamente `ResolverCicloActivoParaCreacion`
 * de tickets porque crean `TicketEntity`). Duplicar el puerto de lectura no
 * tiene precedente en el repo — el desacople que hacía falta era el del
 * ERROR de dominio, no el de la fuente de lectura.
 *
 * No lanza: el fallo esperado (sin ciclo activo) se modela con
 * `Result.fail(SinCicloActivoError)`, nunca con `throw` — mismo contrato
 * que `ResolverCicloActivoParaCreacion` de tickets.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1 (S1, S2). Tarea:
 * fix-ciclo-activo-cross-module.
 */
export class ResolverCicloActivoCompra {
  constructor(private readonly cicloRepo: Pick<ICicloClienteRepository, 'findActive'>) {}

  /** Retorna el ciclo activo del tenant, o SinCicloActivoError (compras) si no hay ninguno. */
  async resolver(): Promise<Result<CicloClienteEntity, SinCicloActivoError>> {
    const activo = await this.cicloRepo.findActive();
    if (!activo) {
      return Result.fail(new SinCicloActivoError());
    }
    return Result.ok(activo);
  }
}
