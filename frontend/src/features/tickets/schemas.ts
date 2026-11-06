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
import { MODALIDADES_TICKET } from "./modalidad";

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
  modalidad: z.enum(MODALIDADES_TICKET),
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
  /** Opcional: con el control deshabilitado no llega valor (odd/edilicia-obra-externa, S1). */
  modalidad: z.enum(MODALIDADES_TICKET).optional(),
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

/** Tope del peso de una tarea y de la suma del ticket (espejo de `PESO_TAREAS_MAX`). */
export const PESO_TAREAS_MAX = 100;

/**
 * Peso de una tarea de un ticket EXTERNA (odd/edilicia-obra-externa, S4, S9, L17): entero de 0 a
 * 100, y sin que la suma del ticket pase de 100. `disponible` es lo que queda para esta tarea
 * (100 menos el peso de las demás activas); el backend repite la cuenta con el lock del ticket.
 *
 * El campo vacío es "requerido", nunca 0: un peso borrado no puede guardarse como cero en silencio.
 *
 * @param disponible Peso máximo que admite esta tarea sin pasar el tope del ticket.
 * @returns El schema del formulario de peso.
 */
export function pesoTareaSchema(disponible: number) {
  return z.object({
    peso: z.preprocess(
      (valor) => (typeof valor === "string" ? (valor.trim() === "" ? undefined : Number(valor)) : valor),
      z
        .number({ required_error: "El peso es requerido", invalid_type_error: "Ingrese un número entero" })
        .int("El peso es un número entero")
        .min(0, "El peso no puede ser negativo")
        .max(
          disponible,
          `Las tareas sumarían más del ${PESO_TAREAS_MAX} %. Para esta tarea quedan ${disponible} %; baje primero el peso de otras.`,
        ),
    ),
  });
}
export type PesoTareaFormValues = { peso: number };
