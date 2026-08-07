import { z } from "zod";

/**
 * Validación cliente-side de "adoptar ciclo" (T4.5). `cicloVigenteId` se
 * elige de un selector poblado por `GET /ciclos-vigentes` (item 4
 * backend-gaps — cierra G6); igual se valida como UUID acá (defensa en
 * profundidad, espejo de `@IsUUID` en el DTO del backend).
 */
export const adoptarCicloSchema = z.object({
  cicloVigenteId: z.string().uuid("Debe ser un UUID válido (id del ciclo en el catálogo master)"),
});
export type AdoptarCicloFormValues = z.infer<typeof adoptarCicloSchema>;
