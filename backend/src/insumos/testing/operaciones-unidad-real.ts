import type { TenantContext } from '../../shared/tenancy/tenant-context';
import { OperacionesUnidadInsumo } from '../application/services/operaciones-unidad-insumo.service';
import { PrismaEventoUnidadInsumoRepository } from '../infrastructure/persistence/prisma/prisma-evento-unidad-insumo.repository';
import type { PrismaInsumoRepository } from '../infrastructure/persistence/prisma/prisma-insumo.repository';
import type { PrismaMovimientoInsumoRepository } from '../infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from '../infrastructure/persistence/prisma/prisma-unidad-insumo.repository';

/**
 * Arma `OperacionesUnidadInsumo` con sus repositorios REALES para los specs de
 * integración que construyen casos de uso de insumos a mano: ningún doble.
 */
export function construirOperacionesReal(deps: {
  tenantContext: TenantContext;
  insumoRepo: PrismaInsumoRepository;
  movimientoRepo: PrismaMovimientoInsumoRepository;
}): OperacionesUnidadInsumo {
  return new OperacionesUnidadInsumo(
    deps.insumoRepo,
    deps.movimientoRepo,
    new PrismaUnidadInsumoRepository(deps.tenantContext),
    new PrismaEventoUnidadInsumoRepository(deps.tenantContext),
  );
}
