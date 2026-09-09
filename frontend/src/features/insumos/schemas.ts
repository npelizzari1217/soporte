/**
 * Validación cliente-side de los forms de movimientos de Insumos (RHF + zod),
 * espejo de `RegistrarMovimientoInsumoHttpDto`
 * (`backend/src/insumos/interface/dtos/movimientos-insumo.dto.ts`). El
 * backend sigue siendo la fuente de verdad real — esto es feedback inmediato
 * antes de pegarle a la API, no la barrera.
 */
import { z } from "zod";
import { conDosDecimales, formatearNumeroEsAr, parsearNumeroEsAr } from "@/shared/lib/formato-numero";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import type { TipoAjusteInsumo } from "./types";

/**
 * Topes de `movimientos_insumo`, espejo de las constantes de
 * `MovimientoInsumoEntity` (backend, `movimiento-insumo.entity.ts`). Locales a
 * esta feature: el front no importa del backend (paquetes separados del
 * monorepo, sin build compartido entre Nest y Next), así que se duplican
 * acá — la autoridad real sigue siendo la entidad de dominio.
 */
const MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES = 2;
const MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA = 1_000_000;
const MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH = 500;

const MENSAJE_DECIMALES = `Máximo ${MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES} decimales`;

/**
 * Coerciona el input de cantidad tratando vacío/espacios como AUSENTE, nunca
 * como `0` (AGENTS.md, clase "vacío que se vuelve valor" — mismo criterio que
 * `numeroRequerido` en `features/compras/schemas.ts`). Parsea con
 * `parsearNumeroEsAr`, no `Number()` pelado: soporta el formato es-AR
 * (`"1.234,56"` → `1234.56`, donde `Number()` pelado daría `NaN`) para
 * cualquier valor que llegue como texto. Mientras el campo sea un
 * `<input type="number">` (todos los diálogos de movimientos lo son hoy), el
 * browser sanitiza un pegado inválido a cadena vacía antes de que este schema
 * lo vea, así que ese camino de parseo de texto no se ejerce desde ahí — solo
 * corre si algún consumidor futuro lo cablea a un campo de texto libre. El
 * punto solo se lee como separador de miles cuando además hay una coma
 * decimal, así que el crudo de un `<input type="number">` (`"1000.5"`) se
 * interpreta igual que hoy.
 *
 * `.positive()` y NO `.min(0)`: el backend exige `@IsPositive()` — el cero NO
 * es un movimiento, el piso es exclusivo. Es la diferencia de fondo con
 * `numeroRequerido` de compras (que sí acepta cero para cantidades
 * acumuladas). El `@Max` de acá espeja `MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA`,
 * el techo de NEGOCIO que declara el DTO del backend, no un límite físico de
 * columna.
 *
 * El `z.number()` interno va PELADO — nunca `z.coerce.number()` —, por el
 * mismo motivo documentado en `numeroRequerido` de compras: con `coerce`,
 * `Number(undefined)` es `NaN` y el mensaje de requerido nunca se dispara.
 */
const cantidadMovimientoSchema = z.preprocess(
  (valor) => {
    if (valor === null) return undefined;
    if (typeof valor !== "string") return valor;
    return valor.trim() === "" ? undefined : (parsearNumeroEsAr(valor) ?? Number.NaN);
  },
  z
    .number({
      required_error: "La cantidad es requerida",
      invalid_type_error: "Ingresá una cantidad válida",
    })
    .positive("La cantidad debe ser mayor a 0")
    .max(
      MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
      `La cantidad no puede superar ${MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA}`,
    )
    .refine(conDosDecimales, MENSAJE_DECIMALES),
);

/**
 * Mensaje de "no hay existencia suficiente" — un solo dueño de la frase,
 * compartido por `registrarSalidaInsumoSchema` y `registrarAjusteInsumoSchema`
 * (este último solo lo dispara para `AJUSTE_NEGATIVO`). Mismo criterio que
 * `construirNotaEquiposNoDisponibles` (`movimiento-insumo-dialog.tsx`): la
 * frase no puede divergir entre las dos puertas que la usan.
 *
 * @param stockDisponible Stock vigente a mostrar en el mensaje; `undefined` se muestra como `0`.
 * @returns El texto completo del mensaje de error, listo para el `.refine()` que lo dispara.
 */
function mensajeStockInsuficiente(stockDisponible: number | undefined): string {
  return `No hay existencia suficiente: disponible ${formatearNumeroEsAr(stockDisponible ?? 0)}`;
}

