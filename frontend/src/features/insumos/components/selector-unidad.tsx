"use client";

/**
 * SelectorUnidad — elige la pieza de un insumo `SERIE` por su número de serie
 * en una salida o un ajuste negativo. Presentacional: la lista y la elección
 * viven en `useSeleccionUnidad`. La cantidad de estos movimientos es siempre 1.
 */
import { Select } from "@/components/ui/select";
import type { SeleccionUnidad } from "../hooks/use-seleccion-unidad";

const SERIE_PENDIENTE = "Serie pendiente";

export interface SelectorUnidadProps {
  /** `id` del `<select>`, para que no choque entre diálogos. */
  id: string;
  seleccion: SeleccionUnidad;
  /** Aclaración de lo que le pasa a la pieza elegida. */
  nota: string;
}

/** @returns El selector de pieza, con su aviso si no hay ninguna para elegir. */
export function SelectorUnidad({ id, seleccion, nota }: SelectorUnidadProps) {
  const { unidades, cargando, fallo, unidadId, error, elegir } = seleccion;
  const sinPiezas = !cargando && !fallo && unidades?.length === 0;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Pieza (por número de serie)
      </label>
      <Select
        id={id}
        value={unidadId}
        error={!!error}
        disabled={cargando || fallo || sinPiezas}
        onChange={(event) => elegir(event.target.value)}
      >
        <option value="">{cargando ? "Cargando piezas..." : "Elegí una pieza"}</option>
        {(unidades ?? []).map((unidad) => (
          <option key={unidad.id} value={unidad.id}>
            {`${unidad.numeroSerie ?? SERIE_PENDIENTE} (${unidad.condicion === "USADO" ? "Usado" : "Nuevo"})`}
          </option>
        ))}
      </Select>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {fallo && (
        <p role="alert" className="text-sm text-destructive">
          No se pudieron cargar las piezas.
        </p>
      )}
      {sinPiezas && <p className="text-sm text-muted-foreground">No hay piezas para elegir.</p>}
      <p className="text-xs text-muted-foreground">{`La cantidad es 1. ${nota}`}</p>
    </div>
  );
}
