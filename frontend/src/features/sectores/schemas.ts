import { z } from "zod";

/**
 * Validación cliente-side del form de sectores (WU-31). Espejo mínimo de
 * `CreateSectorDto`/`EditSectorDto` — el backend sigue siendo la fuente de
 * verdad real (422 en código duplicado, `SectorCodigoDuplicadoError`).
 *
 * `.max(...)` espeja el `@MaxLength` del DTO (sdd/filtro-prisma H5), que a su
 * vez espeja `Sector.codigo VarChar(50)` / `Sector.nombre VarChar(100)`.
 */
const CODIGO_PATTERN = /^[A-Z0-9_]+$/;
const SECTOR_CODIGO_MAX_LENGTH = 50;
const SECTOR_NOMBRE_MAX_LENGTH = 100;

export const sectorSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es requerido")
    .max(SECTOR_CODIGO_MAX_LENGTH, `El código no puede superar los ${SECTOR_CODIGO_MAX_LENGTH} caracteres`)
    .regex(CODIGO_PATTERN, "Mayúsculas/números/guion bajo, sin espacios"),
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(SECTOR_NOMBRE_MAX_LENGTH, `El nombre no puede superar los ${SECTOR_NOMBRE_MAX_LENGTH} caracteres`),
});
export type SectorFormValues = z.infer<typeof sectorSchema>;
