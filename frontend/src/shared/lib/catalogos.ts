/**
 * Catalog maps — deterministic seed data matching the backend seed scripts.
 * These UUIDs are stable across all environments (local, staging, prod).
 *
 * No catalog GET endpoints exist: the API returns bare UUIDs for FKs and the
 * frontend resolves them locally using these maps.
 *
 * Promoted from features/tickets/lib/catalogos.ts — now shared across
 * tickets, compras, reparaciones and any future feature that references
 * estado/prioridad catalog UUIDs.
 *
 * Spec: [SPEC:frontend-tickets/catalogos]
 */

import type { BadgeTone } from '@/shared/lib/badge-tones'

// estadoId → display label
export const ESTADOS: Record<string, string> = {
  "c0000000-0000-4000-c000-000000000001": "Abierto",
  "c0000000-0000-4000-c000-000000000002": "Pendiente de aprobación",
  "c0000000-0000-4000-c000-000000000003": "Aprobado",
  "c0000000-0000-4000-c000-000000000004": "Rechazado",
  "c0000000-0000-4000-c000-000000000005": "En progreso",
  "c0000000-0000-4000-c000-000000000006": "Resuelto",
  "c0000000-0000-4000-c000-000000000007": "Cerrado",
  "c0000000-0000-4000-c000-000000000008": "Cancelado",
};

// prioridadId → display label
export const PRIORIDADES: Record<string, string> = {
  "d0000000-0000-4000-d000-000000000001": "Baja",
  "d0000000-0000-4000-d000-000000000002": "Media",
  "d0000000-0000-4000-d000-000000000003": "Alta",
  "d0000000-0000-4000-d000-000000000004": "Crítica",
};

// tipoId → display label
export const TIPOS: Record<string, string> = {
  "e0000000-0000-4000-e000-000000000001": "Soporte",
  "e0000000-0000-4000-e000-000000000002": "Compras",
  "e0000000-0000-4000-e000-000000000003": "Edilicia",
};

/**
 * Returns the label for an ID from the given map.
 * Falls back to the raw ID if not found (future-proofs against new seed entries).
 */
export function labelFor(map: Record<string, string>, id: string): string {
  return map[id] ?? id;
}


/**
 * Maps estadoId UUID → BadgeTone for the Badge component.
 *
 * Tone semantics per canonical palette (tasks.md — Badge Tone Palette):
 *   neutral → Abierto, Cerrado (dormant/completed without action needed)
 *   warning → Pendiente de aprobación (needs attention)
 *   success → Aprobado, Resuelto (positive outcome)
 *   danger  → Rechazado, Cancelado (negative outcome)
 *   info    → En progreso (active work)
 *
 * UUIDs verified against catalogos.ts ESTADOS map (same seed values).
 */
export const ESTADO_TONE: Record<string, BadgeTone> = {
  "c0000000-0000-4000-c000-000000000001": "neutral",  // Abierto
  "c0000000-0000-4000-c000-000000000002": "warning",  // Pendiente de aprobación
  "c0000000-0000-4000-c000-000000000003": "success",  // Aprobado
  "c0000000-0000-4000-c000-000000000004": "danger",   // Rechazado
  "c0000000-0000-4000-c000-000000000005": "info",     // En progreso
  "c0000000-0000-4000-c000-000000000006": "success",  // Resuelto
  "c0000000-0000-4000-c000-000000000007": "neutral",  // Cerrado
  "c0000000-0000-4000-c000-000000000008": "danger",   // Cancelado
};

/**
 * Maps prioridadId UUID → BadgeTone for the Badge component.
 *
 * Tone semantics:
 *   neutral → Baja (low urgency)
 *   info    → Media (moderate)
 *   warning → Alta (needs prompt attention)
 *   danger  → Crítica (immediate action required)
 *
 * UUIDs verified against catalogos.ts PRIORIDADES map (same seed values).
 */
export const PRIORIDAD_TONE: Record<string, BadgeTone> = {
  "d0000000-0000-4000-d000-000000000001": "neutral",  // Baja
  "d0000000-0000-4000-d000-000000000002": "info",     // Media
  "d0000000-0000-4000-d000-000000000003": "warning",  // Alta
  "d0000000-0000-4000-d000-000000000004": "danger",   // Crítica
};
