"use client";

/**
 * EquipoBajaBanner — aviso de la ficha de un equipo dado de baja (baja-equipo-completo, R8).
 * Muestra destino, categoría, motivo y fecha de la baja. Solo lectura: la baja es definitiva.
 */
import { formatearInstante } from "@/shared/lib/formato-fecha";
import type { BajaEquipo } from "../types";
import { ETIQUETAS_CATEGORIA_BAJA } from "./equipo-baja-form";

const ETIQUETAS_DESTINO: Record<BajaEquipo["destino"], string> = {
  STOCK_USADO: "Piezas devueltas al stock como usadas",
  DESCARTE: "Piezas descartadas",
};

export interface EquipoBajaBannerProps {
  baja: BajaEquipo | null | undefined;
}

export function EquipoBajaBanner({ baja }: EquipoBajaBannerProps) {
  return (
    <div
      role="status"
      data-testid="equipo-baja-banner"
      className="flex flex-col gap-1 rounded-lg border border-border bg-muted px-4 py-3 text-sm"
    >
      <p className="font-semibold text-foreground">Equipo dado de baja</p>
      {baja ? (
        <ul className="flex flex-col gap-0.5 text-muted-foreground">
          <li>Fecha: {formatearInstante(baja.fecha)}</li>
          <li>Categoría: {ETIQUETAS_CATEGORIA_BAJA[baja.categoria]}</li>
          <li>Destino: {ETIQUETAS_DESTINO[baja.destino]}</li>
          {baja.motivo && <li>Motivo: {baja.motivo}</li>}
        </ul>
      ) : (
        <p className="text-muted-foreground">La ficha es de solo lectura.</p>
      )}
    </div>
  );
}
