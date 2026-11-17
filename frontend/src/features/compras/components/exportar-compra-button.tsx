"use client";

/**
 * ExportarCompraButton — descarga UNA compra en Excel o CSV, una fila por
 * ítem, vía `GET /compras/:id/export` (odd/tasks/export-compra-individual.md, S6).
 *
 * Sin gate de permiso: la ruta exige `COMPRAS:LECTURA`, lo mismo que hace
 * falta para ver este detalle. La descarga la resuelve el botón compartido.
 */
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";

export interface ExportarCompraButtonProps {
  /** Id de la compra a exportar. */
  compraId: string;
}

/**
 * @param props id de la compra.
 * @returns el botón "Exportar" con el menú Excel/CSV.
 */
export function ExportarCompraButton({ compraId }: ExportarCompraButtonProps) {
  return (
    <ExportarCsvButton
      recurso={`compras/${encodeURIComponent(compraId)}`}
      nombrePorDefecto="compra.csv"
    />
  );
}
