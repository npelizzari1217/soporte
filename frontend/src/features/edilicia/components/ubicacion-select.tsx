"use client";

/**
 * UbicacionSelect — selector de ubicaciones JERÁRQUICAS (T5.7/T5.8). Las
 * ubicaciones forman un árbol vía `padreId` (raíz o hija) — se aplana en
 * orden de profundidad con indentación (" — ") para representar el árbol
 * en un `<select>` nativo simple (mismo criterio que B1 con `Select`: sin
 * necesidad de un tree-select con typeahead para el volumen esperado).
 */
import { forwardRef } from "react";
import { Select, type SelectProps } from "@/components/ui/select";
import type { Ubicacion } from "../types";

function ordenarPorArbol(ubicaciones: Ubicacion[]): (Ubicacion & { profundidad: number })[] {
  const porPadre = new Map<string | null, Ubicacion[]>();
  for (const u of ubicaciones) {
    const lista = porPadre.get(u.padreId) ?? [];
    lista.push(u);
    porPadre.set(u.padreId, lista);
  }
  const resultado: (Ubicacion & { profundidad: number })[] = [];
  function visitar(padreId: string | null, profundidad: number) {
    for (const u of porPadre.get(padreId) ?? []) {
      resultado.push({ ...u, profundidad });
      visitar(u.id, profundidad + 1);
    }
  }
  visitar(null, 0);
  return resultado;
}

export interface UbicacionSelectProps extends Omit<SelectProps, "children"> {
  ubicaciones: Ubicacion[];
  soloActivas?: boolean;
  /** Ítem vacío ("Sin padre (raíz)"): usado por `UbicacionFormDialog` para `padreId` opcional. */
  emptyLabel?: string;
}

export const UbicacionSelect = forwardRef<HTMLSelectElement, UbicacionSelectProps>(
  ({ ubicaciones, soloActivas = true, emptyLabel, ...props }, ref) => {
    const visibles = soloActivas ? ubicaciones.filter((u) => u.activo) : ubicaciones;
    const arbol = ordenarPorArbol(visibles);

    return (
      <Select ref={ref} defaultValue="" {...props}>
        <option value="" disabled={!emptyLabel}>
          {emptyLabel ?? "Elegí una ubicación"}
        </option>
        {arbol.map((u) => (
          <option key={u.id} value={u.id}>
            {"— ".repeat(u.profundidad)}
            {u.nombre}
          </option>
        ))}
      </Select>
    );
  },
);
UbicacionSelect.displayName = "UbicacionSelect";
