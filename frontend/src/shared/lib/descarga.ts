/**
 * Descarga de archivos generados por el backend (CSV de compras y lo que venga
 * después). Vive en `shared/` y no en la feature porque nada de acá sabe de
 * compras: es el puente genérico entre un `Blob` ya obtenido con el fetch
 * autenticado (`shared/api/client.ts`) y el navegador.
 */

/** `filename="algo.csv"` o `filename=algo.csv`, sin importar el orden de los parámetros del header. */
const FORMATO_FILENAME = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i;

/**
 * Extrae el nombre de archivo de un header `Content-Disposition`.
 *
 * Devuelve `null` en vez de un nombre inventado para que la decisión del
 * fallback quede en el caller, que es el único que sabe qué archivo pidió.
 *
 * Se queda con el último segmento de la ruta a propósito: un `filename` con
 * `../` o `/` es basura (o un intento de escribir fuera de la carpeta de
 * descargas) y el header lo controla el servidor, no este código.
 *
 * @param header Valor crudo del header, o `null` si no vino.
 * @returns El nombre del archivo, o `null` si el header falta o no trae `filename`.
 */
export function nombreDesdeContentDisposition(header: string | null): string | null {
  if (!header) return null;

  const match = FORMATO_FILENAME.exec(header);
  const crudo = (match?.[1] ?? match?.[2] ?? "").trim();
  if (crudo === "") return null;

  const soloArchivo = crudo.split(/[/\\]/).pop()?.trim() ?? "";
  return soloArchivo === "" ? null : soloArchivo;
}

/**
 * Dispara la descarga de un `Blob` en el navegador vía anchor sintético.
 *
 * Es el único camino disponible: la ruta pide JWT, así que el archivo ya se
 * bajó por `fetch` y lo que queda es entregárselo al usuario. El
 * `revokeObjectURL` no es opcional — sin él, cada exportación deja el archivo
 * entero retenido en memoria hasta que se recargue la página.
 *
 * @param blob Contenido ya descargado.
 * @param nombreArchivo Nombre con el que el navegador lo guarda.
 */
export function dispararDescarga(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = nombreArchivo;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
