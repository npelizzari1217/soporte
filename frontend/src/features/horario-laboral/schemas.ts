import { z } from "zod";
import { hhmmAMinutos } from "./minutos";
import { DIAS_POR_SEMANA } from "./limites";

const HHMM_REGEX = /^\d{2}:\d{2}$/;

/**
 * Validación cliente-side de una fila del form de `horario-laboral` (RHF +
 * zod), espejo de `DiaHorarioLaboralDto` (D9/D15, design.md) — feedback
 * inmediato antes de pegarle a la API. El form trabaja con strings `HH:MM`
 * (`apertura`/`cierre`), no con minutos: la conversión a `DiaHorarioLaboral`
 * (`types.ts`) vive en el componente (WU-8a, `aDto()`), usando
 * `minutos.ts`.
 */
export const diaFormSchema = z.object({
  diaSemana: z.number().int().min(0).max(6),
  abierto: z.boolean(),
  apertura: z.string(),
  cierre: z.string(),
});
export type DiaFormValues = z.infer<typeof diaFormSchema>;

/**
 * Validación cliente-side del horario laboral completo, espejo de
 * `HorarioLaboralDto`/`HorarioLaboralSemanal.crear()` (D7/D15,
 * design.md): exactamente 7 días, sin `diaSemana` repetido, cada día
 * abierto con `apertura < cierre`, y al menos un día abierto.
 *
 * El orden de validación por día espeja al VO del backend (D7): apertura y
 * cierre obligatorios si `abierto`, luego `apertura < cierre` en minutos.
 * `diaSemana` único se chequea sobre el array completo. "Al menos un día
 * abierto" es la única regla del AGREGADO — no vive en ninguna fila — así
 * que su error cuelga de la RAÍZ del array (`path: []`), igual que
 * `HorarioLaboralSinDiasAbiertosError` en el dominio.
 */
export const horarioLaboralFormSchema = z
  .array(diaFormSchema)
  .length(DIAS_POR_SEMANA, `El horario debe tener exactamente ${DIAS_POR_SEMANA} días.`)
  .superRefine((dias, ctx) => {
    const vistos = new Set<number>();
    dias.forEach((dia, index) => {
      if (vistos.has(dia.diaSemana)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `El día ${dia.diaSemana} está repetido.`,
          path: [index, "diaSemana"],
        });
      }
      vistos.add(dia.diaSemana);

      if (!dia.abierto) return;

      if (!HHMM_REGEX.test(dia.apertura)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La apertura es obligatoria.",
          path: [index, "apertura"],
        });
        return;
      }
      if (!HHMM_REGEX.test(dia.cierre)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El cierre es obligatorio.",
          path: [index, "cierre"],
        });
        return;
      }

      const apertura = hhmmAMinutos(dia.apertura, false);
      const cierre = hhmmAMinutos(dia.cierre, true);
      if (apertura >= cierre) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "La apertura debe ser anterior al cierre.",
          path: [index, "cierre"],
        });
      }
    });

    if (dias.every((dia) => !dia.abierto)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Debe quedar al menos un día abierto.",
        path: [],
      });
    }
  });
export type HorarioLaboralFormValues = z.infer<typeof horarioLaboralFormSchema>;
