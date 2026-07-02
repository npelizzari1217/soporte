"use client";

/**
 * ReportesPage — T6.8 (admin-general PR6d, Grupo D)
 *
 * Pantalla read-only con las 4 agregaciones del módulo `reportes`, filtradas por el
 * par tenant+ciclo resuelto en TenantContext. Visible para ADMINISTRADOR y operador
 * (el backend ya lo restringe via AdminOrGlobalGuard — esta pantalla no repite ese
 * gate, solo consume los 4 endpoints).
 *
 * Arquitectura: 4 secciones independientes (useReportes → useQueries), cada una con
 * su propio estado de loading/error/data — el fallo de una NO cascadea a las otras.
 *
 * Caso especial 422 (NoCicloActivoError): cuando el tenant no tiene ciclo activo Y
 * no hay uno seleccionado, los 4 endpoints devuelven 422 simultáneamente (misma
 * causa raíz). En ese caso se reemplaza el grid completo por UN mensaje amigable en
 * vez de repetirlo 4 veces — el resto de los fallos (red, 500) sí se muestran por
 * sección, porque son eventos independientes y "Reintentar" tiene sentido ahí.
 *
 * V1 es on-screen únicamente. `@media print` (ver globals.css) oculta sidebar y
 * botones, fuerza fondo blanco/texto negro, y refuerza el borde de `.report-card`
 * para separación visual en la impresión del browser (Ctrl+P) — no hay export
 * PDF/XLSX en esta versión.
 *
 * Spec: [SPEC:admin-ui/Pantalla Reportes]; [SPEC:reportes] (todos los requirements)
 * Design: ADR-3 (TenantContext), ADR-4 (servicio de reportes)
 */

import type { ReactNode } from "react";
import { FileBarChart, Inbox } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError } from "@/shared/api/types";
import { useReportes } from "../hooks/use-reportes";
import type {
  TicketsPorUsuarioReporte,
  TipoConTickets,
  EstadoConTickets,
  TiempoResolucionReporte,
} from "../types";

/** True si el error es el 422 de "no hay ciclo activo" (NoCicloActivoError del backend). */
function isNoCicloActivo(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 422;
}

interface ReportQueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
}

interface ReportCardProps<T> {
  testId: string;
  title: string;
  query: ReportQueryLike<T>;
  isEmpty: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

/**
 * ReportCard — shell compartido de las 4 secciones: título + estado
 * (skeleton/error/empty/data). `.report-card` es el hook de estilo para el borde
 * reforzado de impresión (@media print, globals.css).
 */
function ReportCard<T>({ testId, title, query, isEmpty, children }: ReportCardProps<T>) {
  return (
    <section
      data-testid={testId}
      className="report-card space-y-4 rounded-lg border border-slate-200/50 bg-card p-6 backdrop-blur-sm dark:border-white/5"
    >
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>

      {query.isLoading && (
        <div className="space-y-2" data-testid="skeleton">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {!query.isLoading && query.isError && !isNoCicloActivo(query.error) && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">No se pudo cargar este reporte.</p>
          <Button variant="outline" size="sm" onClick={() => query.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {!query.isLoading && !query.isError && query.data !== undefined && (
        isEmpty(query.data) ? (
          <p className="text-sm text-muted-foreground">Sin datos para este ciclo</p>
        ) : (
          children(query.data)
        )
      )}
    </section>
  );
}

export function ReportesPage() {
  const { porUsuario, porTipo, porEstado, tiempoResolucion } = useReportes();

  const queries = [porUsuario, porTipo, porEstado, tiempoResolucion];
  const allSettled = queries.every((q) => !q.isLoading);
  const allNoCicloActivo = allSettled && queries.every((q) => q.isError && isNoCicloActivo(q.error));

  if (allNoCicloActivo) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reportes" />
        <EmptyState
          icon={<Inbox className="h-10 w-10" aria-hidden="true" />}
          title="No hay ciclo activo"
          description="Seleccioná un ciclo para ver los reportes."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Reportes" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportCard
          testId="reporte-por-usuario"
          title="Tickets por usuario"
          query={porUsuario}
          isEmpty={(data: TicketsPorUsuarioReporte) =>
            data.porSolicitante.length === 0 && data.porAsignado.length === 0
          }
        >
          {(data: TicketsPorUsuarioReporte) => (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UsuarioConTicketsList title="Por solicitante" items={data.porSolicitante} />
              <UsuarioConTicketsList title="Por asignado" items={data.porAsignado} />
            </div>
          )}
        </ReportCard>

        <ReportCard
          testId="reporte-por-tipo"
          title="Tickets por tipo"
          query={porTipo}
          isEmpty={(data: TipoConTickets[]) => data.every((t) => t.totalTickets === 0)}
        >
          {(data: TipoConTickets[]) => (
            <ul className="divide-y divide-slate-200/50 dark:divide-white/5">
              {data.map((item) => (
                <li key={item.tipo} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">{item.tipo}</span>
                  <span className="font-medium text-foreground">{item.totalTickets}</span>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        <ReportCard
          testId="reporte-por-estado"
          title="Tickets por estado"
          query={porEstado}
          isEmpty={(data: EstadoConTickets[]) => data.every((e) => e.totalTickets === 0)}
        >
          {(data: EstadoConTickets[]) => (
            <ul className="divide-y divide-slate-200/50 dark:divide-white/5">
              {data.map((item) => (
                <li key={item.estado} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">{item.estado}</span>
                  <span className="font-medium text-foreground">{item.totalTickets}</span>
                </li>
              ))}
            </ul>
          )}
        </ReportCard>

        <ReportCard
          testId="reporte-tiempo-resolucion"
          title="Tiempo de resolución"
          query={tiempoResolucion}
          isEmpty={(data: TiempoResolucionReporte) => data.promedioDias === null}
        >
          {(data: TiempoResolucionReporte) => (
            <div className="flex items-baseline gap-2">
              <FileBarChart className="h-8 w-8 text-primary" aria-hidden="true" />
              <span className="text-3xl font-semibold text-foreground">
                {data.promedioDias?.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
              </span>
              <span className="text-sm text-muted-foreground">
                días promedio · {data.totalResueltos} resueltos
              </span>
            </div>
          )}
        </ReportCard>
      </div>
    </div>
  );
}

/** Lista compacta de usuario + total de tickets (subsección de tickets-por-usuario). */
function UsuarioConTicketsList({
  title,
  items,
}: {
  title: string;
  items: TicketsPorUsuarioReporte["porSolicitante"];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin datos para este ciclo</p>
      ) : (
        <ul className="divide-y divide-slate-200/50 dark:divide-white/5">
          {items.map((item) => (
            <li
              key={`${title}-${item.usuarioId ?? "sin-asignar"}`}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span className="text-foreground">{item.nombre}</span>
              <span className="font-medium text-foreground">{item.totalTickets}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
