import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import {
  TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
  TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
  normalizarCodigo,
} from "./limites";

/** Validación cliente-side del alta (PR5). Espejo de `CrearTipoComponenteDto` (backend). */
export const crearTipoComponenteSchema = z.object({
  // Los DOS límites se miden sobre el valor NORMALIZADO, no sobre lo tipeado.
  // El backend guarda `trim().toUpperCase()` y su `@Transform` corre ANTES que
  // `@IsNotEmpty`/`@MinLength`, así que allá "   " es código vacío. Medir el
  // piso sobre el crudo dejaba pasar acá algo que el servidor rechazaba con un
  // 400 — y el techo sobre el crudo dejaba pasar lo que se expande al
  // normalizar ('ß' → 'SS'). Van con `refine` y no con `.min()`/`.max()`
  // porque esos miden el string crudo, y acá hay que medir el normalizado.
  codigo: z
    .string()
    .refine((valor) => normalizarCodigo(valor).length >= 1, "El código es requerido")
    .refine(
      (valor) => normalizarCodigo(valor).length <= TIPO_COMPONENTE_CODIGO_MAX_LENGTH,
      mensajeDemasiadoLargo("El código", TIPO_COMPONENTE_CODIGO_MAX_LENGTH),
    ),
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(
      TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
      mensajeDemasiadoLargo("El nombre", TIPO_COMPONENTE_NOMBRE_MAX_LENGTH),
    ),
});
export type CrearTipoComponenteFormValues = z.infer<typeof crearTipoComponenteSchema>;

/**
 * Validación cliente-side del renombrado (PR5). Espejo de
 * `RenombrarTipoComponenteDto` (backend) — `codigo` es inmutable, no forma
 * parte de este schema.
 */
export const renombrarTipoComponenteSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(
      TIPO_COMPONENTE_NOMBRE_MAX_LENGTH,
      mensajeDemasiadoLargo("El nombre", TIPO_COMPONENTE_NOMBRE_MAX_LENGTH),
    ),
});
export type RenombrarTipoComponenteFormValues = z.infer<typeof renombrarTipoComponenteSchema>;