/**
 * Predicado del tope de stock — mismo dueño que `mensajeStockInsuficiente`.
 * `stockDisponible` en `undefined` DESACTIVA el tope, nunca lo trata como `0`
 * (ver el JSDoc de `registrarSalidaInsumoSchema` para el porqué).
 *
 * @param cantidad Cantidad tipeada en el form, ya parseada a número.
 * @param stockDisponible Stock vigente; `undefined` cuando la consulta sigue en vuelo o falló.
 * @returns `true` si la cantidad pasa el tope, o si el tope está desactivado.
 */
function cantidadDentroDelStock(cantidad: number, stockDisponible: number | undefined): boolean {
  return stockDisponible === undefined || cantidad <= stockDisponible;
}

/**
 * Espejo de `RegistrarMovimientoInsumoHttpDto` — sirve tanto para la ENTRADA
 * como para la SALIDA (mismo body en el backend, el tipo lo fija la ruta).
 * `registrarAjusteInsumoSchema`, más abajo, LO EXTIENDE con el discriminador
 * `tipo` propio del ajuste y sobrescribe `motivo` porque esa puerta sí lo
 * exige con contenido.
 *
 * `motivo` es OPCIONAL A PROPÓSITO EN ESTE SCHEMA BASE: que el ajuste lo
 * exija es una regla de NEGOCIO que vive en `MovimientoInsumoEntity.create()`
 * (422, `MotivoAjusteRequeridoError`), no de forma — duplicarla acá le
 * daría dos dueños a la misma regla, y por eso la exigencia vive en el
 * schema del ajuste, no en este. Se mide TRIMEADO, igual que el backend
 * (`@Transform` corre antes que `@MaxLength`): sin el `.trim()`, un motivo que
 * solo pasa el tope por sus espacios de borde se rechazaría acá y se
 * aceptaría en el servidor — el front quedaría MÁS estricto que el backend.
 *
 * `equipoId`/`sectorId` necesitan `.or(z.literal(""))`: son UUID opcionales
 * que salen de un `<select>` con "Sin equipo"/"Sin sector" como opción por
 * defecto, y `.uuid()` por sí solo rechaza la cadena vacía.
 */
export const registrarMovimientoInsumoSchema = z.object({
  cantidad: cantidadMovimientoSchema,
  motivo: z
    .string()
    .optional()
    .refine(
      (valor) => valor === undefined || valor.trim().length <= MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
      mensajeDemasiadoLargo("El motivo", MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH),
    ),
  equipoId: z.string().uuid().optional().or(z.literal("")),
  sectorId: z.string().uuid().optional().or(z.literal("")),
});
export type RegistrarMovimientoInsumoFormValues = z.infer<typeof registrarMovimientoInsumoSchema>;

/**
 * Variante de `registrarMovimientoInsumoSchema` exclusiva de la SALIDA:
 * agrega el tope de que `cantidad` no supere `stockDisponible`. NO es una
 * regla de negocio duplicada — el backend valida el stock bajo un advisory
 * lock en el momento del POST (`StockInsuficienteError`, 422,
 * `MovimientosInsumoController.registrarSalida`) y ESE 422 sigue siendo la
 * autoridad real: otro usuario puede sacar existencia mientras este
 * formulario sigue abierto, y ahí el tope de acá ya no alcanza. Esto es solo
 * el atajo de UX documentado en `AGENTS.md` (clase "topes sin espejar"):
 * evitar el viaje al servidor cuando ya se sabe, al tipear, que la cantidad
 * no entra.
 *
 * `stockDisponible` en `undefined` DESACTIVA el tope — nunca lo trata como
 * `0`. Es el mismo criterio de "no asumir" que aplica al trigger del diálogo
 * (`MovimientoSalidaDialog`): mientras `useStockInsumo` está en vuelo o
 * falló, no hay con qué comparar, y bloquear con un tope inventado sería peor
 * que dejar pasar y confiar en el 422 del backend como backstop.
 *
 * @param stockDisponible Stock vigente del insumo; `undefined` desactiva el tope.
 * @returns `registrarMovimientoInsumoSchema` con el `.refine()` de stock agregado.
 */
export type RegistrarSalidaInsumoSchema = z.ZodEffects<typeof registrarMovimientoInsumoSchema>;

export function registrarSalidaInsumoSchema(stockDisponible: number | undefined): RegistrarSalidaInsumoSchema {
  return registrarMovimientoInsumoSchema.refine(
    (valores) => cantidadDentroDelStock(valores.cantidad, stockDisponible),
    {
      message: mensajeStockInsuficiente(stockDisponible),
      path: ["cantidad"],
    },
  );
}

