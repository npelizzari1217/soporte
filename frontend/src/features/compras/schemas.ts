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

/**
 * Espejo de `@IsNumber({ maxDecimalPlaces: 2 })`. Sin esto el backend responde
 * 400 y el usuario se entera del problema recién al enviar.
 *
 * Cuenta decimales sobre la representación en texto y NO con aritmética
 * (`n * 100`): este módulo ya se tropezó una vez con el sesgo del punto
 * flotante, y `0.1 * 100` no da exactamente 10. La notación exponencial se
 * rechaza porque ningún monto ni cantidad real la usa.
 */
function conDosDecimales(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  const texto = String(n);
  if (texto.includes("e") || texto.includes("E")) return false;
  const punto = texto.indexOf(".");
  return punto === -1 || texto.length - punto - 1 <= 2;
}

const MENSAJE_DECIMALES = "Máximo 2 decimales";

/**
 * Espejo de `@IsDateString()`. Antes alcanzaba con que la cadena no fuera
 * vacía, así que cualquier texto pasaba el form y moría en el backend con 400.
 * Se valida que sea una fecha parseable y no un formato puntual, para no quedar
 * MÁS estricto que el backend (que acepta ISO 8601 completo, no solo
 * `YYYY-MM-DD`).
 */
const fecha = (mensajeVacio: string) =>
  z
    .string()
    .min(1, mensajeVacio)
    .refine((valor) => !Number.isNaN(Date.parse(valor)), "Fecha inválida");

/**
 * Los tres motivos del módulo los valida el DOMINIO con `trim()`
 * (`compra.entity.ts:149` y `:383`, `item-compra.entity.ts:485`), no el DTO.
 * Sin `.trim()` acá, un motivo de solo espacios pasa el form y las validaciones
 * de borde, y vuelve como 422 desde la regla de negocio.
 */
const motivo = (mensaje: string) => z.string().trim().min(1, mensaje);

/** Espejo de `CrearCompraHttpDto` (§4.1, S1). `sectorId` opcional (R11, S66). */
export const crearCompraSchema = z.object({
  motivo: motivo("El motivo es requerido"),
  descripcion: z.string().optional(),
  /** `<input type="date">` → "YYYY-MM-DD". El backend valida `@IsDateString`. */
  fechaSolicitud: fecha("La fecha de solicitud es requerida"),
  sectorId: z.string().optional(),
});
export type CrearCompraFormValues = z.infer<typeof crearCompraSchema>;

/** Espejo de `AgregarItemCompraHttpDto` (§4.2, S4). */
export const agregarItemCompraSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
  /** Espejo de `@IsNumber({maxDecimalPlaces:2}) @Min(0.01)` — equivalente a "cantidad > 0". */
  cantidad: z.coerce
    .number()
    .min(0.01, "La cantidad debe ser mayor a 0")
    .refine(conDosDecimales, MENSAJE_DECIMALES),
  proveedor: z.string().min(1, "El proveedor es requerido"),
  /** Espejo de `@IsNumber({maxDecimalPlaces:2}) @Min(0)` — el monto no puede ser negativo. */
  monto: z.coerce.number().min(0, "El monto no puede ser negativo").refine(conDosDecimales, MENSAJE_DECIMALES),
  moneda: z.enum(MONEDAS_ADMITIDAS, { errorMap: () => ({ message: "Elegí una moneda" }) }),
  fechaCotizacion: fecha("La fecha de cotización es requerida"),
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
  cantidad: z.coerce
    .number()
    .min(0.01, "La cantidad debe ser mayor a 0")
    .refine(conDosDecimales, MENSAJE_DECIMALES)
    .optional(),
  proveedor: z.string().min(1, "El proveedor es requerido").optional(),
  monto: z.coerce
    .number()
    .min(0, "El monto no puede ser negativo")
    .refine(conDosDecimales, MENSAJE_DECIMALES)
    .optional(),
  moneda: z.enum(MONEDAS_ADMITIDAS, { errorMap: () => ({ message: "Elegí una moneda" }) }).optional(),
  fechaCotizacion: fecha("La fecha de cotización es requerida").optional(),
  observaciones: z.string().optional(),
});
export type EditarItemCompraFormValues = z.infer<typeof editarItemCompraSchema>;

/** Espejo de `RegistrarOrdenDeItemHttpDto` (R1) — acumulado, no delta. `fecha` opcional. */
export const registrarOrdenDeItemSchema = z.object({
  cantidadOrdenada: z.coerce
    .number()
    .min(0, "La cantidad ordenada no puede ser negativa")
    .refine(conDosDecimales, MENSAJE_DECIMALES),
  fecha: z.string().optional(),
});
export type RegistrarOrdenDeItemFormValues = z.infer<typeof registrarOrdenDeItemSchema>;

/**
 * Espejo de `RegistrarRecepcionDeItemHttpDto` (R1) — acumulado, no delta.
 * Reemplaza a `registrarCompraDeItemSchema` (WU-26).
 */
export const registrarRecepcionDeItemSchema = z.object({
  cantidadRecibida: z.coerce
    .number()
    .min(0, "La cantidad recibida no puede ser negativa")
    .refine(conDosDecimales, MENSAJE_DECIMALES),
  fecha: z.string().optional(),
});
export type RegistrarRecepcionDeItemFormValues = z.infer<typeof registrarRecepcionDeItemSchema>;

/** Espejo de `RegistrarEntregaDeItemHttpDto` (§4.6) — acumulado, no delta. */
export const registrarEntregaDeItemSchema = z.object({
  cantidadEntregada: z.coerce
    .number()
    .min(0, "La cantidad entregada no puede ser negativa")
    .refine(conDosDecimales, MENSAJE_DECIMALES),
  fecha: z.string().optional(),
});
export type RegistrarEntregaDeItemFormValues = z.infer<typeof registrarEntregaDeItemSchema>;

/** Espejo de `EditarFechaEtapaHttpDto` (R4/S55). */
export const editarFechaEtapaSchema = z.object({
  etapa: z.enum(["ORDEN", "RECEPCION", "ENTREGA"]),
  fecha: fecha("La fecha es requerida"),
});
export type EditarFechaEtapaFormValues = z.infer<typeof editarFechaEtapaSchema>;

/** Espejo de `CerrarItemConFaltanteHttpDto` (§4.7, S24). */
export const cerrarItemConFaltanteSchema = z.object({
  motivo: motivo("El motivo es requerido"),
});
export type CerrarItemConFaltanteFormValues = z.infer<typeof cerrarItemConFaltanteSchema>;

/** Espejo de `CancelarCompraHttpDto` (§4.8) — cubre el 10º throw plano del backend (motivo obligatorio). */
export const cancelarCompraSchema = z.object({
  motivo: motivo("El motivo de cancelación es requerido"),
});
export type CancelarCompraFormValues = z.infer<typeof cancelarCompraSchema>;
