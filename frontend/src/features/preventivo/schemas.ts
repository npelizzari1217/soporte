import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";

/**
 * Validación cliente-side del form de planes de Preventivo (RHF + zod), espejo
 * DEL RASGO ESTRUCTURAL del backend (`plan-preventivo.entity.ts`, ADR-PV1) —
 * NO reemplaza al dominio ni al CHECK de Postgres (`planes_preventivo_objetivo_check`),
 * solo mejora el feedback antes de pegarle a la API.
 *
 * `TITULO_MAX_LENGTH`/`UBICACION_MAX_LENGTH`/`INTERVALO_VALOR_MAXIMO` espejan
 * los mismos techos de `plan-preventivo.entity.ts` (backend) — fix post-verify
 * (hallazgo "límites de la base más estrictos que el dominio"): sin esto, un
 * título/ubicación muy largos o una cadencia desbordada llegaban a la API y
 * volvían como un 400 recién después del viaje de red, en vez de avisar en el
 * momento en el form.
 */
const MENSAJE_OBJETIVO_AMBOS = "Elija equipo o ubicación, no los dos";
const MENSAJE_OBJETIVO_NINGUNO = "Elija un equipo o una ubicación";
const TITULO_MAX_LENGTH = 255;
const UBICACION_MAX_LENGTH = 255;
const INTERVALO_VALOR_MAXIMO = 3650;

/**
 * Días que vale un mes al comparar la anticipación contra la cadencia. Copia a mano
 * de `DIAS_POR_MES_ANTICIPACION` (`plan-preventivo.entity.ts`, backend); el test
 * centinela de `schemas.test.ts` fija el valor. Si el backend lo cambia, hay que
 * venir a cambiarlo acá.
 */
export const DIAS_POR_MES_ANTICIPACION = 30;
const MENSAJE_ANTICIPACION_NO_MENOR =
  "La anticipación debe ser menor que la cadencia (un mes cuenta como 30 días)";

function enDias(valor: number, unidad: "DIAS" | "MESES"): number {
  return unidad === "MESES" ? valor * DIAS_POR_MES_ANTICIPACION : valor;
}

/**
 * Espejo de `validarAnticipacion` del dominio: la anticipación tiene que ser
 * estrictamente menor que la cadencia, comparadas en días. Solo compara cuando
 * los dos números ya pasaron su propio formato; si no, el error de formato del
 * campo es el que corresponde mostrar.
 */
function validarAnticipacionMenorQueCadencia(
  data: {
    intervaloValor: string;
    intervaloUnidad: "DIAS" | "MESES";
    anticipacionValor: string;
    anticipacionUnidad: "DIAS" | "MESES";
  },
  ctx: z.RefinementCtx,
): void {
  if (!/^[1-9]\d*$/.test(data.intervaloValor) || !/^\d+$/.test(data.anticipacionValor)) return;
  const anticipacion = enDias(Number(data.anticipacionValor), data.anticipacionUnidad);
  const cadencia = enDias(Number(data.intervaloValor), data.intervaloUnidad);
  if (anticipacion >= cadencia) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: MENSAJE_ANTICIPACION_NO_MENOR, path: ["anticipacionValor"] });
  }
}

function validarObjetivoExcluyente(
  data: { equipoId?: string; ubicacion?: string },
  ctx: z.RefinementCtx,
): void {
  const tieneEquipo = !!data.equipoId;
  const tieneUbicacion = !!data.ubicacion?.trim();
  if (tieneEquipo === tieneUbicacion) {
    const mensaje = tieneEquipo ? MENSAJE_OBJETIVO_AMBOS : MENSAJE_OBJETIVO_NINGUNO;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensaje, path: ["equipoId"] });
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensaje, path: ["ubicacion"] });
  }
}

