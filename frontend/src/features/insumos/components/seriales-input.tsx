"use client";

/**
 * SerialesInput — una casilla de número de serie por cada pieza de una entrada
 * o un ajuste positivo de un insumo `SERIE`. Presentacional: el estado y la
 * validación viven en `useSerialesMovimiento`.
 */
import { Input } from "@/components/ui/input";
import { SERIALES_MAX } from "../schemas";

export interface SerialesInputProps {
  /** Prefijo de los `id` de las casillas, para que no choquen entre diálogos. */
  id: string;
  /** Cantidad de casillas; `null` si la cantidad tipeada no sirve (no entera o fuera de rango). */
  cantidad: number | null;
  valores: readonly string[];
  errores: readonly (string | undefined)[];
  onChange: (indice: number, valor: string) => void;
}

/** @returns Las casillas de seriales, o un aviso si la cantidad no admite seriales. */
export function SerialesInput({ id, cantidad, valores, errores, onChange }: SerialesInputProps) {
  if (cantidad === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Este insumo se lleva por serie: la cantidad tiene que ser un número entero de 1 a {SERIALES_MAX}.
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">Números de serie</legend>
      {Array.from({ length: cantidad }, (_, indice) => (
        <div key={indice} className="flex flex-col gap-1">
          <label htmlFor={`${id}-${indice}`} className="text-xs text-muted-foreground">
            {`Número de serie de la pieza ${indice + 1}`}
          </label>
          <Input
            id={`${id}-${indice}`}
            value={valores[indice] ?? ""}
            error={!!errores[indice]}
            onChange={(event) => onChange(indice, event.target.value)}
          />
          {errores[indice] && (
            <p role="alert" className="text-sm text-destructive">
              {errores[indice]}
            </p>
          )}
        </div>
      ))}
    </fieldset>
  );
}
