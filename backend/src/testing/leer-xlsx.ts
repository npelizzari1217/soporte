import ExcelJS from 'exceljs';

/**
 * Lee un .xlsx generado por el sistema de vuelta a un `Workbook`, para que
 * los specs afirmen sobre las celdas reales.
 *
 * Existe porque `exceljs` tipa su propio `Buffer` (una interfaz que extiende
 * `ArrayBuffer`) y no acepta el `Buffer` de Node: el puente se hace una vez
 * acá y los specs no necesitan castear.
 */
export async function leerXlsx(buffer: Uint8Array): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return libro;
}
