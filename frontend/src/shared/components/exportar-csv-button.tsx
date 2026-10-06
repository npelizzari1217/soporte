"use client";

/**
 * ExportarCsvButton — menú "Exportar ▾" genérico: dispara
 * `GET /{recurso}/export` y le entrega al usuario el listado en **Excel**
 * (opción por defecto, primera del menú) o en **CSV** (sdd/exportar-listados-csv,
 * decisión D5; Excel agregado en la segunda etapa, punto 3). Generaliza
 * `exportar-compras-button.tsx`. El nombre del archivo no cambió para no
 * mover a todos los llamadores.
 *
 * `queryString` se recibe ya construida (no filtros crudos): el criterio de
 * qué campos exportar y cómo serializarlos es de cada feature (ADR-2, la URL
 * es la fuente de verdad de los filtros), no de este componente compartido.
 * Los DOS formatos mandan los mismos filtros.
 *
 * Sin gate de permiso propio: la ruta de export exige la misma acción de
 * lectura que el listado (`<MODULO>:LECTURA`), así que quien llegó a ver la
 * pantalla ya la tiene. Un `<Can>` acá no protegería nada y quedaría
 * desincronizado el día que cambie el gate del listado.
 */
import { ChevronDown, Download } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { useExportarCsv, type FormatoExportacion } from "@/shared/hooks/use-exportar-csv";

export interface ExportarCsvButtonProps {
  /** Segmento de ruta del recurso (ej. `"compras"`, `"tickets"`). */
  recurso: string;
  /** Nombre de archivo (`.csv`) a usar si el backend no manda `Content-Disposition` legible. */
  nombrePorDefecto: string;
  /** Query string ya construida por la feature (sin `?` inicial), o `undefined` si el recurso no tiene filtros exportables. */
  queryString?: string;
  /** Texto del botón del menú; por defecto "Exportar". */
  etiqueta?: string;
}

const OPCIONES: ReadonlyArray<{ formato: FormatoExportacion; texto: string }> = [
  { formato: "xlsx", texto: "Excel" },
  { formato: "csv", texto: "CSV" },
];

export function ExportarCsvButton({
  recurso,
  nombrePorDefecto,
  queryString,
  etiqueta = "Exportar",
}: ExportarCsvButtonProps) {
  const exportacion = useExportarCsv({ recurso, nombrePorDefecto, queryString });

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="outline" isLoading={exportacion.isPending}>
          {!exportacion.isPending && <Download className="mr-2 h-4 w-4" aria-hidden />}
          {etiqueta}
          {!exportacion.isPending && <ChevronDown className="ml-2 h-4 w-4" aria-hidden />}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-50 min-w-32 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {OPCIONES.map(({ formato, texto }) => (
            <DropdownMenu.Item
              key={formato}
              className="cursor-pointer rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              onSelect={() => exportacion.mutate(formato)}
            >
              {texto}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
