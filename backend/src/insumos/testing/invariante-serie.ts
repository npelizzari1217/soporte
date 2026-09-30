import { EventoUnidadInsumoEntity } from '../domain/entities/evento-unidad-insumo.entity';
import {
  CONDICIONES_STOCK,
  ConteoPorCondicion,
  calcularSaldos,
  SumasPorCondicionYTipo,
} from '../domain/entities/tipo-movimiento-insumo';
import {
  EstadoUnidadInsumo,
  TipoEventoUnidad,
  UnidadInsumoEntity,
} from '../domain/entities/unidad-insumo.entity';
import { IEventoUnidadInsumoRepository } from '../domain/ports/i-evento-unidad-insumo.repository';
import { IMovimientoInsumoRepository } from '../domain/ports/i-movimiento-insumo.repository';
import { IUnidadInsumoRepository } from '../domain/ports/i-unidad-insumo.repository';

/**
 * Estado en el que deja a la unidad cada evento que mueve su estado (ADR-9). Es
 * un `Record` parcial a propósito: `SERIAL_CARGADO` y `CORRECCION_SERIAL` no
 * mueven el estado (la unidad queda donde estaba), así que no tienen fila y el
 * chequeo las salta.
 */
const ESTADO_TRAS_EVENTO: Readonly<
  Record<Exclude<TipoEventoUnidad, 'SERIAL_CARGADO' | 'CORRECCION_SERIAL'>, EstadoUnidadInsumo>
> = {
  INGRESO: 'EN_DEPOSITO',
  ALTA_INSTALADA: 'INSTALADA',
  INSTALACION: 'INSTALADA',
  RETIRO_A_DEPOSITO: 'EN_DEPOSITO',
  DESCARTE: 'DESCARTADA',
  ENTREGA: 'ENTREGADA',
  DEVOLUCION_DE_ENTREGA: 'EN_DEPOSITO',
  BAJA_DE_DEPOSITO: 'DESCARTADA',
  RECUPERACION: 'EN_DEPOSITO',
  REACTIVACION: 'INSTALADA',
};

/** Una unidad con su historia completa, en orden cronológico. */
export interface UnidadConHistoria {
  unidad: UnidadInsumoEntity;
  eventos: readonly EventoUnidadInsumoEntity[];
}

/**
 * Invariante de las series de un insumo `SERIE` (sdd/repuestos-numero-de-serie,
 * ADR-2 y ADR-9), sobre datos ya leídos. Devuelve una descripción por cada
 * violación; vacío significa que se cumple:
 *
 * 1. El conteo de unidades `EN_DEPOSITO` por condición coincide con el saldo
 *    que calcula `calcularSaldos()` del libro de movimientos.
 * 2. El último evento que mueve el estado de cada unidad coincide con su estado.
 *
 * @param entrada Conteo `EN_DEPOSITO`, sumas del libro y las unidades con su historia.
 * @returns Las violaciones encontradas, en texto legible para el mensaje del assert.
 */
export function verificarInvarianteSerie(entrada: {
  conteoEnDeposito: ConteoPorCondicion;
  sumasDelLibro: SumasPorCondicionYTipo;
  unidades: readonly UnidadConHistoria[];
}): string[] {
  const violaciones: string[] = [];

  const saldos = calcularSaldos(entrada.sumasDelLibro);
  for (const condicion of CONDICIONES_STOCK) {
    if (entrada.conteoEnDeposito[condicion] !== saldos[condicion]) {
      violaciones.push(
        `${condicion}: hay ${entrada.conteoEnDeposito[condicion]} unidades EN_DEPOSITO y el libro da saldo ${saldos[condicion]}.`,
      );
    }
  }

  for (const { unidad, eventos } of entrada.unidades) {
    const ultimo = [...eventos].reverse().find((evento) => esEventoDeEstado(evento.tipo));
    if (ultimo === undefined) {
      violaciones.push(`La unidad ${unidad.id} no tiene ningún evento que determine su estado.`);
      continue;
    }
    const esperado = ESTADO_TRAS_EVENTO[ultimo.tipo as keyof typeof ESTADO_TRAS_EVENTO];
    if (esperado !== unidad.estado) {
      violaciones.push(
        `La unidad ${unidad.id} está ${unidad.estado} pero su último evento (${ultimo.tipo}) la deja ${esperado}.`,
      );
    }
  }

  return violaciones;
}

function esEventoDeEstado(tipo: TipoEventoUnidad): boolean {
  return tipo in ESTADO_TRAS_EVENTO;
}

/**
 * Lee de los repositorios todo lo que el invariante necesita para un insumo y
 * lo verifica. Sin locks: es una foto para specs de integración, que la toman
 * con el sistema quieto.
 *
 * @param repos Los repositorios reales (o fakes) de unidades, movimientos y eventos.
 * @param insumoId Insumo `SERIE` a verificar.
 * @returns Las violaciones encontradas; vacío si el invariante se cumple.
 */
export async function leerYVerificarInvarianteSerie(
  repos: {
    unidadRepo: Pick<IUnidadInsumoRepository, 'listarPorInsumo' | 'contarEnDepositoPorCondicion'>;
    movimientoRepo: Pick<IMovimientoInsumoRepository, 'sumByTipo'>;
    eventoRepo: Pick<IEventoUnidadInsumoRepository, 'listarPorUnidad'>;
  },
  insumoId: string,
): Promise<string[]> {
  const unidades = await repos.unidadRepo.listarPorInsumo(insumoId);
  const conHistoria: UnidadConHistoria[] = [];
  for (const unidad of unidades) {
    conHistoria.push({ unidad, eventos: await repos.eventoRepo.listarPorUnidad(unidad.id) });
  }
  return verificarInvarianteSerie({
    conteoEnDeposito: await repos.unidadRepo.contarEnDepositoPorCondicion(insumoId),
    sumasDelLibro: await repos.movimientoRepo.sumByTipo(insumoId),
    unidades: conHistoria,
  });
}
