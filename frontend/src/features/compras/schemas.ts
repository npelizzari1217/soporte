import { z } from "zod";
import { MONEDAS } from "./types";

/** Validación cliente-side de los forms de Compras (RHF + zod), espejo de `compras.dto.ts`. */
export const crearCompraSchema = z.object({
  titulo: z.string().min(1, "El título es requerido"),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
});
export type CrearCompraFormValues = z.infer<typeof crearCompraSchema>;

export const itemCompraSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor a 0"),
  unidad: z.string().optional(),
  precioUnitarioRef: z.coerce.number().min(0).optional().or(z.literal(undefined)),
  observaciones: z.string().optional(),
});
export type ItemCompraFormValues = z.infer<typeof itemCompraSchema>;

export const presupuestoSchema = z.object({
  proveedor: z.string().min(1, "El proveedor es requerido"),
  montoTotal: z.coerce.number().min(0, "El monto debe ser mayor o igual a 0"),
  moneda: z.enum(MONEDAS, { message: "Elegí una moneda" }),
  fechaCotizacion: z.string().min(1, "La fecha es requerida"),
  observaciones: z.string().optional(),
});
export type PresupuestoFormValues = z.infer<typeof presupuestoSchema>;

export const rechazarCompraSchema = z.object({
  motivoRechazo: z.string().min(1, "El motivo de rechazo es requerido"),
});
export type RechazarCompraFormValues = z.infer<typeof rechazarCompraSchema>;
