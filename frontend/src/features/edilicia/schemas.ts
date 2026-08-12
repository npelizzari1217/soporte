import { z } from "zod";

/** Validación cliente-side de los forms de Edilicia (RHF + zod), espejo de `reparaciones.dto.ts`. */
export const crearReparacionSchema = z.object({
  titulo: z.string().min(1, "El título es requerido"),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
  ubicacion: z.string().optional(),
});
export type CrearReparacionFormValues = z.infer<typeof crearReparacionSchema>;

export const crearSubtareaSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
});
export type CrearSubtareaFormValues = z.infer<typeof crearSubtareaSchema>;
