"use client";

/**
 * AlmanaqueFeriados — vista de almanaque mensual, puramente presentacional
 * (WU1, sdd/feriados-almanaque). Grid de 7 columnas (lunes a domingo) con
 * una marca de color por feriado y un panel de detalle debajo del grid.
 * Sin fetching ni mutaciones acá: recibe los feriados ya combinados
 * (`FeriadoAlmanaqueRow`, mismo shape que `FilaFeriadoCombinada`) y expone
 * slots (`renderAcciones`, `onDiaLibre`) para que la pantalla que lo monte
 * (WU2) decida qué hacer con Editar/Eliminar/Crear.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import {
  NOMBRES_DIA_SEMANA,
  anioMesDeFecha,
  etiquetaMes,
  fechaDeHoy,
  mesAnterior,
  mesSiguiente,
  obtenerSemanasDelMes,
  type AnioMes,
  type DiaAlmanaque,
} from "../almanaque";
import { OrigenFeriadoBadge, type OrigenFeriado } from "./origen-feriado-badge";

/** Fila que consume el almanaque — mismo shape que `FilaFeriadoCombinada`. */
export interface FeriadoAlmanaqueRow {
  id: string;
  fecha: string;
  descripcion: string;
  origen: OrigenFeriado;
}

export interface AlmanaqueFeriadosProps {
  /** Feriados a marcar, de cualquier mes (se filtran por el mes mostrado). */
  feriados: FeriadoAlmanaqueRow[];
  /** `YYYY-MM-DD` de "hoy", inyectable en tests; default `fechaDeHoy()`. Fija el mes inicial. */
  hoy?: string;
  /** Slot de acciones (Editar/Eliminar) del feriado seleccionado, dentro del panel de detalle. */
  renderAcciones?: (feriado: FeriadoAlmanaqueRow) => ReactNode;
  /** Click en un día SIN feriado. Sin esta prop, un día libre no es clickable. */
  onDiaLibre?: (fecha: string) => void;
}

// Reutiliza los tokens de `Badge` (`success-light`/`info`) — mismo criterio
// de color que `OrigenFeriadoBadge`, sin introducir colores nuevos.
// Mismos pares de color que las variantes `success-light` e `info` de Badge
// (texto base sobre fondo claro), con el contraste WCAG ya verificado.
const MARCA_ORIGEN_CLASSNAME: Record<OrigenFeriado, string> = {
  GLOBAL: "bg-success-light text-success",
  CLIENTE: "bg-info-light text-info",
};

function construirAriaLabel(dia: DiaAlmanaque, feriadosDelDia: FeriadoAlmanaqueRow[]): string {
  const fechaLegible = formatearFechaCalendario(dia.fecha);
  if (feriadosDelDia.length === 0) return fechaLegible;
  if (feriadosDelDia.length === 1) return `${fechaLegible}, feriado: ${feriadosDelDia[0]!.descripcion}`;
  // Una fecha puede tener a la vez un feriado GLOBAL y uno CLIENTE (ej. ROOT
  // agrega un feriado nacional en una fecha que el cliente ya tenía propia).
  return `${fechaLegible}, feriados: ${feriadosDelDia.map((feriado) => feriado.descripcion).join(", ")}`;
}

