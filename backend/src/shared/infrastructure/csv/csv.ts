/**
 * csv.ts — serialización a CSV para las exportaciones de listados.
 *
 * Vive en `shared/infrastructure` y no en el dominio porque el CSV es un
 * detalle de salida: ningún invariante de negocio depende de él. Los módulos
 * arman sus columnas (qué exportar) y este archivo resuelve el CÓMO (formato,
 * escapado, codificación) una sola vez para todos.
 *
 * Las tres decisiones de formato están tomadas para el destino real de estos
 * archivos: Excel en Windows con configuración regional en español. Cada una
 * está justificada en su propia constante o función, porque las tres se ven
 * arbitrarias hasta que el archivo se abre mal.
 *
 * Ref: docs/roadmap-comercial.md punto 1.
 */

import { desplazarAArgentina } from '../../domain/zona-horaria-argentina';

/**
 * Marca de orden de bytes de UTF-8, obligatoria al principio del archivo.
 *
 * Sin ella Excel no detecta UTF-8 y asume la codificación del sistema
 * (Windows-1252 en Windows en español): "Reparación" se lee "ReparaciÃ³n" y
 * el archivo parece corrupto. No es opcional ni cosmético.
 */
export const BOM_UTF8 = '﻿';

/**
 * Separador de campos: punto y coma, no coma.
 *
 * Excel usa como separador de lista el de la configuración regional, y en
 * español es `;`. Un CSV separado por comas abierto de doble clic en Excel
 * en español mete la fila entera en la primera columna. Elegir `;` además
 * libera a la coma para ser el separador DECIMAL (ver `montoCsv`), que es lo
 * que el mismo Excel espera de un número.
 */
export const SEPARADOR_CSV = ';';

/** Fin de línea de RFC 4180. Excel lo respeta; `\n` solo también, pero el estándar pide CRLF. */
const FIN_DE_LINEA = '\r\n';

/**
 * Caracteres que convierten una celda en fórmula al abrirla en una planilla.
 * Ver `neutralizarFormula`.
 */
const INICIOS_DE_FORMULA = ['=', '+', '-', '@'];

/** Valor admitido en una celda antes de ser formateado a texto. */
export type ValorCelda = string | number | boolean | null | undefined;

/**
 * Una columna del CSV: su encabezado y cómo extraerla de la fila.
 *
 * `valor` devuelve el dato crudo, no texto ya formateado: convertir fechas y
 * montos es responsabilidad de `fechaCsv`/`fechaHoraCsv`/`montoCsv`, que el
 * caller aplica dentro de esta función cuando corresponde. Así ninguna
 * columna inventa su propio formato de fecha.
 */
export interface ColumnaCsv<T> {
  /** Texto del encabezado, tal como lo lee el usuario. */
  encabezado: string;
  /** Extrae de la fila el valor de esta columna. */
  valor: (fila: T) => ValorCelda;
}

/**
 * Serializa filas a un CSV completo, listo para descargar.
 *
 * @param filas Filas a exportar, en el orden en que deben salir.
 * @param columnas Columnas del archivo, en el orden en que deben aparecer.
 * @returns El CSV con BOM, encabezado y una línea por fila.
 */
export function serializarCsv<T>(filas: readonly T[], columnas: readonly ColumnaCsv<T>[]): string {
  const encabezado = columnas.map((columna) => escaparCelda(columna.encabezado));
  const cuerpo = filas.map((fila) =>
    columnas.map((columna) => escaparCelda(aTexto(columna.valor(fila)))).join(SEPARADOR_CSV),
  );

  return BOM_UTF8 + [encabezado.join(SEPARADOR_CSV), ...cuerpo].join(FIN_DE_LINEA);
}

/**
 * Convierte un valor de celda a texto. `null`/`undefined` son celda VACÍA, no
 * el texto "null" — una celda vacía es lo que significa "este dato no
 * existe", y "null" en una planilla es ruido que el usuario tiene que borrar
 * a mano.
 */
function aTexto(valor: ValorCelda): string {
  if (valor === null || valor === undefined) {
    return '';
  }
  return String(valor);
}

/**
 * Aplica el escapado de RFC 4180 y, antes, la neutralización de fórmulas.
 *
 * El orden importa: primero se neutraliza (puede AGREGAR un apóstrofo) y
 * después se decide si hace falta entrecomillar, para que el resultado final
 * sea siempre una celda válida.
 */
