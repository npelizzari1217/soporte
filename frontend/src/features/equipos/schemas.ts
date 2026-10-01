/** Validación cliente-side de los forms de Equipos (RHF + zod), espejo de `equipos.dto.ts`. */
import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import {
  TICKET_TITULO_MAX_LENGTH,
  MENSAJE_TITULO_DEMASIADO_LARGO,
} from "@/shared/lib/limites-ticket";
import { parseImporte } from "./depreciacion";
import { conDosDecimales } from "@/shared/lib/formato-numero";
import { CONDICIONES_STOCK } from "@/features/insumos/types";
import { CATEGORIAS_BAJA_EQUIPO } from "./types";

/**
 * Topes de largo/rango de `equipos_informaticos`/`componentes_equipo`, espejo
 * de `EQUIPO_*`/`COMPONENTE_*` en `equipo-informatico.entity.ts`/
 * `componente-equipo.entity.ts` (backend) — fix defecto "límites de equipos"
 * (sdd/limites-db). Locales a esta feature: ningún otro módulo del front
 * comparte estas columnas. No se importan directo del backend (paquetes
 * separados del monorepo, sin build compartido entre Nest y Next), así que se
 * duplican acá — la autoridad real sigue siendo el dominio/DTO del backend.
 */
const EQUIPO_NOMBRE_MAX_LENGTH = 255;
const EQUIPO_NUMERO_SERIE_MAX_LENGTH = 255;
const EQUIPO_MARCA_MAX_LENGTH = 100;
const EQUIPO_MODELO_MAX_LENGTH = 100;
const EQUIPO_UBICACION_MAX_LENGTH = 255;
const EQUIPO_VALOR_MONETARIO_MINIMO = 0;
const EQUIPO_VALOR_MONETARIO_MAXIMO = 99_999_999;
const COMPONENTE_DESCRIPCION_MAX_LENGTH = 255;
const COMPONENTE_NUMERO_SERIE_MAX_LENGTH = 255;
const COMPONENTE_CAPACIDAD_MAX_LENGTH = 100;

const MENSAJE_VALOR_MONETARIO = `Debe ser un número entre ${EQUIPO_VALOR_MONETARIO_MINIMO} y ${EQUIPO_VALOR_MONETARIO_MAXIMO}, con hasta 2 decimales`;


/**
 * Importe/valor: string del input, vacío es válido (campo opcional).
 *
 * Reusa `parseImporte` de `depreciacion.ts` — el MISMO parser que arma el
 * payload real que se envía al backend (`equipo-create-dialog.tsx`,
 * `equipo-edit-dialog.tsx`) — en vez de un segundo `Number()` crudo.
 *
 * Motivo (defecto detectado en revisión, dos direcciones):
 * - `Number("1000,50")` da `NaN` y este schema lo rechazaría, pero
 *   `parseImporte` (que sí procesa el envío real) lo acepta como `1000.5` —
 *   la coma es el separador decimal válido en este producto rioplatense. Un
 *   `Number()` crudo rechazaba en el form algo que el propio front sabía
 *   parsear y enviar.
 * - Desde que `parseImporte` delega en `parsearNumeroEsAr`, también acepta
 *   separador de miles (`"1.234.567,89"`), siempre que `conDosDecimales` y el
 *   tope de abajo sigan cumpliéndose.
 * - `"100.999"` pasaba un schema sin chequeo de decimales, y el DTO lo
 *   rebotaba con `@IsNumber({ maxDecimalPlaces: 2 })` → 400 remoto por algo
 *   que se veía aceptado en pantalla.
 */
function validarValorMonetario(valor: string | undefined): boolean {
  if (valor === undefined || valor.trim() === "") return true;
  const numero = parseImporte(valor);
  if (numero === null) return false;
  return (
    numero >= EQUIPO_VALOR_MONETARIO_MINIMO &&
    numero <= EQUIPO_VALOR_MONETARIO_MAXIMO &&
    conDosDecimales(numero)
  );
}

