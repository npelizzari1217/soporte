import { z } from "zod";
import { conDosDecimales, parsearNumeroEsAr } from "@/shared/lib/formato-numero";

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

const MENSAJE_DECIMALES = "Máximo 2 decimales";

/**
 * Coerciona un input de formulario a número tratando la cadena vacía o
 * compuesta solo de espacios como AUSENTE (no como `0`) antes de coercionar.
 * Sin este preprocess, `Number("")` da `0` y un campo vaciado sobrescribe en
 * silencio el acumulado que tenía precargado (el "cero fantasma").
 *
 * Parsea con `parsearNumeroEsAr` (no `Number()` pelado) porque `MontoInput`
 * deja el texto CRUDO en el form hasta el blur, y enviar con Enter dentro de
 * un `<form>` dispara el submit sin pasar por ahí: un monto tipeado en
 * formato es-AR (`"1.000,50"`) llega tal cual al resolver. `Number("1.000,50")`
 * da `NaN` y rechaza un valor que la propia app acepta apenas el campo pierde
 * el foco — inconsistencia según qué tecla cierra el formulario.
 *
 * `?? Number.NaN` en vez de `?? undefined`: `parsearNumeroEsAr` devuelve
 * `null` para texto no numérico (`"abc"`), no para ausente — eso ya lo filtra
 * el `trim() === ""` de arriba. Mapear ese `null` a `undefined` reescribiría
 * "abc" como si el campo estuviera vacío y el usuario leería "es requerido"
 * donde corresponde "ingresá un monto válido". `NaN` preserva la rama
 * `invalid_type_error` del `z.number()` de abajo.
 *
 * El `z.number()` interno va PELADO — nunca `z.coerce.number()` —, porque
 * `ZodNumber._parse` coerciona ANTES de mirar el tipo (zod@3.25.76,
 * `v3/types.js:1071-1073`): con `coerce`, `Number(undefined)` es `NaN`, el
 * `parsedType` pasa a `"nan"` y sale `invalid_type_error`, nunca
 * `required_error`, sin importar que el preprocess ya haya devuelto
 * `undefined`. Con `z.number()` sin coerce, `undefined` llega intacto y el
 * mensaje de requerido sí se dispara.
 */
const numeroRequerido = (mensajes: { requerido: string; negativo: string; invalido: string }) =>
  z.preprocess(
    (valor) => {
      if (valor === null) return undefined;
      if (typeof valor !== "string") return valor;
      return valor.trim() === "" ? undefined : (parsearNumeroEsAr(valor) ?? Number.NaN);
    },
    z
      .number({ required_error: mensajes.requerido, invalid_type_error: mensajes.invalido })
      .min(0, mensajes.negativo)
      .refine(conDosDecimales, MENSAJE_DECIMALES),
  );

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

/**
 * Monto de un ítem: espejo de `@IsNumber({maxDecimalPlaces:2}) @Min(0)`.
 *
 * `invalido` NO es cosmético. El campo dejó de ser `<input type="number">`
 * (incompatible con mostrar `1.234.567,89` al salir del foco), así que ahora
 * puede llegar texto libre, y sin este mensaje zod devuelve su default en
 * inglés ("Expected number, received nan").
 *
 * Requerido (no `.optional()` a nivel schema): vaciar el campo ya no debe
 * coercionarse a `0` — ver `numeroRequerido`. La opcionalidad real del PATCH
 * de `editarItemCompraSchema` vive en `EditarItemCompraDto` (`types.ts`), no acá.
 */
const monto = () =>
  numeroRequerido({
    requerido: "El monto es requerido",
    negativo: "El monto no puede ser negativo",
    invalido: "Ingresá un monto válido",
  });

/** Espejo de `CrearCompraHttpDto` (§4.1, S1). `sectorId` opcional (R11, S66). */
export const crearCompraSchema = z.object({
  motivo: motivo("El motivo es requerido"),
  descripcion: z.string().optional(),
  /** `<input type="date">` → "YYYY-MM-DD". El backend valida `@IsDateString`. */
  fechaSolicitud: fecha("La fecha de solicitud es requerida"),
  sectorId: z.string().optional(),
});
export type CrearCompraFormValues = z.infer<typeof crearCompraSchema>;

/**
 * Espejo de `EditarCompraHttpDto` — edición de la CABECERA. El PATCH es
 * semántico del lado del backend, pero este schema NO deja todos los campos
 * opcionales: `motivo` y `fechaSolicitud` son requeridos, porque el diálogo
 * los precarga y editar la cabecera dejándolos vacíos no es una operación
 * válida.
 *
 * La ventana de edición (sólo mientras la compra deriva `PENDIENTE`) NO se
 * valida acá: es una regla de negocio del backend, y el estado que la decide
 * ya viene derivado en `CompraDetalle.estado`. Este schema sólo cuida la
 * forma del dato — mismo criterio que `editarItemCompraSchema`, que tampoco
 * re-implementa el congelamiento.
 */
