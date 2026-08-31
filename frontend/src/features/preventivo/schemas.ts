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
const MENSAJE_OBJETIVO_AMBOS = "Elegí equipo o ubicación, no los dos";
const MENSAJE_OBJETIVO_NINGUNO = "Elegí un equipo o una ubicación";
const TITULO_MAX_LENGTH = 255;
const UBICACION_MAX_LENGTH = 255;
const INTERVALO_VALOR_MAXIMO = 3650;

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
  ubicacion: z
    .string()
    .max(UBICACION_MAX_LENGTH, mensajeDemasiadoLargo("La ubicación", UBICACION_MAX_LENGTH))
    .optional(),
  prioridadId: z.string().min(1, "Elegí una prioridad"),
  responsableId: z.string().min(1, "Elegí un responsable"),
  intervaloValor: z
    .string()
    .min(1, "La cadencia es requerida")
    .regex(/^[1-9]\d*$/, "Ingresá un número entero positivo")
    .refine(
      (valor) => Number(valor) <= INTERVALO_VALOR_MAXIMO,
      `La cadencia no puede superar ${INTERVALO_VALOR_MAXIMO}`,
    ),
  // Sin `errorMap`: el `<Select>` de unidad siempre tiene `defaultValue="MESES"`
  // y solo ofrece "DIAS"/"MESES" (sin opción vacía) — este campo NUNCA puede
  // llegar vacío desde el form, así que un mensaje de error dedicado sería
  // código muerto (hallazgo de revisión #7).
  intervaloUnidad: z.enum(["DIAS", "MESES"]),
  fechaInicio: z.string().min(1, "La fecha de inicio es requerida"),
};

export const crearPlanPreventivoSchema = z
  .object(camposComunes)
  .superRefine(validarObjetivoExcluyente);
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
  responsableId: camposComunes.responsableId,
  intervaloValor: camposComunes.intervaloValor,
  intervaloUnidad: camposComunes.intervaloUnidad,
};

export const editarPlanPreventivoSchema = z
  .object({ ...camposEdicion, activo: z.boolean() })
  .superRefine(validarObjetivoExcluyente);
export type EditarPlanPreventivoFormValues = z.infer<typeof editarPlanPreventivoSchema>;