/**
 * Normaliza `ubicacion` a mayúscula. Espejo de `normalizarUbicacion` en
 * `equipo-informatico.entity.ts` (backend, dominio): `toUpperCase()` no
 * preserva longitud ('ß' → 'SS'), así que el `.refine()` de acá abajo y el
 * `submit()` de los dos diálogos (create/edit) necesitan medir y enviar
 * EXACTAMENTE el mismo string — de ahí que los tres compartan esta única
 * función en vez de repetir `.toUpperCase()` suelto en cada lugar (el
 * defecto que motivó extraerla: el equivalente backend existía; el front no
 * tenía el suyo y los tres puntos podían divergir).
 */
export function normalizarUbicacion(valor: string): string {
  return valor.toUpperCase();
}

/**
 * Regex del % de depreciación: hasta 3 enteros y 2 decimales, SIN signo (por
 * lo tanto nunca negativo). Extraído como constante para que el schema
 * (abajo) y `esPorcentajeDepreciacionValido` (usado por los diálogos para
 * habilitar el botón "Aplicar") apliquen el mismo criterio — no dos
 * versiones que puedan desalinearse.
 */
const PORCENTAJE_DEPRECIACION_REGEX = /^\d{0,3}([.,]\d{1,2})?$/;

/**
 * Criterio de porcentaje de depreciación válido para habilitar el botón
 * "Aplicar" de `EquipoCreateDialog`/`EquipoEditDialog`. Antes ese botón solo
 * chequeaba "hay algo tipeado" (sin validar el valor), así que un porcentaje
 * negativo como "-50" lo dejaba pasar y escribía un valor residual MAYOR
 * que el importe (el regex del schema recién bloqueaba el submit del
 * formulario completo, no el cálculo). Reusa el mismo regex que el campo
 * `porcentajeDepreciacion` del schema, así el criterio es uno solo.
 *
 * Con una diferencia que conviene tener presente en vez de negarla: acá se
 * mide `valor.trim()` y el schema mide la cadena cruda, así que un valor con
 * espacios alrededor (`" 50 "`) pasaría este chequeo y no el del schema. El
 * campo es un `<input type="number">`, que no puede producir esa cadena, así
 * que hoy es inalcanzable — pero deja de serlo si algún día el campo pasa a
 * ser texto libre. Si eso ocurre, hay que trimear en las dos puntas.
 */
export function esPorcentajeDepreciacionValido(valor: string | undefined): boolean {
  if (!valor || !valor.trim()) return false;
  return PORCENTAJE_DEPRECIACION_REGEX.test(valor.trim());
}

