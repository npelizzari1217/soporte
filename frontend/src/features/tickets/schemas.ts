/**
 * Zod schemas for Ticket operations — mirrors the backend DTO contracts.
 *
 * Contract (verified against backend/src/tickets/interface/dtos/tickets.dto.ts):
 *   CreateTicketHttpDto: titulo (req), descripcion?, tipoId (req), prioridadId (req),
 *                        cicloId?, solicitanteId (req), fechaVencimiento?
 *   UpdateTicketHttpDto: titulo?, descripcion?, prioridadId?, cicloId?, fechaVencimiento?
 *                        — SIN tipoId, SIN estado (locked, per backend design).
 *
 * Note: `solicitanteId` is NOT part of the form schema — it is injected at submit
 * from `useSession().user.sub`. It only appears in `CreateTicketInput` (the DTO shape).
 *
 * Spec: tickets-ui §req Schemas Zod por operación
 */

import { z } from 'zod'

// ─── Create ──────────────────────────────────────────────────────────────────

export const CreateTicketSchema = z.object({
  titulo: z
    .string()
    .min(1, 'El título es requerido')
    .max(255, 'El título no puede superar 255 caracteres'),
  descripcion: z.string().max(1000).optional(),
  tipoId: z.string().uuid('Seleccioná un tipo'),
  prioridadId: z.string().uuid('Seleccioná una prioridad'),
  cicloId: z.string().uuid().optional().nullable(),
  /** <input type="date"> returns 'YYYY-MM-DD'. Backend accepts ISO date strings. */
  fechaVencimiento: z.string().optional().nullable(),
})

export type CreateTicketForm = z.infer<typeof CreateTicketSchema>

/**
 * DTO sent to the API: form values + solicitanteId injected at submit from user.sub.
 * solicitanteId is NEVER a form field — the backend derives clienteId/autorId/anio from JWT.
 */
export type CreateTicketInput = CreateTicketForm & { solicitanteId: string }

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * PATCH /tickets/:id — partial update.
 *
 * Constraints (locked by backend DTO):
 *   - NO tipoId  — ticket type is immutable after creation.
 *   - NO estado  — state transitions are managed via dedicated endpoints.
 *
 * All fields are optional; Zod strips unknown keys (default), so accidentally
 * passing `tipoId` from the form is silently dropped before the request body is built.
 *
 * Spec: tickets-ui §req Schemas Zod por operación (UpdateTicketSchema)
 * Design: design.md §3
 */
export const UpdateTicketSchema = z.object({
  titulo: z
    .string()
    .min(1, 'El título es requerido')
    .max(255, 'El título no puede superar 255 caracteres')
    .optional(),
  descripcion: z.string().max(1000).nullable().optional(),
  prioridadId: z.string().uuid('Seleccioná una prioridad').optional(),
  cicloId: z.string().uuid().nullable().optional(),
  /** <input type="date"> returns 'YYYY-MM-DD'. */
  fechaVencimiento: z.string().nullable().optional(),
})

export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>

// ─── Form values (RHF) ─────────────────────────────────────────────────────────

/**
 * Unified react-hook-form values type covering BOTH create and edit modes.
 *
 * `tipoId`/`prioridadId` are optional at the type level — the active Zod schema
 * enforces their requiredness at validation time (Create requires them, Update omits
 * tipoId). This lets a single `useForm<TicketFormValues>` back both modes WITHOUT
 * `any`, so `errors.<campo>?.message` stays typed as `string | undefined`.
 */
export type TicketFormValues = {
  titulo: string
  descripcion?: string | null
  tipoId?: string
  prioridadId?: string
  cicloId?: string | null
  fechaVencimiento?: string | null
}
