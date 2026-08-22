import { z } from "zod";

/**
 * encuestaSchema — validación cliente-side del formulario público de la
 * encuesta de satisfacción. Espejo mínimo del rango que valida el dominio del
 * backend (`PuntajeCsat`, 1..5); el backend sigue siendo la fuente de verdad
 * real — ver `ResponderEncuestaUseCase` (`backend/src/csat`).
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)". Tarea: 8.2.
 */
export const encuestaSchema = z.object({
  puntaje: z
    .number({ required_error: "Elegí un puntaje de 1 a 5 estrellas." })
    .int()
    .min(1, "Elegí un puntaje de 1 a 5 estrellas.")
    .max(5, "Elegí un puntaje de 1 a 5 estrellas."),
  comentario: z.string().max(1000, "Máximo 1000 caracteres").optional(),
});

export type EncuestaFormValues = z.infer<typeof encuestaSchema>;
