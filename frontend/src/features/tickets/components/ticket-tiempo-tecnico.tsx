"use client";

/**
 * TicketTiempoTecnico — tarjeta "Tiempo del técnico" del detalle del ticket
 * (odd/tasks/tiempo-tecnico.md, T4, S8): cada tramo con su técnico, las horas
 * hábiles que contó en su propio horario (sin la espera al cliente), la meta
 * del SLA del ticket y el veredicto.
 *
 * Se mide desde el deploy, sin historia (fuera de alcance del documento): un
 * ticket sin tramos no muestra la tarjeta, en vez de una vacía en cada ticket
 * viejo. Mientras carga tampoco; si falla, la tarjeta aparece con el aviso.
 * La visibilidad la decide el backend (quien ve el ticket ve sus tramos).
 */
import { useTramosTecnico } from "../hooks/use-tramos-tecnico";
import { veredictoTramo } from "../lib/veredicto-tramo";
import type { TramoTecnico } from "../types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearDuracionHabil } from "@/shared/lib/duracion-habil";
import { formatearInstante } from "@/shared/lib/formato-fecha";

export interface TicketTiempoTecnicoProps {
  ticketId: string;
}

const SIN_DATO = "—";

function nombreTecnico(tramo: TramoTecnico): string {
  const completo = [tramo.tecnicoNombre, tramo.tecnicoApellido]
    .filter((parte) => parte !== null && parte.trim() !== "")
    .join(" ");
  return completo || "Usuario";
}

function duracion(segundos: number | null): string {
  return segundos === null ? SIN_DATO : formatearDuracionHabil(segundos);
}

export function TicketTiempoTecnico({ ticketId }: TicketTiempoTecnicoProps) {
  const tramosQuery = useTramosTecnico(ticketId);

  if (tramosQuery.isLoading) return null;
  if (!tramosQuery.isError && (tramosQuery.data ?? []).length === 0) return null;

  return (
    <section
      aria-labelledby="tiempo-tecnico-titulo"
      className="flex flex-col gap-4 rounded-lg border border-border bg-seccion-tareas p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="tiempo-tecnico-titulo" className="text-sm font-semibold text-foreground">
          Tiempo del técnico
        </h2>
        <p className="text-xs text-muted-foreground">
          Horas hábiles en el horario de cada técnico, sin la espera al cliente, contra la meta del SLA.
        </p>
      </div>
      {tramosQuery.isError ? (
        <p className="text-sm text-muted-foreground">No se pudo cargar el tiempo del técnico.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Técnico</TableHead>
              <TableHead>Desde</TableHead>
              <TableHead>Hasta</TableHead>
              <TableHead>Horas hábiles</TableHead>
              <TableHead>Meta</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(tramosQuery.data ?? []).map((tramo) => {
              const veredicto = veredictoTramo(tramo);
              return (
                <TableRow key={tramo.id}>
                  <TableCell>{nombreTecnico(tramo)}</TableCell>
                  <TableCell>{formatearInstante(tramo.inicioAt)}</TableCell>
                  <TableCell>{tramo.finAt === null ? SIN_DATO : formatearInstante(tramo.finAt)}</TableCell>
                  <TableCell>{duracion(tramo.habilS)}</TableCell>
                  <TableCell>{duracion(tramo.metaS)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={veredicto.variant}>{veredicto.etiqueta}</Badge>
                      {veredicto.motivo !== null && (
                        <span className="text-xs text-muted-foreground">{veredicto.motivo}</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
