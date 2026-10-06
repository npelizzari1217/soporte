/**
 * xlsx.ts — serialización a .xlsx para las exportaciones de listados.
 *
 * Consume las MISMAS columnas que `serializarCsv` (`ColumnaCsv<T>`): el
 * listado de columnas se define una sola vez y alimenta a los dos
 * serializadores. Lo que cambia es la celda: el CSV emite texto; acá las
 * celdas tipadas (`CeldaNumericaCsv`, `CeldaFechaCsv`) y los números crudos
 * salen como celdas numéricas / fechas reales de Excel, y el resto como
 * texto.
 *
 * Seguridad frente a la inyección de fórmulas: toda celda se escribe como
 * VALOR. exceljs guarda un string como string compartido (`t="s"`), nunca
 * como fórmula, aunque empiece con `=`, `+`, `-` o `@`, así que no hace falta
 * el apóstrofo del CSV (que acá se vería como un carácter de más). Este
 * archivo NO debe asignar nunca `.formula`.
 *
 * Ref: docs/roadmap-comercial.md, segunda etapa, punto 3.
 */

import ExcelJS from 'exceljs';
import { ColumnaCsv, esCeldaTipada, ValorCelda } from '../csv/csv';

const NOMBRE_HOJA = 'Datos';
const FORMATO_FECHA = 'dd/mm/yyyy';
const FORMATO_FECHA_HORA = 'dd/mm/yyyy hh:mm';
const ANCHO_MINIMO = 10;
const ANCHO_MAXIMO = 60;

/** Contenido de una celda ya resuelto: lo que se escribe y con qué formato numérico. */
interface CeldaResuelta {
  valor: string | number | boolean | Date | null;
  formato?: string;
  /** Largo del texto que Excel mostrará, para estimar el ancho de columna. */
  largo: number;
}

function resolver(valor: ValorCelda): CeldaResuelta {
  if (valor === null || valor === undefined) {
    return { valor: null, largo: 0 };
  }
  if (esCeldaTipada(valor)) {
    if (valor.tipo === 'numero') {
      if (valor.valor === undefined) {
        // Celda numérica sin valor crudo (construida a mano): cae a texto.
        return { valor: valor.texto, largo: valor.texto.length };
      }
      return {
        valor: valor.valor,
        formato: valor.decimales === 0 ? '0' : '0.00',
        largo: valor.texto.length,
      };
    }
    return {
      valor: valor.fecha,
      formato: valor.tipo === 'fecha' ? FORMATO_FECHA : FORMATO_FECHA_HORA,
      largo: valor.texto.length,
    };
  }
  return { valor, largo: String(valor).length };
}

/**
 * Serializa filas a un .xlsx completo: encabezado en negrita y congelado,
 * autofiltro sobre el encabezado y anchos de columna acordes al contenido.
 *
 * @param filas Filas a exportar, en el orden en que deben salir.
 * @param columnas Columnas del archivo, en el orden en que deben aparecer.
 * @returns El contenido binario del libro.
 */
export async function serializarXlsx<T>(
  filas: readonly T[],
  columnas: readonly ColumnaCsv<T>[],
): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet(NOMBRE_HOJA, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const anchos = columnas.map((columna) => columna.encabezado.length);

  const encabezado = hoja.addRow(columnas.map((columna) => columna.encabezado));
  encabezado.font = { bold: true };

  for (const fila of filas) {
    const resueltas = columnas.map((columna) => resolver(columna.valor(fila)));
    const filaHoja = hoja.addRow(resueltas.map((celda) => celda.valor));
    resueltas.forEach((celda, indice) => {
      if (celda.formato !== undefined) {
        filaHoja.getCell(indice + 1).numFmt = celda.formato;
      }
      anchos[indice] = Math.max(anchos[indice], celda.largo);
    });
  }

  columnas.forEach((_columna, indice) => {
    // +2: aire para el botón del autofiltro y el padding de la celda.
    hoja.getColumn(indice + 1).width = Math.min(
      ANCHO_MAXIMO,
      Math.max(ANCHO_MINIMO, anchos[indice] + 2),
    );
  });

  if (columnas.length > 0) {
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columnas.length },
    };
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