export const crearEquipoSchema = z.object({
  nombre: z
    .string()
    .min(1, "El nombre es requerido")
    .max(EQUIPO_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", EQUIPO_NOMBRE_MAX_LENGTH)),
  numeroSerie: z
    .string()
    .max(
      EQUIPO_NUMERO_SERIE_MAX_LENGTH,
      mensajeDemasiadoLargo("El número de serie", EQUIPO_NUMERO_SERIE_MAX_LENGTH),
    )
    .optional(),
  marca: z
    .string()
    .max(EQUIPO_MARCA_MAX_LENGTH, mensajeDemasiadoLargo("La marca", EQUIPO_MARCA_MAX_LENGTH))
    .optional(),
  modelo: z
    .string()
    .max(EQUIPO_MODELO_MAX_LENGTH, mensajeDemasiadoLargo("El modelo", EQUIPO_MODELO_MAX_LENGTH))
    .optional(),
  /**
   * Modelo del catálogo `ModeloEquipo` elegido en el `<select>` de los dos
   * diálogos de equipo (WU-3, modelos-equipo-catalogo-y-compatibilidad).
   * Admite vacío (R4: un equipo sin modelo de catálogo sigue siendo válido) —
   * mismo molde que `equipoId` en `crearTicketSoporteSchema` (`:267`):
   * `.uuid()` rechaza `""`, así que hace falta el `.or(z.literal(""))`.
   */
  modeloEquipoId: z.string().uuid().optional().or(z.literal("")),
  /**
   * `<input type="date">` → "YYYY-MM-DD" (o "" sin fecha). El backend valida
   * `@IsDateString`. Sin `.or(z.literal(""))`: `z.string().optional()` ya
   * acepta `""` (una cadena vacía es un string válido) — el `.or()` era
   * redundante acá porque no hay ningún refinamiento de formato (`.uuid()`,
   * `.regex()`, etc.) que "" pudiera romper.
   */
  fechaAdquisicion: z.string().optional(),
  /**
   * Texto libre; el límite se mide sobre el valor normalizado a mayúscula
   * (mismo criterio que el backend, `normalizarUbicacion` en
   * `equipo-informatico.entity.ts`), no sobre el crudo: `toUpperCase()` no
   * preserva longitud ('ß' → 'SS'), así que medir el crudo dejaba pasar en
   * el form valores que el backend rechazaba con un 400 (fix defecto
   * "límites de equipos", sdd/limites-db). `.refine()` en vez de
   * `.transform().max()`: en zod 3.25, `.transform()` devuelve `ZodEffects`,
   * que no tiene `.max()` (`TS2339`); `.refine()` además preserva el crudo
   * que tipeó el usuario en React Hook Form sin cambiar el tipo inferido
   * `CrearEquipoFormValues`, así que no hace falta tocar los diálogos.
   */
  ubicacion: z
    .string()
    .refine(
      (valor) => normalizarUbicacion(valor).length <= EQUIPO_UBICACION_MAX_LENGTH,
      mensajeDemasiadoLargo("La ubicación", EQUIPO_UBICACION_MAX_LENGTH),
    )
    .optional(),
  /** Importe/valor (string del input; se convierte a number al enviar con `parseImporte`). */
  importe: z.string().optional().refine(validarValorMonetario, MENSAJE_VALOR_MONETARIO),
  fechaValoracion: z.string().optional(),
  observaciones: z.string().optional(),
  valorResidual: z.string().optional().refine(validarValorMonetario, MENSAJE_VALOR_MONETARIO),
  fechaValorResidual: z.string().optional(),
  /**
   * UI-only: % de depreciación (hasta 3 enteros + 2 decimales). NO se persiste
   * ni se envía al backend — solo deriva `valorResidual` = importe × (1 − %/100).
   * Sin `.or(z.literal(""))`: el regex ya matchea `""` (`\d{0,3}` admite cero
   * repeticiones y el grupo decimal es opcional), así que era redundante.
   */
  porcentajeDepreciacion: z
    .string()
    .regex(PORCENTAJE_DEPRECIACION_REGEX, "Hasta 3 cifras enteras y 2 decimales")
    .optional(),
});
export type CrearEquipoFormValues = z.infer<typeof crearEquipoSchema>;

/**
 * Espejo de `EditarComponenteHttpDto`: la edición solo toca `descripcion`,
 * `numeroSerie` y `capacidad`. El tipo (derivado de la familia del repuesto)
 * y el repuesto son inmutables: no forman parte del formulario ni del PATCH.
 */
export const editarComponenteSchema = z.object({
  descripcion: z
    .string()
    .max(
      COMPONENTE_DESCRIPCION_MAX_LENGTH,
      mensajeDemasiadoLargo("La descripción", COMPONENTE_DESCRIPCION_MAX_LENGTH),
    )
    .optional(),
  numeroSerie: z
    .string()
    .max(
      COMPONENTE_NUMERO_SERIE_MAX_LENGTH,
      mensajeDemasiadoLargo("El número de serie", COMPONENTE_NUMERO_SERIE_MAX_LENGTH),
    )
    .optional(),
  capacidad: z
    .string()
    .max(
      COMPONENTE_CAPACIDAD_MAX_LENGTH,
      mensajeDemasiadoLargo("La capacidad", COMPONENTE_CAPACIDAD_MAX_LENGTH),
    )
    .optional(),
});
export type EditarComponenteFormValues = z.infer<typeof editarComponenteSchema>;

/**
 * Espejo de `CreateComponenteHttpDto` (sdd/catalogo-unico-componentes, WU-4).
 *
 * `insumoId` es OBLIGATORIO (sin `.or(z.literal(""))`): un select sin elegir
 * queda inválido en vez de viajar como "sin repuesto". `descontarStock` es
 * booleano requerido en el formulario: el cliente lo envía SIEMPRE explícito,
 * aunque el backend lo tome como `true` cuando falta. No hay `tipoComponenteCodigo`:
 * el tipo se deriva de la familia del repuesto.
 */
export const agregarComponenteSchema = z.object({
  insumoId: z.string().uuid("Elegí un repuesto del catálogo"),
  descontarStock: z.boolean(),
  /** Solo tiene sentido con `descontarStock`; el diálogo lo agrega al payload desde el selector. */
  condicion: z.enum(CONDICIONES_STOCK).optional(),
  descripcion: z
    .string()
    .max(
      COMPONENTE_DESCRIPCION_MAX_LENGTH,
      mensajeDemasiadoLargo("La descripción", COMPONENTE_DESCRIPCION_MAX_LENGTH),
    )
    .optional(),
  numeroSerie: z
    .string()
    .max(
      COMPONENTE_NUMERO_SERIE_MAX_LENGTH,
      mensajeDemasiadoLargo("El número de serie", COMPONENTE_NUMERO_SERIE_MAX_LENGTH),
    )
    .optional(),
  capacidad: z
    .string()
    .max(
      COMPONENTE_CAPACIDAD_MAX_LENGTH,
      mensajeDemasiadoLargo("La capacidad", COMPONENTE_CAPACIDAD_MAX_LENGTH),
    )
    .optional(),
});
export type AgregarComponenteFormValues = z.infer<typeof agregarComponenteSchema>;

/** `equipoId` OPCIONAL (vínculo ticket↔equipo, espejo de `@IsOptional() @IsUUID() equipoId` backend). */
export const crearTicketSoporteSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
  /**
   * Acá SÍ hace falta `.or(z.literal(""))`: a diferencia de los campos de
   * fecha de arriba, `.uuid()` rechaza `""` (no es un UUID válido), así que
   * sin el `.or()` un combobox sin elegir equipo rompería la validación en
   * vez de viajar como "sin equipo".
   */
  equipoId: z.string().uuid().optional().or(z.literal("")),
  descripcionProblema: z.string().optional(),
});
export type CrearTicketSoporteFormValues = z.infer<typeof crearTicketSoporteSchema>;