/**
 * Las dos direcciones válidas del campo `tipo` del ajuste, como tupla literal
 * para `z.enum`. Se escribe una sola vez y el `satisfies` la ata a
 * `TipoAjusteInsumo` (que a su vez deriva de `TIPOS_MOVIMIENTO_INSUMO`,
 * `types.ts`): si esos nombres cambiaran ahí, esto rompe el typecheck en vez
 * de validar contra un valor que el dominio ya no reconoce.
 */
const OPCIONES_TIPO_AJUSTE = ["AJUSTE_POSITIVO", "AJUSTE_NEGATIVO"] as const satisfies readonly TipoAjusteInsumo[];

/**
 * Base del formulario de AJUSTE: extiende `registrarMovimientoInsumoSchema`
 * con el discriminador `tipo` (espejo de `RegistrarAjusteInsumoHttpDto`,
 * backend) y SOBRESCRIBE `motivo` para exigirle contenido.
 *
 * A diferencia de entrada/salida, acá SÍ corresponde mirar esta precondición
 * en el cliente: el dominio la exige siempre (`MotivoAjusteRequeridoError`,
 * 422), y es una condición que se conoce al tipear — no una carrera con el
 * servidor, como sí lo es el stock de la salida. Dejarla viajar al backend
 * mandaría al usuario a perder lo escrito por algo que el formulario ya podía
 * decirle (AGENTS.md, formularios, "forma 2 de fallo"). Se mide TRIMEADO,
 * igual que `transformarMotivo` del backend (`movimientos-insumo.dto.ts`):
 * un motivo de puros espacios no es contenido.
 */
const ajusteInsumoObjectSchema = registrarMovimientoInsumoSchema.extend({
  tipo: z.enum(OPCIONES_TIPO_AJUSTE, { required_error: "El tipo de ajuste es requerido" }),
  motivo: z
    .string({ required_error: "El motivo es requerido" })
    .refine((valor) => valor.trim().length > 0, "El motivo es requerido")
    .refine(
      (valor) => valor.trim().length <= MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
      mensajeDemasiadoLargo("El motivo", MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH),
    ),
});
export type RegistrarAjusteInsumoFormValues = z.infer<typeof ajusteInsumoObjectSchema>;

/**
 * Schema completo del AJUSTE: agrega sobre `ajusteInsumoObjectSchema` el tope
 * de stock, que aplica SOLO al `AJUSTE_NEGATIVO` — un ajuste positivo sube la
 * existencia, nunca puede quedarse corto de nada. Mismo mecanismo de
 * `.refine` con `stockDisponible` inyectado que `registrarSalidaInsumoSchema`
 * — ver su JSDoc para por qué `undefined` desactiva el tope en vez de
 * tratarse como `0` — con el agregado de que acá el tope además queda
 * condicionado al `tipo` que el usuario eligió.
 *
 * @param stockDisponible Stock vigente del insumo; topa la cantidad solo cuando `tipo` es `AJUSTE_NEGATIVO`.
 * @returns `ajusteInsumoObjectSchema` con el `.refine()` de stock agregado.
 */
export type RegistrarAjusteInsumoSchema = z.ZodEffects<typeof ajusteInsumoObjectSchema>;

export function registrarAjusteInsumoSchema(stockDisponible: number | undefined): RegistrarAjusteInsumoSchema {
  return ajusteInsumoObjectSchema.refine(
    (valores) =>
      valores.tipo !== "AJUSTE_NEGATIVO" || cantidadDentroDelStock(valores.cantidad, stockDisponible),
    {
      message: mensajeStockInsuficiente(stockDisponible),
      path: ["cantidad"],
    },
  );
}

/** `codigo` de catálogo: mayúsculas/números/guion bajo, sin espacios (consistente con sectores/tipos_ticket). */
const CODIGO_CATALOGO_PATTERN = /^[A-Z0-9_]+$/;

/**
 * Validación cliente-side del form de familias de insumo (ABM, Admin >
 * Insumos). Espejo mínimo de `CreateFamiliaInsumoDto`/`EditFamiliaInsumoDto`
 * — el backend sigue siendo la fuente de verdad real (422 en código
 * duplicado, `FamiliaInsumoCodigoDuplicadoError`).
 *
 * `.max(...)` espeja el `@MaxLength` del DTO, que a su vez espeja
 * `FamiliaInsumoEntity` (`FAMILIA_INSUMO_CODIGO_MAX_LENGTH = 30`,
 * `FAMILIA_INSUMO_NOMBRE_MAX_LENGTH = 100`). Mismo patrón que `sectorSchema`
 * (`features/sectores/schemas.ts`).
 */