function escaparCelda(texto: string): string {
  const seguro = neutralizarFormula(texto);

  const necesitaComillas =
    seguro.includes(SEPARADOR_CSV) ||
    seguro.includes('"') ||
    seguro.includes('\n') ||
    seguro.includes('\r');

  if (!necesitaComillas) {
    return seguro;
  }
  // RFC 4180: dentro de un campo entrecomillado, una comilla doble se
  // escribe duplicada.
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Antepone un apóstrofo al texto que una planilla interpretaría como
 * fórmula.
 *
 * Excel y Google Sheets evalúan como fórmula toda celda que empieza con `=`,
 * `+`, `-` o `@`. Los datos de este sistema los cargan usuarios: un `motivo`
 * de compra escrito como `=HYPERLINK("http://…","Ver")` se ejecutaría al
 * abrir el archivo exportado, en la máquina de quien lo abre. Es la
 * inyección CSV, y el apóstrofo la desarma porque fuerza a la planilla a
 * tratar la celda como texto.
 *
 * Un signo `-` legítimo (un monto negativo) también queda con apóstrofo. Es
 * el precio aceptado: los montos van por `montoCsv`, que no produce
 * negativos en los listados de hoy, y una celda de texto de más es
 * preferible a una fórmula ejecutándose sola.
 */
function neutralizarFormula(texto: string): string {
  if (texto.length > 0 && INICIOS_DE_FORMULA.includes(texto[0])) {
    return `'${texto}`;
  }
  return texto;
}

/**
 * Formatea una columna `@db.Date` como `dd/mm/aaaa`, SIN desplazar la zona
 * horaria.
 *
 * Prisma devuelve las columnas `@db.Date` como medianoche UTC del día
 * calendario que guardan: no son un instante, son una fecha. Aplicarles el
 * offset de Argentina las tiraría a las 21:00 del día ANTERIOR y el listado
 * exportado mostraría todo corrido un día. Para timestamps reales que además
 * necesitan la hora está `fechaHoraCsv`; para timestamps reales de los que
 * solo hace falta el día argentino está `diaArgentinoCsv`.
 *
 * @param fecha Columna `@db.Date` (o `null` si la columna es opcional).
 */
export function fechaCsv(fecha: Date | null | undefined): string {
  if (fecha === null || fecha === undefined) {
    return '';
  }
  return formatearDia(fecha);
}

/**
 * Formatea el DÍA ARGENTINO de un instante real como `dd/mm/aaaa`.
 *
 * A diferencia de `fechaCsv`, acá el desplazamiento SÍ corresponde: una
 * columna `timestamptz` guarda un instante, y truncar sus componentes UTC
 * sin desplazar antes adelanta un día todo lo que haya pasado después de las
 * 21:00 locales (sdd/corregir-fecha-cierre-tickets — el bug de la ventana
 * 21:00-23:59 ART). Para mostrar además la hora está `fechaHoraCsv`; para una
 * columna `@db.Date` (sin componente horario) está `fechaCsv`.
 *
 * @param instante Columna de timestamp (o `null`/`undefined` si es opcional).
 */
export function diaArgentinoCsv(instante: Date | null | undefined): string {
  if (instante === null || instante === undefined) {
    return '';
  }
  return formatearDia(desplazarAArgentina(instante));
}

/**
 * Formatea un timestamp real como `dd/mm/aaaa hh:mm` en hora de Argentina.
 *
 * A diferencia de `fechaCsv`, acá el desplazamiento SÍ corresponde: una
 * columna `timestamptz` guarda un instante, y mostrarlo en UTC adelanta tres
 * horas todo lo que haya pasado después de las 21:00 locales, cambiándole
 * incluso el día.
 *
 * @param instante Columna de timestamp (o `null` si es opcional).
 */
export function fechaHoraCsv(instante: Date | null | undefined): string {
  if (instante === null || instante === undefined) {
    return '';
  }
  const local = desplazarAArgentina(instante);
  const horas = dosDigitos(local.getUTCHours());
  const minutos = dosDigitos(local.getUTCMinutes());

  return `${formatearDia(local)} ${horas}:${minutos}`;
}

/** Arma `dd/mm/aaaa` leyendo los componentes UTC del `Date` recibido. */
function formatearDia(fecha: Date): string {
  const dia = dosDigitos(fecha.getUTCDate());
  const mes = dosDigitos(fecha.getUTCMonth() + 1);

  return `${dia}/${mes}/${fecha.getUTCFullYear()}`;
}

/** Rellena a dos dígitos con cero a la izquierda. */
function dosDigitos(valor: number): string {
  return String(valor).padStart(2, '0');
}

/**
 * Formatea un monto con coma decimal y dos decimales, SIN separador de
 * miles.
 *
 * La coma decimal es lo que Excel en español espera de un número; con punto
 * lo lee como texto y no se puede sumar. El separador de miles se omite
 * a propósito: agrega un punto que sólo se interpreta bien si la
 * configuración regional de quien abre el archivo coincide con la nuestra, y
 * sin él el número se lee siempre.
 *
 * @param monto Importe en unidades normales (no en centésimas).
 */
export function montoCsv(monto: number): string {
  return monto.toFixed(2).replace('.', ',');
}
