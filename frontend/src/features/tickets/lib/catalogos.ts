/**
 * Catalog maps — deterministic seed data matching the backend seed scripts.
 * These UUIDs are stable across all environments (local, staging, prod).
 *
 * No catalog GET endpoints exist: the API returns bare UUIDs for FKs and the
 * frontend resolves them locally using these maps.
 *
 * Spec: [SPEC:frontend-tickets/catalogos]
 */

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
 * Tailwind utility classes for priority badge backgrounds + text.
 * Uses semantic design tokens (no hardcoded colors per constitution §3).
 * Baja → muted, Media → primary/10, Alta → amber-ish (using accent), Crítica → destructive.
 */
export const PRIORIDAD_BADGE: Record<string, string> = {
  "d0000000-0000-4000-d000-000000000001": "bg-muted text-muted-foreground",
  "d0000000-0000-4000-d000-000000000002": "bg-primary/15 text-primary",
  "d0000000-0000-4000-d000-000000000003": "bg-destructive/15 text-destructive",
  "d0000000-0000-4000-d000-000000000004": "bg-destructive text-destructive-foreground",
};
