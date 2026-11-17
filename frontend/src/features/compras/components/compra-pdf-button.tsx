"use client";

/**
 * CompraPdfButton — "Imprimir PDF" del detalle de una compra: descarga la
 * solicitud de compra con formato de presupuesto
 * (odd/tasks/compra-export-secciones-y-pdf.md, S8).
 *
 * Sin gate de permiso: la ruta exige `COMPRAS:LECTURA`, lo mismo que hace
 * falta para ver este detalle.
 */
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDescargarPdfCompra } from "../hooks/use-descargar-pdf-compra";

export interface CompraPdfButtonProps {
  compraId: string;
  numero: string;
}

/**
 * @param props id y número de la compra.
 * @returns el botón que descarga el PDF.
 */
export function CompraPdfButton({ compraId, numero }: CompraPdfButtonProps) {
  const descarga = useDescargarPdfCompra({ compraId, numero });

  return (
    <Button
      type="button"
      variant="outline"
      isLoading={descarga.isPending}
      onClick={() => descarga.mutate()}
    >
      {!descarga.isPending && <FileText className="mr-2 h-4 w-4" aria-hidden />}
      Imprimir PDF
    </Button>
  );
}
