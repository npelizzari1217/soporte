/**
 * Schemas Zod de la pantalla de reglas de asignación automática, espejo de
 * `ReglaAsignacionFila` / `CandidatoRegla` / `ESTADOS_REGLA_ASIGNACION`
 * (`backend/src/reglas-asignacion/domain/estado-regla-asignacion.ts`) y de
 * `ConfigurarReglaAsignacionBodyDto`. El backend es la autoridad: esto valida
 * la forma de la respuesta y arma el body del `PUT`.
 */
import { z } from "zod";

/** Espejo de `ESTADOS_REGLA_ASIGNACION`: el estado se calcula en cada lectura, nunca se guarda. */
export const ESTADOS_REGLA_ASIGNACION = ["SIN_REGLA", "VALIDA", "ROTA"] as const;

export const estadoReglaAsignacionSchema = z.enum(ESTADOS_REGLA_ASIGNACION);

export const reglaAsignacionFilaSchema = z.object({
  tipoId: z.string(),
  codigo: z.string(),
  nombre: z.string(),
  modulo: z.string(),
  responsableId: z.string().nullable(),
  responsableNombre: z.string().nullable(),
  estado: estadoReglaAsignacionSchema,
});

export const candidatoReglaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  apellido: z.string(),
});

export const reglasAsignacionVistaSchema = z.object({
  reglas: z.array(reglaAsignacionFilaSchema),
  candidatosPorModulo: z.record(z.string(), z.array(candidatoReglaSchema)),
});

/** Body de `PUT /reglas-asignacion/:tipoId`; `null` quita la regla del tipo. */
export const configurarReglaBodySchema = z.object({
  responsableId: z.string().uuid().nullable(),
});
