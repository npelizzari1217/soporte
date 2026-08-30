import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import { KB_TITULO_MAX_LENGTH } from "./limites";

/**
 * Validación cliente-side del form de artículos KB (react-hook-form + zod),
 * T3.1/T3.4. Espejo mínimo de `CreateKbArticuloDto`/`EditKbArticuloDto`; el
 * backend sigue siendo la fuente de verdad real (422 en titulo/contenido
 * vacíos vía `TituloVacioError`/`ContenidoVacioError`).
 */
export const kbArticuloSchema = z.object({
  // El piso se mide sobre el título TRIMEADO, igual que el backend: allá
  // `assertTituloValido` rechaza cuando `trim()` queda vacío, así que "   " es
  // título vacío. Con `.min(1)` sobre el crudo el front lo daba por válido y el
  // usuario se comía un 422 por un campo que en pantalla se veía lleno. Va con
  // `refine` y no con `.trim().min(1)` porque el backend NO guarda trimeado:
  // valida el trim y persiste lo tipeado, y el front tiene que espejar eso.
  // El `.max()` va ANTES del `.refine()`: refine devuelve un ZodEffects, que ya
  // no expone `.max()`.
  titulo: z
    .string()
    .max(KB_TITULO_MAX_LENGTH, mensajeDemasiadoLargo("El título", KB_TITULO_MAX_LENGTH))
    .refine((valor) => valor.trim().length >= 1, "El título es requerido"),
  contenido: z.string().min(1, "El contenido es requerido"),
});
export type KbArticuloFormValues = z.infer<typeof kbArticuloSchema>;