const FAMILIA_INSUMO_CODIGO_MAX_LENGTH = 30;
const FAMILIA_INSUMO_NOMBRE_MAX_LENGTH = 100;

/**
 * Espejo exacto de `normalizarCodigoInsumo` (`insumo.entity.ts`), que el borde
 * aplica con `@Transform` ANTES de su `@MaxLength`.
 *
 * Va con `refine` y no con `.min()`/`.max()` porque esos miden el string CRUDO:
 * `toUpperCase()` puede AGRANDARLO —`'ß'` se convierte en `'SS'`—, así que 50
 * caracteres tipeados pueden ser 100 al persistirse. Mismo criterio que
 * `features/tipos-componente/limites.ts`.
 *
 * @param valor Lo que el usuario tipeó en el campo.
 * @returns El código tal como va a persistirse.
 */
const normalizarCodigoInsumo = (valor: string): string => valor.trim().toUpperCase();

export const familiaInsumoSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es requerido")
    .max(FAMILIA_INSUMO_CODIGO_MAX_LENGTH, mensajeDemasiadoLargo("El código", FAMILIA_INSUMO_CODIGO_MAX_LENGTH))
    .regex(CODIGO_CATALOGO_PATTERN, "Mayúsculas/números/guion bajo, sin espacios"),
  // El `.trim()` espeja que el `@Transform` del borde corre ANTES del
  // `@MinLength(1)`: sin recortar, un nombre de solo espacios mide 3 caracteres,
  // pasa el mínimo del front y se come un 400 remoto por algo que el formulario
  // podía decirle en línea. Mismo criterio que `insumoSchema.codigo`.
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(FAMILIA_INSUMO_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", FAMILIA_INSUMO_NOMBRE_MAX_LENGTH)),
});
export type FamiliaInsumoFormValues = z.infer<typeof familiaInsumoSchema>;

/**
 * Validación cliente-side del form de unidades de medida (ABM, Admin >
 * Insumos). Espejo mínimo de `CreateUnidadMedidaDto`/`EditUnidadMedidaDto`,
 * mismo criterio que `familiaInsumoSchema` — topes propios porque
 * `UnidadMedidaEntity` los declara distintos (`UNIDAD_MEDIDA_CODIGO_MAX_LENGTH
 * = 20`, `UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH = 50`).
 */
const UNIDAD_MEDIDA_CODIGO_MAX_LENGTH = 20;
const UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH = 50;

export const unidadMedidaSchema = z.object({
  codigo: z
    .string()
    .min(1, "El código es requerido")
    .max(UNIDAD_MEDIDA_CODIGO_MAX_LENGTH, mensajeDemasiadoLargo("El código", UNIDAD_MEDIDA_CODIGO_MAX_LENGTH))
    .regex(CODIGO_CATALOGO_PATTERN, "Mayúsculas/números/guion bajo, sin espacios"),
  // `.trim()` por el mismo motivo que en `familiaInsumoSchema.nombre`.
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", UNIDAD_MEDIDA_NOMBRE_MAX_LENGTH)),
});
export type UnidadMedidaFormValues = z.infer<typeof unidadMedidaSchema>;

/**
 * Topes de `InsumoEntity` (backend, `insumo.entity.ts`) — duplicados acá por
 * el mismo motivo que `MOVIMIENTO_INSUMO_*` arriba: no hay paquete
 * compartido entre Nest y Next. Propios de esta entidad, distintos de
 * `FAMILIA_INSUMO_*`/`UNIDAD_MEDIDA_*`.
 */
const INSUMO_CODIGO_MAX_LENGTH = 50;
const INSUMO_NOMBRE_MAX_LENGTH = 255;
const INSUMO_STOCK_MINIMO_DECIMALES = 2;
const INSUMO_STOCK_MINIMO_MINIMO = 0;
const INSUMO_STOCK_MINIMO_MAXIMO = 1_000_000;

