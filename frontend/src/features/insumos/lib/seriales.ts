import { SERIALES_MAX, normalizarSerial, numeroSerieSchema } from "../schemas";

export interface EvaluacionSeriales {
  /** La cantidad sirve para una entrada con seriales: entera, de 1 a `SERIALES_MAX`. */
  cantidadValida: boolean;
  /** Un mensaje (o `undefined`) por cada casilla, en orden. */
  errores: (string | undefined)[];
  /** Los seriales recortados, listos para enviar; `null` si algo no es válido. */
  seriales: string[] | null;
}

/**
 * Revisa los seriales tipeados contra la cantidad de una entrada o un ajuste
 * positivo de un insumo `SERIE`. Espejo de lo que el backend valida: uno por pieza,
 * sin blancos, con el largo permitido y sin repetidos entre sí comparando la
 * forma normalizada (sin espacios y en mayúsculas), igual que la unicidad del servidor.
 *
 * @param cantidad Cantidad tipeada (puede no ser un número válido).
 * @param valores Lo escrito en cada casilla.
 * @param marcarVacios `true` marca las casillas en blanco (tras intentar enviar); `false` las deja sin marcar mientras se tipea.
 */
export function evaluarSeriales(
  cantidad: number,
  valores: readonly string[],
  marcarVacios: boolean,
): EvaluacionSeriales {
  const cantidadValida = Number.isInteger(cantidad) && cantidad >= 1 && cantidad <= SERIALES_MAX;
  if (!cantidadValida) return { cantidadValida, errores: [], seriales: null };

  const vistos = new Map<string, number>();
  const errores: (string | undefined)[] = [];
  const seriales: string[] = [];
  let hayError = false;

  for (let i = 0; i < cantidad; i += 1) {
    const recortado = (valores[i] ?? "").trim();
    seriales.push(recortado);
    let error: string | undefined;
    if (recortado === "") {
      if (marcarVacios) error = "El número de serie es requerido";
      hayError = true;
    } else {
      const resultado = numeroSerieSchema.safeParse(recortado);
      if (!resultado.success) {
        error = resultado.error.issues[0]?.message;
      } else {
        const clave = normalizarSerial(recortado);
        const previo = vistos.get(clave);
        if (previo !== undefined) error = `Repetido: ya lo cargaste en la pieza ${previo + 1}`;
        else vistos.set(clave, i);
      }
      if (error) hayError = true;
    }
    errores.push(error);
  }

  return { cantidadValida, errores, seriales: hayError ? null : seriales };
}
