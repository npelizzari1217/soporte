import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";

/**
 * Validación cliente-side del form de respuestas predefinidas. Espejo de
 * `CreateRespuestaPredefinidaDto`; el backend sigue siendo la fuente de verdad (422 si el
 * título ya existe, sin distinguir mayúsculas). Los topes espejan `titulo VarChar(100)` y
 * `texto VarChar(4000)`.
 */
export const RESPUESTA_TITULO_MAX_LENGTH = 100;
export const RESPUESTA_TEXTO_MAX_LENGTH = 4000;

export const respuestaPredefinidaSchema = z.object({
  titulo: z
    .string()
    .trim()
    .min(1, "El título es requerido")
    .max(RESPUESTA_TITULO_MAX_LENGTH, mensajeDemasiadoLargo("El título", RESPUESTA_TITULO_MAX_LENGTH)),
  texto: z
    .string()
    .trim()
    .min(1, "El texto es requerido")
    .max(RESPUESTA_TEXTO_MAX_LENGTH, mensajeDemasiadoLargo("El texto", RESPUESTA_TEXTO_MAX_LENGTH)),
});
export type RespuestaPredefinidaFormValues = z.infer<typeof respuestaPredefinidaSchema>;