export function AlmanaqueFeriados({ feriados, hoy, renderAcciones, onDiaLibre }: AlmanaqueFeriadosProps) {
  const [mesActual, setMesActual] = useState<AnioMes>(() => anioMesDeFecha(hoy ?? fechaDeHoy()));
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string | null>(null);

  // Todos los feriados de una fecha, no solo el primero: una fecha puede
  // tener a la vez un feriado GLOBAL y uno CLIENTE (ver `construirAriaLabel`).
  const feriadosPorFecha = useMemo(() => {
    const mapa = new Map<string, FeriadoAlmanaqueRow[]>();
    for (const feriado of feriados) {
      const listaExistente = mapa.get(feriado.fecha);
      if (listaExistente) listaExistente.push(feriado);
      else mapa.set(feriado.fecha, [feriado]);
    }
    return mapa;
  }, [feriados]);

  const semanas = useMemo(() => obtenerSemanasDelMes(mesActual.anio, mesActual.mes), [mesActual]);
  const feriadosSeleccionados = fechaSeleccionada ? (feriadosPorFecha.get(fechaSeleccionada) ?? []) : [];

  function cambiarMes(calcular: (actual: AnioMes) => AnioMes): void {
    setMesActual(calcular);
    setFechaSeleccionada(null);
  }

  function manejarClick(dia: DiaAlmanaque, feriadosDelDia: FeriadoAlmanaqueRow[]): void {
    if (feriadosDelDia.length > 0) {
      setFechaSeleccionada(dia.fecha);
      return;
    }
    onDiaLibre?.(dia.fecha);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" aria-label="Mes anterior" onClick={() => cambiarMes(mesAnterior)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="text-sm font-medium text-foreground">{etiquetaMes(mesActual.anio, mesActual.mes)}</p>
        <Button type="button" variant="outline" size="sm" aria-label="Mes siguiente" onClick={() => cambiarMes(mesSiguiente)}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div
        role="grid"
        aria-label={`Almanaque de feriados de ${etiquetaMes(mesActual.anio, mesActual.mes)}`}
        className="overflow-hidden rounded-md border border-border"
      >
        <div role="row" className="grid grid-cols-7 border-b border-border bg-muted">
          {NOMBRES_DIA_SEMANA.map((nombre) => (
            <div key={nombre} role="columnheader" className="px-1 py-1.5 text-center text-xs font-medium text-muted-foreground">
              {nombre}
            </div>
          ))}
        </div>
        {semanas.map((semana) => (
          <div role="row" key={semana[0].fecha} className="grid grid-cols-7">
            {semana.map((dia) => {
              const feriadosDelDia = dia.esDelMesActual ? (feriadosPorFecha.get(dia.fecha) ?? []) : [];
              const esHoy = hoy !== undefined ? dia.fecha === hoy : dia.fecha === fechaDeHoy();
              return (
                <button
                  key={dia.fecha}
                  type="button"
                  role="gridcell"
                  aria-label={construirAriaLabel(dia, feriadosDelDia)}
                  aria-selected={feriadosDelDia.length > 0 && fechaSeleccionada === dia.fecha}
                  onMouseEnter={() => feriadosDelDia.length > 0 && setFechaSeleccionada(dia.fecha)}
                  onFocus={() => feriadosDelDia.length > 0 && setFechaSeleccionada(dia.fecha)}
                  onClick={() => manejarClick(dia, feriadosDelDia)}
                  className={cn(
                    "flex min-h-16 flex-col items-center gap-1 border-b border-r border-border p-1.5 text-sm last:border-r-0",
                    "hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset",
                    !dia.esDelMesActual && "text-muted-foreground opacity-50",
                    esHoy && "bg-accent/60",
                  )}
                >
                  <span className={cn(dia.esFinDeSemana && "font-bold")}>{dia.diaMes}</span>
                  {feriadosDelDia.length > 0 ? (
                    // Mini etiqueta con el nombre recortado. Es `aria-hidden` porque el
                    // `aria-label` del día ya incluye la descripción completa.
                    <span className="flex w-full flex-col gap-0.5">
                      {feriadosDelDia.map((feriado) => (
                        <span
                          key={feriado.id}
                          aria-hidden="true"
                          className={cn(
                            "block w-full truncate rounded px-1 text-left text-[11px] font-medium leading-4",
                            MARCA_ORIGEN_CLASSNAME[feriado.origen],
                          )}
                        >
                          {feriado.descripcion}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-md border border-border p-4" role="region" aria-label="Detalle del día" aria-live="polite">
        {feriadosSeleccionados.length > 0 ? (
          <div className="space-y-4">
            {feriadosSeleccionados.map((feriado) => (
              <div key={feriado.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{formatearFechaCalendario(feriado.fecha)}</p>
                  <OrigenFeriadoBadge origen={feriado.origen} />
                </div>
                <p className="text-sm text-muted-foreground">{feriado.descripcion}</p>
                {renderAcciones ? <div className="flex items-center gap-2">{renderAcciones(feriado)}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Pasá el mouse o seleccioná un día con feriado para ver el detalle.</p>
        )}
      </div>
    </div>
  );
}
