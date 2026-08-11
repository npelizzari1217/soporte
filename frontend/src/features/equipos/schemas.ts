import { z } from "zod";

/** Validación cliente-side de los forms de Equipos (RHF + zod), espejo de `equipos.dto.ts`. */
export const crearEquipoSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido"),
  numeroSerie: z.string().optional(),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  /** `<input type="date">` → "YYYY-MM-DD" (o "" sin fecha). El backend valida @IsDateString. */
  fechaAdquisicion: z.string().optional().or(z.literal("")),
  /** Texto libre; el backend la normaliza a mayúscula. */
  ubicacion: z.string().optional(),
  /** Importe/valor (string del input; se convierte a number al enviar). */
  importe: z.string().optional(),
  fechaValoracion: z.string().optional().or(z.literal("")),
  observaciones: z.string().optional(),
  valorResidual: z.string().optional(),
  fechaValorResidual: z.string().optional().or(z.literal("")),
  /**
   * UI-only: % de depreciación (hasta 3 enteros + 2 decimales). NO se persiste
   * ni se envía al backend — solo deriva `valorResidual` = importe × (1 − %/100).
   */
  porcentajeDepreciacion: z
    .string()
    .regex(/^\d{0,3}([.,]\d{1,2})?$/, "Hasta 3 cifras enteras y 2 decimales")
    .optional()
    .or(z.literal("")),
});
export type CrearEquipoFormValues = z.infer<typeof crearEquipoSchema>;

export const componenteSchema = z.object({
  tipoComponenteCodigo: z.string().min(1, "Elegí un tipo de componente"),
  descripcion: z.string().optional(),
  numeroSerie: z.string().optional(),
  capacidad: z.string().optional(),
});
export type ComponenteFormValues = z.infer<typeof componenteSchema>;

/** `equipoId` OPCIONAL (vínculo ticket↔equipo, espejo de `@IsOptional() @IsUUID() equipoId` backend). */
export const crearTicketSoporteSchema = z.object({
  titulo: z.string().min(1, "El título es requerido"),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
  equipoId: z.string().uuid().optional().or(z.literal("")),
  descripcionProblema: z.string().optional(),
});
export type CrearTicketSoporteFormValues = z.infer<typeof crearTicketSoporteSchema>;
