import { z } from "zod";

/**
 * Validación cliente-side del form de artículos KB (react-hook-form + zod),
 * T3.1/T3.4. Espejo mínimo de `CreateKbArticuloDto`/`EditKbArticuloDto`; el
 * backend sigue siendo la fuente de verdad real (422 en titulo/contenido
 * vacíos vía `TituloVacioError`/`ContenidoVacioError`).
 */
export const kbArticuloSchema = z.object({
  titulo: z.string().min(1, "El título es requerido"),
  contenido: z.string().min(1, "El contenido es requerido"),
});
export type KbArticuloFormValues = z.infer<typeof kbArticuloSchema>;
