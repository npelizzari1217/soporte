/** Validación cliente-side de los forms de Edilicia (RHF + zod), espejo de `reparaciones.dto.ts`. */
import { z } from "zod";
import {
  TICKET_TITULO_MAX_LENGTH,
  MENSAJE_TITULO_DEMASIADO_LARGO,
} from "@/shared/lib/limites-ticket";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import { UBICACION_MAX_LENGTH } from "./limites";

/** Campos comunes del alta y la edición de una reparación. */
const reparacionBaseSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elija una prioridad"),
  ubicacion: z
    .string()
    .max(UBICACION_MAX_LENGTH, mensajeDemasiadoLargo("La ubicación", UBICACION_MAX_LENGTH))
    .optional(),
  /** `""` = sin sector (la opción vacía del select). */
  sectorId: z.string().uuid().optional().or(z.literal("")),
});

/**
 * Alta: suma el tipo, que la edición no cambia (odd/tasks/tipos-ticket-por-modulo.md, S2).
 * `""` = el tipo por defecto, EDILICIA.
 */
export const crearReparacionSchema = reparacionBaseSchema.extend({
  tipoId: z.string().uuid().optional().or(z.literal("")),
});
export type CrearReparacionFormValues = z.infer<typeof crearReparacionSchema>;

/** Mismos campos y topes que el alta: espejo de `EditarReparacionHttpDto` (odd/detalle-ticket-legible). */
export const editarReparacionSchema = reparacionBaseSchema;
export type EditarReparacionFormValues = z.infer<typeof editarReparacionSchema>;

/** Espeja `CreateComentarioReparacionHttpDto`: recorta primero, después valida (un texto de puros espacios no es un comentario). */
export const COMENTARIO_TEXTO_MAX_LENGTH = 2000;
export const crearComentarioSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "El comentario es requerido")
    .max(COMENTARIO_TEXTO_MAX_LENGTH, mensajeDemasiadoLargo("El comentario", COMENTARIO_TEXTO_MAX_LENGTH)),
});
export type CrearComentarioFormValues = z.infer<typeof crearComentarioSchema>;