/**
 * Punto de reposición del insumo: OPCIONAL y, a diferencia de
 * `cantidadMovimientoSchema`, con piso INCLUSIVO en cero —
 * `INSUMO_STOCK_MINIMO_MINIMO` es `0`, y cero es un punto de reposición
 * legítimo ("avisame apenas se agote"), no un movimiento que no puede ser
 * cero.
 *
 * Vacío/espacios → `undefined` ("sin punto definido"), NUNCA `0` — mismo
 * criterio "vacío que se vuelve valor" que `cantidadMovimientoSchema`. El
 * `.refine(conDosDecimales)` adelanta el `@EsNumeroConDecimales` del
 * backend: Postgres NO rechaza un tercer decimal en un `DECIMAL(10,2)`, lo
 * REDONDEA en silencio, así que sin este chequeo el usuario guardaría un
 * número y le quedaría otro distinto.
 */
const stockMinimoInsumoSchema = z.preprocess(
  (valor) => {
    if (valor === null) return undefined;
    if (typeof valor !== "string") return valor;
    return valor.trim() === "" ? undefined : (parsearNumeroEsAr(valor) ?? Number.NaN);
  },
  z
    .number({ invalid_type_error: "Ingresá un stock mínimo válido" })
    .min(INSUMO_STOCK_MINIMO_MINIMO, `El stock mínimo no puede ser menor a ${INSUMO_STOCK_MINIMO_MINIMO}`)
    .max(INSUMO_STOCK_MINIMO_MAXIMO, `El stock mínimo no puede superar ${INSUMO_STOCK_MINIMO_MAXIMO}`)
    .refine(conDosDecimales, `Máximo ${INSUMO_STOCK_MINIMO_DECIMALES} decimales`)
    .optional(),
);

/**
 * Validación cliente-side del form de insumo (ABM sobre `/insumos` — a
 * diferencia de familias/unidades, el catálogo del insumo NO vive bajo
 * `/admin/*`: se gestiona desde la misma pantalla que ya lo lista, gateada
 * por `<SoloAdminCliente>` en cada trigger de escritura). Espejo mínimo de
 * `CreateInsumoDto`/`EditInsumoDto`, RECORTADO al scope de esta entrega:
 * `codigosAlternativos`/`compatibilidad` no tienen campo acá — se gestionan
 * desde la ficha en una entrega posterior (ver el JSDoc de
 * `use-insumo-abm-mutations.ts` para el porqué de nunca mandarlos).
 *
 * `familiaId`/`unidadMedidaId` son los ids que un `<select>` ya restringe a
 * un catálogo real: `.min(1, ...)` alcanza para expresar "requerido", mismo
 * criterio que `proveedor`/`descripcion` en `features/compras/schemas.ts` —
 * no hace falta `.uuid()` para un valor que solo puede salir de una
 * `<option>` real.
 */
export const insumoSchema = z.object({
  /**
   * SIN patrón, a propósito, y ES la diferencia con `familiaInsumoSchema` y
   * `unidadMedidaSchema`: `CreateInsumoDto`/`EditInsumoDto` NO declaran
   * `@Matches` sobre `codigo` —su única normalización es
   * `normalizarCodigoInsumo`, que hace `trim().toUpperCase()`—. Imponer acá
   * `CODIGO_CATALOGO_PATTERN` dejaría al front MÁS ESTRICTO que el borde, y
   * un insumo ya guardado con guion (`TON-001`) quedaría inedi­table: el
   * formulario de edición lo rechazaría aunque el usuario solo quisiera
   * corregirle el nombre.
   *
   * El `.trim()` espeja que el `@MinLength(1)` del borde mide DESPUÉS del
   * `@Transform`: un código de solo espacios llega vacío y se rechaza, en vez
   * de viajar y cobrar un 400.
   */
  codigo: z
    .string()
    .refine((valor) => normalizarCodigoInsumo(valor).length >= 1, "El código es requerido")
    .refine(
      (valor) => normalizarCodigoInsumo(valor).length <= INSUMO_CODIGO_MAX_LENGTH,
      mensajeDemasiadoLargo("El código", INSUMO_CODIGO_MAX_LENGTH),
    ),
  // `.trim()` por el mismo motivo que el `codigo` de arriba: el `@Transform`
  // del `nombre` tambien corre antes de su `@MinLength(1)` en el borde.
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es requerido")
    .max(INSUMO_NOMBRE_MAX_LENGTH, mensajeDemasiadoLargo("El nombre", INSUMO_NOMBRE_MAX_LENGTH)),
  familiaId: z.string().min(1, "La familia es requerida"),
  unidadMedidaId: z.string().min(1, "La unidad de medida es requerida"),
  stockMinimo: stockMinimoInsumoSchema,
});
export type InsumoFormValues = z.infer<typeof insumoSchema>;
