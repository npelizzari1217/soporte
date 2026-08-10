import { z } from "zod";

/** Validación cliente-side del alta (PR5). Espejo de `CrearTipoComponenteDto` (backend). */
export const crearTipoComponenteSchema = z.object({
  codigo: z.string().min(1, "El código es requerido"),
  nombre: z.string().min(1, "El nombre es requerido"),
});
export type CrearTipoComponenteFormValues = z.infer<typeof crearTipoComponenteSchema>;

/**
 * Validación cliente-side del renombrado (PR5). Espejo de
 * `RenombrarTipoComponenteDto` (backend) — `codigo` es inmutable, no forma
 * parte de este schema.
 */
export const renombrarTipoComponenteSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
});
export type RenombrarTipoComponenteFormValues = z.infer<typeof renombrarTipoComponenteSchema>;