export const editarCompraSchema = z.object({
  motivo: motivo("El motivo es requerido"),
  descripcion: z.string().optional(),
  fechaSolicitud: fecha("La fecha de solicitud es requerida"),
  sectorId: z.string().optional(),
});
export type EditarCompraFormValues = z.infer<typeof editarCompraSchema>;

/** Espejo de `AgregarItemCompraHttpDto` (§4.2, S4). */
export const agregarItemCompraSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
  /**
   * Espejo de `@IsNumber({maxDecimalPlaces:2}) @Min(0.01)` — equivalente a
   * "cantidad > 0".
   *
   * Sigue en `z.coerce.number()` y NO usa `numeroRequerido` a propósito: el
   * `min(0.01)` ya frena el `0` que produce `Number("")`, así que no hay cero
   * fantasma acá. La asimetría que queda es de mensaje, no de datos — vaciar
   * el campo dice "debe ser mayor a 0" en vez de "es requerido". Unificarlo
   * es deseable pero cambia el copy de un campo que hoy funciona bien, así
   * que va aparte.
   */
  cantidad: z.coerce
    .number()
    .min(0.01, "La cantidad debe ser mayor a 0")
    .refine(conDosDecimales, MENSAJE_DECIMALES),
  proveedor: z.string().min(1, "El proveedor es requerido"),
  /** Espejo de `@IsNumber({maxDecimalPlaces:2}) @Min(0)` — el monto no puede ser negativo. */
  monto: monto(),
  moneda: z.enum(MONEDAS_ADMITIDAS, { errorMap: () => ({ message: "Elegí una moneda" }) }),
  fechaCotizacion: fecha("La fecha de cotización es requerida"),
  observaciones: z.string().optional(),
});
export type AgregarItemCompraFormValues = z.infer<typeof agregarItemCompraSchema>;

/**
 * Espejo de `EditarItemCompraHttpDto` (§4.2/§4.4) — PATCH semántico; el
 * congelamiento (S13) y los campos libres (S14) los resuelve el backend, no
 * este schema.
 *
 * Todos los campos son opcionales MENOS `monto`, y la excepción es
 * deliberada: con `.optional()`, un campo vaciado se volvía clave omitida y
 * el PATCH no cambiaba nada, así que el usuario creía haber borrado el monto
 * y no pasaba nada — un no-op silencioso, peor de diagnosticar que un error.
 * Requerirlo no rompe el PATCH: la opcionalidad real vive en
 * `EditarItemCompraDto` (`types.ts`) y la omisión la decide el spread de
 * `item-edit-dialog.tsx`, que ya excluye `monto` cuando el ítem está
 * congelado. Y "no quiero cambiarlo" se expresa no tocando el campo, porque
 * el diálogo precarga el valor vigente.
 */
export const editarItemCompraSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida").optional(),
  cantidad: z.coerce
    .number()
    .min(0.01, "La cantidad debe ser mayor a 0")
    .refine(conDosDecimales, MENSAJE_DECIMALES)
    .optional(),
  proveedor: z.string().min(1, "El proveedor es requerido").optional(),
  monto: monto(),
  moneda: z.enum(MONEDAS_ADMITIDAS, { errorMap: () => ({ message: "Elegí una moneda" }) }).optional(),
  fechaCotizacion: fecha("La fecha de cotización es requerida").optional(),
  observaciones: z.string().optional(),
});
export type EditarItemCompraFormValues = z.infer<typeof editarItemCompraSchema>;

/** Espejo de `RegistrarOrdenDeItemHttpDto` (R1) — acumulado, no delta. `fecha` opcional. */
export const registrarOrdenDeItemSchema = z.object({
  cantidadOrdenada: numeroRequerido({
    requerido: "La cantidad ordenada es requerida",
    negativo: "La cantidad ordenada no puede ser negativa",
    invalido: "Ingresá una cantidad válida",
  }),
  fecha: z.string().optional(),
});
export type RegistrarOrdenDeItemFormValues = z.infer<typeof registrarOrdenDeItemSchema>;

/**
 * Espejo de `RegistrarRecepcionDeItemHttpDto` (R1) — acumulado, no delta.
 * Reemplaza a `registrarCompraDeItemSchema` (WU-26).
 */
export const registrarRecepcionDeItemSchema = z.object({
  cantidadRecibida: numeroRequerido({
    requerido: "La cantidad recibida es requerida",
    negativo: "La cantidad recibida no puede ser negativa",
    invalido: "Ingresá una cantidad válida",
  }),
  fecha: z.string().optional(),
});
export type RegistrarRecepcionDeItemFormValues = z.infer<typeof registrarRecepcionDeItemSchema>;

/** Espejo de `RegistrarEntregaDeItemHttpDto` (§4.6) — acumulado, no delta. */
export const registrarEntregaDeItemSchema = z.object({
  cantidadEntregada: numeroRequerido({
    requerido: "La cantidad entregada es requerida",
    negativo: "La cantidad entregada no puede ser negativa",
    invalido: "Ingresá una cantidad válida",
  }),
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
