/**
 * Tipos de la pantalla de reglas de asignación automática — inferidos de los
 * schemas Zod, que espejan los DTO reales del backend
 * (`backend/src/reglas-asignacion/domain/estado-regla-asignacion.ts`).
 */
import type { z } from "zod";
import type {
  candidatoReglaSchema,
  configurarReglaBodySchema,
  reglaAsignacionFilaSchema,
  reglasAsignacionVistaSchema,
} from "./schemas";

export type ReglaAsignacionFila = z.infer<typeof reglaAsignacionFilaSchema>;
export type CandidatoRegla = z.infer<typeof candidatoReglaSchema>;
export type ReglasAsignacionVista = z.infer<typeof reglasAsignacionVistaSchema>;
export type ConfigurarReglaBody = z.infer<typeof configurarReglaBodySchema>;

/** Variables de la mutación: el tipo a configurar y su responsable (`null` quita la regla). */
export interface ConfigurarReglaVariables {
  tipoId: string;
  responsableId: string | null;
}
