import { z } from "zod";

/** Validación cliente-side de los forms de Edilicia (RHF + zod), espejo de `reparaciones.dto.ts`. */
export const crearUbicacionSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  descripcion: z.string().optional(),
  padreId: z.string().uuid().optional().or(z.literal("")),
});
export type CrearUbicacionFormValues = z.infer<typeof crearUbicacionSchema>;

export const crearReparacionSchema = z.object({
  titulo: z.string().min(1, "El título es requerido"),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
  ubicacionId: z.string().uuid("Elegí una ubicación"),
});
export type CrearReparacionFormValues = z.infer<typeof crearReparacionSchema>;

export const crearSubtareaSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
});
export type CrearSubtareaFormValues = z.infer<typeof crearSubtareaSchema>;
