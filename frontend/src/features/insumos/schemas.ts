/**
 * Validación cliente-side de los forms de movimientos de Insumos (RHF + zod),
 * espejo de `RegistrarMovimientoInsumoHttpDto`
 * (`backend/src/insumos/interface/dtos/movimientos-insumo.dto.ts`). El
 * backend sigue siendo la fuente de verdad real — esto es feedback inmediato
 * antes de pegarle a la API, no la barrera.
 */
import { z } from "zod";
import { conDosDecimales, formatearNumeroEsAr, parsearNumeroEsAr } from "@/shared/lib/formato-numero";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";

/**
 * Topes de `movimientos_insumo`, espejo de las constantes de
 * `MovimientoInsumoEntity` (backend, `movimiento-insumo.entity.ts`). Locales a
 * esta feature: el front no importa del backend (paquetes separados del
 * monorepo, sin build compartido entre Nest y Next), así que se duplican
 * acá — la autoridad real sigue siendo la entidad de dominio.
 */
const MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES = 2;
const MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA = 1_000_000;
const MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH = 500;

const MENSAJE_DECIMALES = `Máximo ${MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES} decimales`;

/**
 * Coerciona el input de cantidad tratando vacío/espacios como AUSENTE, nunca
 * como `0` (AGENTS.md, clase "vacío que se vuelve valor" — mismo criterio que
 * `numeroRequerido` en `features/compras/schemas.ts`). Parsea con
 * `parsearNumeroEsAr`, no `Number()` pelado: soporta el formato es-AR
 * (`"1.234,56"` → `1234.56`, donde `Number()` pelado daría `NaN`) para
 * cualquier valor que llegue como texto. En el diálogo de entrada
 * (`movimiento-entrada-dialog.tsx`) el campo es `<input type="number">`, y el
 * browser sanitiza un pegado inválido a cadena vacía antes de que este schema
 * lo vea — ese camino de parseo no se ejerce desde ahí hoy. El punto solo se
 * lee como separador de miles cuando además hay una coma decimal, así que el
 * crudo de un `<input type="number">` (`"1000.5"`) se interpreta igual que
 * hoy.
 *
 * `.positive()` y NO `.min(0)`: el backend exige `@IsPositive()` — el cero NO
 * es un movimiento, el piso es exclusivo. Es la diferencia de fondo con
 * `numeroRequerido` de compras (que sí acepta cero para cantidades
 * acumuladas). El `@Max` de acá espeja `MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA`,
 * el techo de NEGOCIO que declara el DTO del backend, no un límite físico de
 * columna.
 *
 * El `z.number()` interno va PELADO — nunca `z.coerce.number()` —, por el
 * mismo motivo documentado en `numeroRequerido` de compras: con `coerce`,
 * `Number(undefined)` es `NaN` y el mensaje de requerido nunca se dispara.
 */
const cantidadMovimientoSchema = z.preprocess(
  (valor) => {
    if (valor === null) return undefined;
    if (typeof valor !== "string") return valor;
    return valor.trim() === "" ? undefined : (parsearNumeroEsAr(valor) ?? Number.NaN);
  },
  z
    .number({
      required_error: "La cantidad es requerida",
      invalid_type_error: "Ingresá una cantidad válida",
    })
    .positive("La cantidad debe ser mayor a 0")
    .max(
      MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
      `La cantidad no puede superar ${MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA}`,
    )
    .refine(conDosDecimales, MENSAJE_DECIMALES),
);

/**
 * Espejo de `RegistrarMovimientoInsumoHttpDto` — sirve tanto para la ENTRADA
 * como para la SALIDA: el backend recibe el mismo body en las dos rutas y el
 * tipo del asiento lo fija la ruta, no el cuerpo.
 *
 * `motivo` es OPCIONAL A PROPÓSITO, incluso acá: que el ajuste lo exija es una
 * regla de NEGOCIO que vive en `MovimientoInsumoEntity.create()` (422,
 * `MotivoAjusteRequeridoError`), no de forma — duplicarla en este schema le
 * daría dos dueños a la misma regla. Se mide TRIMEADO, igual que el backend
 * (`@Transform` corre antes que `@MaxLength`): sin el `.trim()`, un motivo que
 * solo pasa el tope por sus espacios de borde se rechazaría acá y se
 * aceptaría en el servidor — el front quedaría MÁS estricto que el backend.
 *
 * `equipoId`/`sectorId` necesitan `.or(z.literal(""))`: son UUID opcionales
 * que salen de un `<select>` con "Sin equipo"/"Sin sector" como opción por
 * defecto, y `.uuid()` por sí solo rechaza la cadena vacía.
 */
export const registrarMovimientoInsumoSchema = z.object({
  cantidad: cantidadMovimientoSchema,
  motivo: z
    .string()
    .optional()
    .refine(
      (valor) => valor === undefined || valor.trim().length <= MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
      mensajeDemasiadoLargo("El motivo", MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH),
    ),
  equipoId: z.string().uuid().optional().or(z.literal("")),
  sectorId: z.string().uuid().optional().or(z.literal("")),
});
export type RegistrarMovimientoInsumoFormValues = z.infer<typeof registrarMovimientoInsumoSchema>;

/**
 * Variante de `registrarMovimientoInsumoSchema` exclusiva de la SALIDA:
 * agrega el tope de que `cantidad` no supere `stockDisponible`. NO es una
 * regla de negocio duplicada — el backend valida el stock bajo un advisory
 * lock en el momento del POST (`StockInsuficienteError`, 422,
 * `MovimientosInsumoController.registrarSalida`) y ESE 422 sigue siendo la
 * autoridad real: otro usuario puede sacar existencia mientras este
 * formulario sigue abierto, y ahí el tope de acá ya no alcanza. Esto es solo
 * el atajo de UX documentado en `AGENTS.md` (clase "topes sin espejar"):
 * evitar el viaje al servidor cuando ya se sabe, al tipear, que la cantidad
 * no entra.
 *
 * `stockDisponible` en `undefined` DESACTIVA el tope — nunca lo trata como
 * `0`. Es el mismo criterio de "no asumir" que aplica al trigger del diálogo
 * (`MovimientoSalidaDialog`): mientras `useStockInsumo` está en vuelo o
 * falló, no hay con qué comparar, y bloquear con un tope inventado sería peor
 * que dejar pasar y confiar en el 422 del backend como backstop.
 */
export function registrarSalidaInsumoSchema(stockDisponible: number | undefined) {
  return registrarMovimientoInsumoSchema.refine(
    (valores) => stockDisponible === undefined || valores.cantidad <= stockDisponible,
    {
      message: `No hay existencia suficiente: disponible ${formatearNumeroEsAr(stockDisponible ?? 0)}`,
      path: ["cantidad"],
    },
  );
}