const camposComunes = {
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TITULO_MAX_LENGTH, mensajeDemasiadoLargo("El título", TITULO_MAX_LENGTH)),
  instrucciones: z.string().optional(),
  equipoId: z.string().optional(),
  // Normaliza ANTES de medir, con `.pipe()` porque en Zod 3 `.max()` no encadena
  // después de un `.transform()`. Espeja a `normalizarUbicacion` +
  // `validarUbicacionLargo` del dominio (`plan-preventivo.entity.ts:110-132`),
  // que también miden post-normalización.
  //
  // Medir el valor CRUDO y enviar el normalizado son dos strings distintos, y la
  // diferencia no es teórica: `toUpperCase()` AGRANDA ('ß' → 'SS', 'ﬁ' → 'FI'),
  // así que 255 caracteres que la pantalla daba por buenos llegaban al backend
  // como 256 y volvían como un 400. En la otra dirección, medir sin `trim()`
  // rechazaba en pantalla un valor que el backend habría aceptado. El front tiene
  // que ser espejo del backend, ni más laxo ni más estricto.
  //
  // Al salir normalizado del parseo, el submit NO debe volver a normalizar: lo
  // validado y lo enviado son el mismo string.
  ubicacion: z
    .string()
    .transform((valor) => valor.trim().toUpperCase())
    .pipe(z.string().max(UBICACION_MAX_LENGTH, mensajeDemasiadoLargo("La ubicación", UBICACION_MAX_LENGTH)))
    .optional(),
  prioridadId: z.string().min(1, "Elija una prioridad"),
  // Tipo de ticket de los tickets que genera el plan (odd/preventivo-por-tipo, S2). Que esté
  // vigente y que el usuario lo vea lo decide el backend; acá solo que haya uno elegido.
  tipoId: z.string().min(1, "Elija un tipo de ticket"),
  responsableId: z.string().min(1, "Elija un responsable"),
  intervaloValor: z
    .string()
    .min(1, "La cadencia es requerida")
    .regex(/^[1-9]\d*$/, "Ingrese un número entero positivo")
    .refine(
      (valor) => Number(valor) <= INTERVALO_VALOR_MAXIMO,
      `La cadencia no puede superar ${INTERVALO_VALOR_MAXIMO}`,
    ),
  // Sin `errorMap`: el `<Select>` de unidad siempre tiene `defaultValue="MESES"`
  // y solo ofrece "DIAS"/"MESES" (sin opción vacía) — este campo NUNCA puede
  // llegar vacío desde el form, así que un mensaje de error dedicado sería
  // código muerto (hallazgo de revisión #7).
  intervaloUnidad: z.enum(["DIAS", "MESES"]),
  // Texto y no número, igual que la cadencia: `Number("")` es 0, y un campo
  // borrado no puede convertirse en silencio en "sin anticipación". El form
  // arranca en "0"; vaciarlo es un error, no un 0.
  anticipacionValor: z
    .string()
    .min(1, "La anticipación es requerida")
    .regex(/^\d+$/, "Ingrese un número entero mayor o igual a 0"),
  anticipacionUnidad: z.enum(["DIAS", "MESES"]),
  fechaInicio: z.string().min(1, "La fecha de inicio es requerida"),
};

export const crearPlanPreventivoSchema = z.object(camposComunes).superRefine((data, ctx) => {
  validarObjetivoExcluyente(data, ctx);
  validarAnticipacionMenorQueCadencia(data, ctx);
});
export type CrearPlanPreventivoFormValues = z.infer<typeof crearPlanPreventivoSchema>;

/**
 * Validación cliente-side del form de EDICIÓN (EP-R1, ADR-5). Reusa
 * `camposComunes` menos `fechaInicio` (no se edita desde este form, ni
 * habilitado ni deshabilitado) y suma `activo` (se cambia en el mismo envío,
 * sin endpoint aparte). Mismo XOR de objetivo que el alta (`validarObjetivoExcluyente`).
 */
const camposEdicion = {
  titulo: camposComunes.titulo,
  instrucciones: camposComunes.instrucciones,
  equipoId: camposComunes.equipoId,
  ubicacion: camposComunes.ubicacion,
  prioridadId: camposComunes.prioridadId,
  tipoId: camposComunes.tipoId,
  responsableId: camposComunes.responsableId,
  intervaloValor: camposComunes.intervaloValor,
  intervaloUnidad: camposComunes.intervaloUnidad,
  anticipacionValor: camposComunes.anticipacionValor,
  anticipacionUnidad: camposComunes.anticipacionUnidad,
};

export const editarPlanPreventivoSchema = z
  .object({ ...camposEdicion, activo: z.boolean() })
  .superRefine((data, ctx) => {
    validarObjetivoExcluyente(data, ctx);
    validarAnticipacionMenorQueCadencia(data, ctx);
  });
export type EditarPlanPreventivoFormValues = z.infer<typeof editarPlanPreventivoSchema>;
