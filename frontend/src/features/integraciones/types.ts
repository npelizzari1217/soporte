/**
 * Tipos de la pantalla "Integraciones" — inferidos de los schemas Zod, que
 * espejan los DTO reales del backend (`backend/src/integraciones/`).
 */
import type { z } from "zod";
import type { apiClaveCreadaSchema, apiClaveSchema, crearApiClaveBodySchema, permisoApiSchema } from "./schemas";

export type PermisoApi = z.infer<typeof permisoApiSchema>;
export type ApiClave = z.infer<typeof apiClaveSchema>;
export type CrearApiClaveBody = z.infer<typeof crearApiClaveBodySchema>;

/** Lo que queda de la respuesta del alta una vez separada la clave en claro (que nunca se cachea). */
export type ApiClaveCreada = Omit<z.infer<typeof apiClaveCreadaSchema>, "clave">;
