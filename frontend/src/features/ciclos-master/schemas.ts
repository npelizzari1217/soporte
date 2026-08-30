import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import { CICLO_VIGENTE_NOMBRE_MAX_LENGTH } from "./limites";

/**
 * Validación cliente-side del form de ciclo (RHF + zod), espejo del
 * invariante estructural del backend (`fechaFin > fechaInicio`, R20,
 * `CicloVigenteEntity.reschedule()`/`.create()`) — feedback inmediato antes
 * de pegarle a la API.
 */
export const cicloVigenteSchema = z
  .object({
    nombre: z
      .string()
      .min(1, "El nombre es requerido")
      .max(
        CICLO_VIGENTE_NOMBRE_MAX_LENGTH,
        mensajeDemasiadoLargo("El nombre", CICLO_VIGENTE_NOMBRE_MAX_LENGTH),
      ),
    fechaInicio: z.string().min(1, "La fecha de inicio es requerida"),
    fechaFin: z.string().min(1, "La fecha de fin es requerida"),
  })
  .refine((data) => data.fechaFin > data.fechaInicio, {
    message: "La fecha de fin debe ser posterior a la fecha de inicio",
    path: ["fechaFin"],
  });
export type CicloVigenteFormValues = z.infer<typeof cicloVigenteSchema>;
