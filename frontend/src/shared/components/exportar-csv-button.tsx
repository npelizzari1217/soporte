"use client";

/**
 * ExportarCsvButton — botón genérico que dispara `GET /{recurso}/export` y le
 * entrega el CSV al usuario (sdd/exportar-listados-csv/design, decisión D5).
 * Generaliza `exportar-compras-button.tsx`.
 *
 * `queryString` se recibe ya construida (no filtros crudos): el criterio de
 * qué campos exportar y cómo serializarlos es de cada feature (ADR-2, la URL
 * es la fuente de verdad de los filtros), no de este componente compartido.
 *
 * Sin gate de permiso propio: la ruta de export exige la misma acción de
 * lectura que el listado (`<MODULO>:LECTURA`), así que quien llegó a ver la
 * pantalla ya la tiene. Un `<Can>` acá no protegería nada y quedaría
 * desincronizado el día que cambie el gate del listado.
 */
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExportarCsv } from "@/shared/hooks/use-exportar-csv";

export interface ExportarCsvButtonProps {
  /** Segmento de ruta del recurso (ej. `"compras"`, `"tickets"`). */
  recurso: string;
  /** Nombre de archivo a usar si el backend no manda `Content-Disposition` legible. */
  nombrePorDefecto: string;
  /** Query string ya construida por la feature (sin `?` inicial), o `undefined` si el recurso no tiene filtros exportables. */
  queryString?: string;
  /** Texto del botón (ej. "Exportar a Excel"). */
  etiqueta: string;
}

export function ExportarCsvButton({
  recurso,
  nombrePorDefecto,
  queryString,
  etiqueta,
}: ExportarCsvButtonProps) {
  const exportacion = useExportarCsv({ recurso, nombrePorDefecto, queryString });

  return (
    <Button
      type="button"
      variant="outline"
      isLoading={exportacion.isPending}
      onClick={() => exportacion.mutate()}
    >
      {!exportacion.isPending && <Download className="mr-2 h-4 w-4" aria-hidden />}
      {etiqueta}
    </Button>
  );
}
