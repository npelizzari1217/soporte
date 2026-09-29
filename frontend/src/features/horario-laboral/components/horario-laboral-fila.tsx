"use client";

/**
 * HorarioLaboralFila — fila PRESENTACIONAL de un día del horario laboral
 * (sdd/horario-laboral-por-cliente, WU-8a). Checkbox "Abierto" + dos
 * `<Input type="time">` (apertura/cierre). Sin hooks propios: valores y
 * callbacks entran por props, `HorarioLaboralForm` (WU-8a) los cablea con
 * RHF vía `watch`/`setValue` — mismo idioma que el `Checkbox` de
 * `prioridad-form-dialog.tsx`, no `register` directo.
 *
 * `esCierre` de `minutos.ts` (D14, design.md) hace que `"00:00"` en CIERRE
 * signifique 1440 (fin del día), nunca 0 — por eso el input de cierre lleva
 * una pista visible en vez de dejar la ambigüedad al usuario.
 */
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface HorarioLaboralFilaProps {
  nombreDia: string;
  abierto: boolean;
  apertura: string;
  cierre: string;
  soloLectura: boolean;
  errorApertura?: string;
  errorCierre?: string;
  onCambiarAbierto: (abierto: boolean) => void;
  onCambiarApertura: (valor: string) => void;
  onCambiarCierre: (valor: string) => void;
}

export function HorarioLaboralFila({
  nombreDia,
  abierto,
  apertura,
  cierre,
  soloLectura,
  errorApertura,
  errorCierre,
  onCambiarAbierto,
  onCambiarApertura,
  onCambiarCierre,
}: HorarioLaboralFilaProps) {
  const idBase = `horario-laboral-${nombreDia.toLowerCase()}`;

  return (
    <div className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <label className="flex w-32 shrink-0 items-center gap-2 pt-2 text-sm font-medium text-foreground">
        <Checkbox
          checked={abierto}
          disabled={soloLectura}
          onCheckedChange={(checked) => onCambiarAbierto(checked === true)}
        />
        {nombreDia}
      </label>

      <div className="flex flex-1 flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-apertura`} className="text-xs text-muted-foreground">
            Apertura
          </label>
          <Input
            id={`${idBase}-apertura`}
            type="time"
            disabled={soloLectura || !abierto}
            error={!!errorApertura}
            value={apertura}
            onChange={(e) => onCambiarApertura(e.target.value)}
          />
          {errorApertura && (
            <p role="alert" className="text-sm text-destructive">
              {errorApertura}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${idBase}-cierre`} className="text-xs text-muted-foreground">
            Cierre <span className="text-muted-foreground">(00:00 = medianoche, fin del día)</span>
          </label>
          <Input
            id={`${idBase}-cierre`}
            type="time"
            disabled={soloLectura || !abierto}
            error={!!errorCierre}
            value={cierre}
            onChange={(e) => onCambiarCierre(e.target.value)}
          />
          {errorCierre && (
            <p role="alert" className="text-sm text-destructive">
              {errorCierre}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
