"use client";

/**
 * StarRating — PRESENTATIONAL, atómico. 5 radios NATIVOS (`type="radio"`),
 * visualmente reemplazados por un ícono de estrella pero SIN perder ninguna
 * semántica del elemento: navegación por teclado (flechas dentro del grupo,
 * Tab entra/sale del grupo entero) y nombre accesible por opción vienen
 * gratis del navegador — no se reimplementa un `role="radiogroup"` a mano.
 *
 * Requisito explícito de la encuesta pública: el respondiente NUNCA tiene
 * sesión y probablemente responde desde el teléfono, sin conocer el sistema.
 *
 * Ref spec: sdd/csat/spec. Tarea: 8.2.
 */
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

const PUNTAJES = [1, 2, 3, 4, 5] as const;

export interface StarRatingProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  name?: string;
}

export function StarRating({ value, onChange, disabled = false, name = "puntaje" }: StarRatingProps) {
  return (
    <div role="group" aria-label="Puntaje de 1 a 5 estrellas" className="flex gap-1">
      {PUNTAJES.map((puntaje) => (
        <label key={puntaje} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={puntaje}
            checked={value === puntaje}
            onChange={() => onChange(puntaje)}
            disabled={disabled}
            aria-label={`${puntaje} de 5 estrellas`}
            className="peer sr-only"
          />
          <Star
            aria-hidden="true"
            className={cn(
              "h-9 w-9 rounded transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
              value !== null && puntaje <= value
                ? "fill-primary text-primary"
                : "text-muted-foreground hover:text-primary/70",
            )}
          />
        </label>
      ))}
    </div>
  );
}
