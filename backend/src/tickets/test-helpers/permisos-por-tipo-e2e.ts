import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { filasDeTiposDesdeCeldas } from '../domain/permisos-tipo-ticket';

type TenantClient = InstanceType<typeof TenantPrismaClient>;

/**
 * Fixture de e2e (odd/permisos-por-tipo-ticket, T5a): concede a cada usuario, sobre TODOS los tipos
 * que el tenant tiene en este momento, las acciones que sus celdas master le dan por la tabla de
 * L11 (`filasDeTiposDesdeCeldas`, la misma que usan el backfill y las plantillas de rol). Es lo que
 * deja la migración de S7, para que los e2e escritos con celdas sigan describiendo el mismo acceso.
 *
 * A diferencia de producción, donde un tipo nuevo nace cerrado (S4), acá se vuelve a llamar después
 * de crear un tipo, para que los tipos aislados por test se comporten como uno sembrado. Idempotente:
 * las filas que ya existen se ignoran.
 *
 * @param tenant Cliente Prisma del tenant de la suite.
 * @param celdasPorUsuario Celdas master (`MODULO:ACCION`) de cada usuario, por id.
 */
export async function sembrarPermisosPorTipoE2e(
  tenant: TenantClient,
  celdasPorUsuario: ReadonlyMap<string, readonly string[]>,
): Promise<void> {
  const tipos = await tenant.tipoTicket.findMany({ select: { id: true, modulo: true } });
  const data = [...celdasPorUsuario].flatMap(([usuarioId, celdas]) =>
    filasDeTiposDesdeCeldas(celdas, tipos).map((fila) => ({ usuarioId, ...fila })),
  );
  if (data.length > 0) {
    await tenant.permisoTipoTicket.createMany({ data, skipDuplicates: true });
  }
}