/** Tope del motivo del retiro, espejo del backend (400 por encima, tras `trim`). */
export const RETIRO_MOTIVO_MAX_LENGTH = 500;

/**
 * Formulario del retiro de un componente. El motivo es obligatorio solo para el
 * descarte; para la devolución al stock es opcional acá porque el backend lo
 * exige únicamente cuando no hay una SALIDA vinculada (y responde 422, que el
 * diálogo muestra). La autoridad es el backend.
 */
export const retirarComponenteSchema = z
  .object({
    destino: z.enum(["STOCK_USADO", "DESCARTE"]),
    motivo: z.string().optional(),
    /** Solo el legado de un insumo `SERIE` lo pide; el diálogo lo valida con `numeroSerieSchema`. */
    numeroSerie: z.string().optional(),
  })
  .superRefine((valores, ctx) => {
    const motivo = (valores.motivo ?? "").trim();
    if (valores.destino === "DESCARTE" && motivo === "") {
      ctx.addIssue({ code: "custom", path: ["motivo"], message: "Indicá el motivo del descarte" });
    }
    if (motivo.length > RETIRO_MOTIVO_MAX_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message: mensajeDemasiadoLargo("El motivo", RETIRO_MOTIVO_MAX_LENGTH),
      });
    }
  });
export type RetirarComponenteFormValues = z.infer<typeof retirarComponenteSchema>;

/**
 * `baja` de `EquipoResponseDto` (R8): `null` mientras el equipo está vigente.
 * Espejo del DTO del backend, que es la autoridad.
 */
export const bajaEquipoSchema = z
  .object({
    destino: z.enum(["STOCK_USADO", "DESCARTE"]),
    categoria: z.enum(CATEGORIAS_BAJA_EQUIPO),
    motivo: z.string().nullable(),
    fecha: z.string().datetime(),
    usuarioId: z.string().nullable(),
  })
  .nullable();
