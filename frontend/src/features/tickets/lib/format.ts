/**
 * Formatting helpers for the tickets feature.
 * Extracted from TicketsList (PR1 of ticket-detail-page) so it can be reused
 * by TicketDetailView without duplicating the locale logic (Scope Rule: feature-local,
 * shared by 2+ components of the SAME feature — not promoted to /shared).
 */

/** Format ISO date string in Argentinean locale (dd/mm/yyyy). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
