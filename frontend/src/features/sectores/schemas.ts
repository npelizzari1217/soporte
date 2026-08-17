import { z } from "zod";

/**
 * Validación cliente-side del form de sectores (WU-31). Espejo mínimo de
 * `CreateSectorDto`/`EditSectorDto` — el backend sigue siendo la fuente de
 * verdad real (422 en código duplicado, `SectorCodigoDuplicadoError`).
 */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;

export const sectorSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es requerido")
    .regex(CODIGO_PATTERN, "Mayúsculas/números/guion bajo, sin espacios"),
  nombre: z.string().min(1, "El nombre es requerido"),
});
export type SectorFormValues = z.infer<typeof sectorSchema>;
