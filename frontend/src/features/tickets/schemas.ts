/**
 * Validación cliente-side de los forms de Tickets (react-hook-form + zod).
 * Espejo mínimo de las reglas del backend (`ticket.dto.ts`); el backend
 * sigue siendo la fuente de verdad real.
 */
import { z } from "zod";
import { mensajeDemasiadoLargo } from "@/shared/lib/mensaje-tope";
import {
  TICKET_TITULO_MAX_LENGTH,
  TICKET_UBICACION_MAX_LENGTH,
  MENSAJE_TITULO_DEMASIADO_LARGO,
} from "@/shared/lib/limites-ticket";

const ubicacionSchema = z
  .string()
  .max(TICKET_UBICACION_MAX_LENGTH, mensajeDemasiadoLargo("La ubicación", TICKET_UBICACION_MAX_LENGTH))
  .optional();

/** `""` = sin sector (la opción vacía del select). */
const sectorIdSchema = z.string().uuid().optional().or(z.literal(""));

export const crearTicketSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  tipoId: z.string().uuid("Elija un tipo de ticket"),
  prioridadId: z.string().uuid("Elija una prioridad"),
  ticketReferenciaId: z.string().uuid().optional().or(z.literal("")),
  ubicacion: ubicacionSchema,
  sectorId: sectorIdSchema,
});
export type CrearTicketFormValues = z.infer<typeof crearTicketSchema>;

export const editarTicketSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elija una prioridad"),
  ubicacion: ubicacionSchema,
  sectorId: sectorIdSchema,
});
export type EditarTicketFormValues = z.infer<typeof editarTicketSchema>;

export const comentarioSchema = z.object({
  texto: z.string().min(1, "El comentario no puede estar vacío"),
  esInterno: z.boolean().optional(),
});
export type ComentarioFormValues = z.infer<typeof comentarioSchema>;

/**
 * Tope de la descripción de una tarea: espejo de `TAREA_DESCRIPCION_MAX_LENGTH`
 * (`tarea-ticket.entity.ts`, columna `VarChar(255)`).
 */
export const TAREA_DESCRIPCION_MAX_LENGTH = 255;

/**
 * Espejo de `CrearTareaTicketBodyDto`: al menos un carácter visible (`/\S/`) y
 * hasta 255, contados sobre el texto tal cual, sin recortar — igual que el backend.
 */
export const crearTareaSchema = z.object({
  descripcion: z
    .string()
    .regex(/\S/, "La descripción es requerida")
    .max(
      TAREA_DESCRIPCION_MAX_LENGTH,
      mensajeDemasiadoLargo("La descripción", TAREA_DESCRIPCION_MAX_LENGTH),
    ),
});
export type CrearTareaFormValues = z.infer<typeof crearTareaSchema>;
