/**
 * TicketEquipoMantenimientoCard — tarjeta RESALTADA que muestra el equipo al
 * que se le está haciendo mantenimiento en un ticket de tipo SOPORTE.
 * PRESENTATIONAL — recibe el equipo ya resuelto, sin fetch propio.
 *
 * Solo se monta cuando hay un equipo asociado (el consumidor filtra el
 * `null`) — sin este dato, el ticket de soporte no tiene equipo vinculado
 * (ej. problemas de red/accesos) y no corresponde mostrar nada.
 */
import type { EquipoDeTicket } from "../types";

export interface TicketEquipoMantenimientoCardProps {
  equipo: EquipoDeTicket;
}

export function TicketEquipoMantenimientoCard({ equipo }: TicketEquipoMantenimientoCardProps) {
  return (
    <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary">
        Equipo en mantenimiento
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{equipo.nombre}</p>
      {equipo.numeroSerie && (
        <p className="text-sm text-muted-foreground">Nº serie: {equipo.numeroSerie}</p>
      )}
    </div>
  );
}
