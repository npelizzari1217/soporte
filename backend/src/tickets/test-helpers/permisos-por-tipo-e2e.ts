import { CodigoAccion, PARES_VALIDOS } from '../../shared/domain/acciones';
import { TenantPrismaClient } from '../../shared/infrastructure/persistence/prisma-clients';
import { AccionTipoTicket } from '../domain/permisos-tipo-ticket';

type TenantClient = InstanceType<typeof TenantPrismaClient>;

/** Módulo de las celdas de un fixture que se traducen a acciones por tipo. */
type ModuloOrigen = 'TICKETS' | 'EDILICIA';

/**
 * Tabla de L11 (odd/permisos-por-tipo-ticket): celda de fixture → acciones por tipo. Es una copia
 * para los fixtures: la traducción de producción se retiró con el backfill en T9c, y los e2e
 * escritos con celdas la siguen usando para describir el acceso de sus actores.
 */
const TRADUCCION_DE_FIXTURE: Readonly<
  Record<ModuloOrigen, Readonly<Record<string, readonly AccionTipoTicket[]>>>
> = {
  TICKETS: {
    LECTURA: ['LECTURA'],
    VER_TODOS: ['VER_TODOS'],
    ALTAS: ['ALTAS'],
    MODIFICACION: ['MODIFICACION'],
    TRANSICIONAR: ['TRANSICIONAR'],
    ASIGNAR: ['ASIGNAR'],
    COMENTAR: ['COMENTAR'],
    OBSERVAR: ['OBSERVAR'],
  },
  // Ver todos sobre un tipo de Edilicia sale de `TICKETS:VER_TODOS` (L35).
  EDILICIA: {
    LECTURA: ['LECTURA'],
    ALTAS: ['ALTAS'],
    MODIFICACION: ['MODIFICACION', 'TRANSICIONAR', 'COMENTAR'],
  },
};

/**
 * Módulos cuyas celdas toma un tipo, según su `modulo` (L21, L23, L35). Un módulo fuera de la tabla
 * no toma ninguna: el tipo queda cerrado.
 */
const ORIGENES_POR_MODULO_DEL_TIPO: Readonly<Record<string, readonly ModuloOrigen[]>> = {
  TICKETS: ['TICKETS'],
  COMPRAS: ['TICKETS'],
  EQUIPOS: ['TICKETS'],
  EDILICIA: ['TICKETS', 'EDILICIA'],
};

/**
 * Acciones que las celdas de un fixture dan sobre un tipo, con la tabla de L11. Un tipo que no es de
 * TICKETS pero toma sus celdas no da nada a quien no tiene ninguna celda del módulo del tipo (L23).
 * Imprimir acompaña a Ver; Borrar no sale nunca.
 *
 * @param celdas Celdas del fixture, como códigos `MODULO:ACCION`.
 * @param moduloDelTipo Valor de `tipos_ticket.modulo` del tipo.
 * @returns Las acciones concedidas sobre ese tipo.
 */
function accionesDeFixture(
  celdas: readonly string[],
  moduloDelTipo: string,
): Set<AccionTipoTicket> {
  const acciones = new Set<AccionTipoTicket>();
  const origenes = ORIGENES_POR_MODULO_DEL_TIPO[moduloDelTipo];
  if (origenes === undefined) return acciones;
  if (
    origenes.some((origen) => origen !== moduloDelTipo) &&
    !celdas.some((celda) => celda.startsWith(`${moduloDelTipo}:`))
  ) {
    return acciones;
  }
  for (const origen of origenes) {
    const prefijo = `${origen}:`;
    for (const celda of celdas) {
      if (!celda.startsWith(prefijo)) continue;
      for (const accion of TRADUCCION_DE_FIXTURE[origen][celda.slice(prefijo.length)] ?? []) {
        acciones.add(accion);
      }
    }
  }
  if (acciones.has('LECTURA')) acciones.add('IMPRESION');
  return acciones;
}

/**
 * Fixture de e2e (odd/permisos-por-tipo-ticket, T5a): concede a cada usuario, sobre TODOS los tipos
 * que el tenant tiene en este momento, las acciones que sus celdas de fixture le dan por la tabla de
 * L11 (`accionesDeFixture`). Así los e2e escritos con celdas siguen describiendo el mismo acceso,
 * aunque desde T9b las celdas de tickets ya no existan en la matriz.
 *
 * A diferencia de producción, donde un tipo nuevo nace cerrado (S4), acá se vuelve a llamar después
 * de crear un tipo, para que los tipos aislados por test se comporten como uno sembrado. Idempotente:
 * las filas que ya existen se ignoran.
 *
 * @param tenant Cliente Prisma del tenant de la suite.
 * @param celdasPorUsuario Celdas de fixture (`MODULO:ACCION`) de cada usuario, por id.
 */
export async function sembrarPermisosPorTipoE2e(
  tenant: TenantClient,
  celdasPorUsuario: ReadonlyMap<string, readonly string[]>,
): Promise<void> {
  const tipos = await tenant.tipoTicket.findMany({ select: { id: true, modulo: true } });
  const data = [...celdasPorUsuario].flatMap(([usuarioId, celdas]) =>
    tipos.flatMap((tipo) =>
      [...accionesDeFixture(celdas, tipo.modulo)].map((accion) => ({
        usuarioId,
        tipoId: tipo.id,
        accion,
      })),
    ),
  );
  if (data.length > 0) {
    await tenant.permisoTipoTicket.createMany({ data, skipDuplicates: true });
  }
}

/**
 * Las celdas de un fixture que todavía se guardan en la matriz master: las del catálogo. Desde T9b
 * (odd/permisos-por-tipo-ticket, L50.1-2) `TICKETS:*` y `EDILICIA:LECTURA|ALTAS|MODIFICACION` ya no
 * son pares válidos y el CHECK de `usuario_cliente_permisos` las rechaza: en los e2e escritos con
 * celdas solo describen las filas por tipo que siembra `sembrarPermisosPorTipoE2e`.
 *
 * @param celdas Celdas del fixture, como códigos `MODULO:ACCION`.
 * @returns Las que son pares del catálogo, en el orden del catálogo.
 */
export function celdasDeLaMatriz(celdas: readonly string[]): CodigoAccion[] {
  return PARES_VALIDOS.filter((par) => celdas.includes(par));
}
