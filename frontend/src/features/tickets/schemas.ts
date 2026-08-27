/**
 * Validación cliente-side de los forms de Tickets (react-hook-form + zod).
 * Espejo mínimo de las reglas del backend (`ticket.dto.ts`); el backend
 * sigue siendo la fuente de verdad real.
 */
import { z } from "zod";
import {
  TICKET_TITULO_MAX_LENGTH,
  MENSAJE_TITULO_DEMASIADO_LARGO,
} from "@/shared/lib/limites-ticket";

export const crearTicketSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  tipoId: z.string().uuid("Elegí un tipo de ticket"),
  prioridadId: z.string().uuid("Elegí una prioridad"),
  ticketReferenciaId: z.string().uuid().optional().or(z.literal("")),
});
export type CrearTicketFormValues = z.infer<typeof crearTicketSchema>;

export const editarTicketSchema = z.object({
  titulo: z
    .string()
    .min(1, "El título es requerido")
    .max(TICKET_TITULO_MAX_LENGTH, MENSAJE_TITULO_DEMASIADO_LARGO),
  descripcion: z.string().optional(),
  prioridadId: z.string().uuid("Elegí una prioridad"),
});
export type EditarTicketFormValues = z.infer<typeof editarTicketSchema>;

export const comentarioSchema = z.object({
  texto: z.string().min(1, "El comentario no puede estar vacío"),
  esInterno: z.boolean().optional(),
});
export type ComentarioFormValues = z.infer<typeof comentarioSchema>;
