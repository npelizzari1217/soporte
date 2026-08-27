/** Validación cliente-side de los forms de Edilicia (RHF + zod), espejo de `reparaciones.dto.ts`. */
import { z } from "zod";
import {
  TICKET_TITULO_MAX_LENGTH,
  MENSAJE_TITULO_DEMASIADO_LARGO,
} from "@/shared/lib/limites-ticket";

export const crearReparacionSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
  ubicacion: z.string().optional(),
});
export type CrearReparacionFormValues = z.infer<typeof crearReparacionSchema>;

export const crearSubtareaSchema = z.object({
  descripcion: z.string().min(1, "La descripción es requerida"),
});
export type CrearSubtareaFormValues = z.infer<typeof crearSubtareaSchema>;

/** Espeja `CreateComentarioReparacionHttpDto`: recorta primero, después valida (un texto de puros espacios no es un comentario). */
export const COMENTARIO_TEXTO_MAX_LENGTH = 2000;
export const crearComentarioSchema = z.object({
  texto: z
    .string()
    .trim()
    .min(1, "El comentario es requerido")
    .max(COMENTARIO_TEXTO_MAX_LENGTH, `El comentario no puede superar los ${COMENTARIO_TEXTO_MAX_LENGTH} caracteres`),
});
export type CrearComentarioFormValues = z.infer<typeof crearComentarioSchema>;
