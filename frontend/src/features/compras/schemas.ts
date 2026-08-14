import { z } from "zod";

/**
 * Validación cliente-side de los forms de Compras (RHF + zod), espejo
 * mínimo de las reglas `class-validator` de `compras.dto.ts` (PR-20). El
 * backend sigue siendo la fuente de verdad real — esto es feedback
 * inmediato antes de pegarle a la API, no la barrera.
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA aparecen acá (ver `types.ts`) —
 * los resuelve el servidor.
 */

/** ADR-C7: set CERRADO, espejo exacto de `MONEDAS_ADMITIDAS` del backend. */
const MONEDAS_ADMITIDAS = ["ARS", "USD", "EUR"] as const;

/** Espejo de `CrearCompraHttpDto` (§4.1, S1). */
export const crearCompraSchema = z.object({
  motivo: z.string().min(1, "El motivo es requerido"),
  descripcion: z.string().optional(),
  /** `<input type="date">` → "YYYY-MM-DD". El backend valida `@IsDateString`. */
  fechaSolicitud: z.string().min(1, "La fecha de solicitud es requerida"),
});
export type CrearCompraFormValues = z.infer<typeof crearCompraSchema>;

/** Espejo de `AgregarItemCompraHttpDto` (§4.2, S4). */
export const agregarItemCompraSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
  /** Espejo de `@IsNumber({maxDecimalPlaces:2}) @Min(0.01)` — equivalente a "cantidad > 0". */
  cantidad: z.coerce.number().min(0.01, "La cantidad debe ser mayor a 0"),
  proveedor: z.string().min(1, "El proveedor es requerido"),
  /** Espejo de `@Min(0)` — el monto no puede ser negativo. */
  monto: z.coerce.number().min(0, "El monto no puede ser negativo"),
  moneda: z.enum(MONEDAS_ADMITIDAS, { errorMap: () => ({ message: "Elegí una moneda" }) }),
  fechaCotizacion: z.string().min(1, "La fecha de cotización es requerida"),
  observaciones: z.string().optional(),
});
export type AgregarItemCompraFormValues = z.infer<typeof agregarItemCompraSchema>;

/**
 * Espejo de `EditarItemCompraHttpDto` (§4.2/§4.4) — PATCH semántico, todos
 * los campos opcionales; el congelamiento (S13) y los campos libres (S14)
 * los resuelve el backend, no este schema.
 */
export const editarItemCompraSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida").optional(),
  cantidad: z.coerce.number().min(0.01, "La cantidad debe ser mayor a 0").optional(),
  proveedor: z.string().min(1, "El proveedor es requerido").optional(),
  monto: z.coerce.number().min(0, "El monto no puede ser negativo").optional(),
  moneda: z.enum(MONEDAS_ADMITIDAS, { errorMap: () => ({ message: "Elegí una moneda" }) }).optional(),
  fechaCotizacion: z.string().min(1, "La fecha de cotización es requerida").optional(),
  observaciones: z.string().optional(),
});
export type EditarItemCompraFormValues = z.infer<typeof editarItemCompraSchema>;

/** Espejo de `RegistrarCompraDeItemHttpDto` (§4.5) — acumulado, no delta. */
export const registrarCompraDeItemSchema = z.object({
  cantidadComprada: z.coerce.number().min(0, "La cantidad comprada no puede ser negativa"),
});
export type RegistrarCompraDeItemFormValues = z.infer<typeof registrarCompraDeItemSchema>;

/** Espejo de `RegistrarEntregaDeItemHttpDto` (§4.6) — acumulado, no delta. */
export const registrarEntregaDeItemSchema = z.object({
  cantidadEntregada: z.coerce.number().min(0, "La cantidad entregada no puede ser negativa"),
});
export type RegistrarEntregaDeItemFormValues = z.infer<typeof registrarEntregaDeItemSchema>;

/** Espejo de `CerrarItemConFaltanteHttpDto` (§4.7, S24). */
export const cerrarItemConFaltanteSchema = z.object({
  motivo: z.string().min(1, "El motivo es requerido"),
});
export type CerrarItemConFaltanteFormValues = z.infer<typeof cerrarItemConFaltanteSchema>;

/** Espejo de `CancelarCompraHttpDto` (§4.8) — cubre el 10º throw plano del backend (motivo obligatorio). */
export const cancelarCompraSchema = z.object({
  motivo: z.string().min(1, "El motivo de cancelación es requerido"),
});
export type CancelarCompraFormValues = z.infer<typeof cancelarCompraSchema>;
