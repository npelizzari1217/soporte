import { SERIALES_MAX, normalizarSerial, numeroSerieSchema } from "@/features/insumos/schemas";

export interface EvaluacionSerialesRecepcion {
  /** Casillas a mostrar: 0 si no hay piezas nuevas; `null` si el delta no es entero de 1 a `SERIALES_MAX`. */
  cantidad: number | null;
  /** Un mensaje (o `undefined`) por casilla, en orden. */
  errores: (string | undefined)[];
  /** Los seriales cargados (recortados, sin blancos), o `null` si algo hay que corregir. */
  seriales: string[] | null;
  /** Piezas del delta que quedan sin serial (pendientes). */
  pendientes: number;
}

/**
 * Revisa los seriales de las piezas NUEVAS de una recepción de un insumo `SERIE`.
 * A diferencia de una entrada, los blancos son válidos: esa pieza queda pendiente
 * de serial. Los cargados se validan en largo y contra repetidos entre sí (forma normalizada).
 *
 * @param delta Cantidad recibida tipeada menos la ya recibida.
 * @param valores Lo escrito en cada casilla.
 */
export function evaluarSerialesRecepcion(delta: number, valores: readonly string[]): EvaluacionSerialesRecepcion {
  if (!Number.isFinite(delta) || delta <= 0) return { cantidad: 0, errores: [], seriales: [], pendientes: 0 };
  if (!Number.isInteger(delta) || delta > SERIALES_MAX) {
    return { cantidad: null, errores: [], seriales: null, pendientes: 0 };
  }
  const vistos = new Map<string, number>();
  const errores: (string | undefined)[] = [];
  const seriales: string[] = [];
  let hayError = false;
  for (let i = 0; i < delta; i += 1) {
    const recortado = (valores[i] ?? "").trim();
    let error: string | undefined;
    if (recortado !== "") {
      const resultado = numeroSerieSchema.safeParse(recortado);
      if (!resultado.success) {
        error = resultado.error.issues[0]?.message;
      } else {
        const clave = normalizarSerial(recortado);
        const previo = vistos.get(clave);
        if (previo !== undefined) error = `Repetido: ya lo cargaste en la pieza ${previo + 1}`;
        else vistos.set(clave, i);
        seriales.push(recortado);
      }
    }
    if (error) hayError = true;
    errores.push(error);
  }
  return { cantidad: delta, errores, seriales: hayError ? null : seriales, pendientes: delta - seriales.length };
}
