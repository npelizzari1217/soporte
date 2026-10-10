/**
 * Schemas Zod de la pantalla "Integraciones" (api-publica, T9), espejo de
 * `PERMISOS_API` (`backend/src/integraciones/domain/api-clave.ts`), de
 * `ApiClaveVista` / `CrearApiClaveOutput` y de `CrearApiClaveDto`
 * (`backend/src/integraciones/interface/api-claves.controller.ts`). El backend
 * es la autoridad: esto valida la forma de la respuesta y arma el body del `POST`.
 */
import { z } from "zod";

/** Espejo exacto de `PERMISOS_API`: el subconjunto de TICKETS que puede llevar una clave (CA3). */
export const PERMISOS_API = ["TICKETS:LECTURA", "TICKETS:ALTAS", "TICKETS:COMENTAR"] as const;

export const permisoApiSchema = z.enum(PERMISOS_API);

/** Etiqueta visible de cada permiso; el valor que viaja es siempre el de `PERMISOS_API`. */
export const ETIQUETAS_PERMISO_API: Record<(typeof PERMISOS_API)[number], string> = {
  "TICKETS:LECTURA": "Ver tickets",
  "TICKETS:ALTAS": "Crear tickets",
  "TICKETS:COMENTAR": "Comentar tickets",
};

/** Espejo de `LARGO_MAXIMO_NOMBRE_CLAVE`. */
export const LARGO_MAXIMO_NOMBRE_CLAVE = 100;

/** Fila de `GET /integraciones/claves`: nunca trae el hash ni la clave en claro. */
export const apiClaveSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  prefijo: z.string(),
  permisos: z.array(permisoApiSchema),
  creadaAt: z.string(),
  ultimoUsoAt: z.string().nullable(),
  revocadaAt: z.string().nullable(),
});

export const apiClavesSchema = z.array(apiClaveSchema);

/** Respuesta 201 de `POST /integraciones/claves`: la ÚNICA que lleva `clave` en claro (CA9). */
export const apiClaveCreadaSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  prefijo: z.string(),
  permisos: z.array(permisoApiSchema),
  creadaAt: z.string(),
  clave: z.string().min(1),
});

/** Body de `POST /integraciones/claves`, con la misma validación de nombre que el caso de uso. */
export const crearApiClaveBodySchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "Ingresá un nombre para la clave.")
    .max(LARGO_MAXIMO_NOMBRE_CLAVE, `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_CLAVE} caracteres.`),
  permisos: z.array(permisoApiSchema).min(1, "Elegí al menos un permiso."),
});
