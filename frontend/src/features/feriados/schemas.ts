import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import { FECHA_CALENDARIO_REGEX, FERIADO_DESCRIPCION_MAX_LENGTH } from "./limites";

/**
 * Validación cliente-side del form de feriado (RHF + zod), espejo de
 * `CreateFeriadoDto`/`UpdateFeriadoDto` (y sus pares `...Cliente`) —
 * feedback inmediato antes de pegarle a la API. Un único schema para los
 * cuatro DTOs del backend: los cuatro comparten el mismo shape
 * (`fecha`/`descripcion`), solo cambia el endpoint de destino (WU7/WU8).
 *
 * `fecha` valida el formato `'YYYY-MM-DD'` con el MISMO regex que el DTO
 * (`@Matches(FECHA_CALENDARIO_REGEX)`, D2 design.md — nunca `@IsDateString`,
 * que acepta un datetime con offset). El regex es NECESARIO pero no
 * SUFICIENTE — `2026-02-30` lo pasa igual; esa validación de fecha REAL
 * corre solo en el backend (`FechaCalendario.crear()`, dominio), mapeada a
 * 422. Replicarla acá agregaría una segunda fuente de verdad para el
 * calendario sin backstop de tipos (mismo criterio de simpleza que
 * `ciclos-master/schemas.ts`, que tampoco valida fechas reales — solo
 * compara los strings).
 */
export const feriadoSchema = z.object({
  fecha: z
    .string()
    .min(1, "La fecha es requerida")
    .regex(FECHA_CALENDARIO_REGEX, "La fecha debe tener el formato 'AAAA-MM-DD'"),
  descripcion: z
    .string()
    .min(1, "La descripción es requerida")
    .max(
      FERIADO_DESCRIPCION_MAX_LENGTH,
      mensajeDemasiadoLargo("La descripción", FERIADO_DESCRIPCION_MAX_LENGTH),
    ),
});
export type FeriadoFormValues = z.infer<typeof feriadoSchema>;
