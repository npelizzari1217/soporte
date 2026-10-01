import type { ITenantTransactionRunner } from '../../shared/infrastructure/persistence/tenant-transaction-runner';
import type { TenantContext } from '../../shared/tenancy/tenant-context';
import { OperacionesUnidadInsumo } from '../application/services/operaciones-unidad-insumo.service';
import { RegistrarEntradaInsumoUseCase } from '../application/use-cases/registrar-entrada-insumo.use-case';
import { PrismaEventoUnidadInsumoRepository } from '../infrastructure/persistence/prisma/prisma-evento-unidad-insumo.repository';
import type { PrismaFamiliaInsumoRepository } from '../infrastructure/persistence/prisma/prisma-familia-insumo.repository';
import type { PrismaInsumoRepository } from '../infrastructure/persistence/prisma/prisma-insumo.repository';
import type { PrismaMovimientoInsumoRepository } from '../infrastructure/persistence/prisma/prisma-movimiento-insumo.repository';
import { PrismaUnidadInsumoRepository } from '../infrastructure/persistence/prisma/prisma-unidad-insumo.repository';

/**
 * Arma la entrada de insumos con sus colaboradores REALES (incluido el servicio
 * de unidades) para los specs de integración de otros módulos: ningún doble.
 */
export function construirEntradaReal(deps: {
  tenantContext: TenantContext;
  txRunner: Pick<ITenantTransactionRunner, 'run'>;
  insumoRepo: PrismaInsumoRepository;
  movimientoRepo: PrismaMovimientoInsumoRepository;
  familiaRepo: PrismaFamiliaInsumoRepository;
}): RegistrarEntradaInsumoUseCase {
  const operaciones = new OperacionesUnidadInsumo(
    deps.insumoRepo,
    deps.movimientoRepo,
    new PrismaUnidadInsumoRepository(deps.tenantContext),
    new PrismaEventoUnidadInsumoRepository(deps.tenantContext),
  );
  return new RegistrarEntradaInsumoUseCase(
    deps.insumoRepo,
    deps.movimientoRepo,
    deps.familiaRepo,
    deps.txRunner,
    operaciones,
  );
}
