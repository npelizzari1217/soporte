"use client";

/**
 * CondicionStockSelector — selector PRESENTACIONAL de la condición del stock
 * (nuevo o usado). No decide nada: recibe el estado ya resuelto por
 * `useSelectorCondicion` y lo dibuja. Lo reutilizan los diálogos de movimiento
 * de insumos y el alta de componentes (equipos).
 */
import { Select } from "@/components/ui/select";
import type { SelectorCondicion } from "../hooks/use-selector-condicion";
import { CONDICIONES_STOCK, type CondicionStock } from "../types";

const ETIQUETA_CONDICION: Record<CondicionStock, string> = {
  NUEVO: "Nuevo",
  USADO: "Usado",
};

export interface CondicionStockSelectorProps {
  /** `id` del `<select>`, para que no choque con otro diálogo de la página. */
  id: string;
  selector: SelectorCondicion;
}

/**
 * @returns El campo "Condición", o `null` cuando el insumo no admite usado.
 */
export function CondicionStockSelector({ id, selector }: CondicionStockSelectorProps) {
  if (!selector.visible) return null;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Condición
      </label>
      <Select
        id={id}
        value={selector.valor}
        disabled={selector.fijo}
        onChange={(event) => selector.onChange(event.target.value as CondicionStock)}
      >
        {CONDICIONES_STOCK.map((condicion) => (
          <option key={condicion} value={condicion}>
            {ETIQUETA_CONDICION[condicion]}
          </option>
        ))}
      </Select>
      {selector.fijo && (
        <p className="text-xs text-muted-foreground">Solo hay saldo en esta condición.</p>
      )}
    </div>
  );
}
