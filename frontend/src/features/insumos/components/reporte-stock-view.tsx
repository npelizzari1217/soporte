"use client";

/**
 * ReporteStockView — pantalla `/insumos/reporte-stock` (reporte-stock-insumos).
 *
 * Foto del stock actual, una fila por insumo. Los filtros viven en la URL
 * (deep-link y recarga los conservan) y se parsean/serializan con
 * `lib/filtros-reporte-stock`: el MISMO query string alimenta la consulta
 * (`useReporteStock`) y el menú "Exportar", así que el CSV y la
 * pantalla no pueden contar distinto.
 *
 * Sin valorizar: el insumo no tiene costo, así que no hay ninguna columna de
 * dinero. Un saldo negativo se resalta pero la fila nunca se oculta; el
 * `generadoEn` del backend se muestra tal cual, es el instante de la foto.
 *
 * El gate `<Can permiso="INSUMOS:LECTURA">` lo pone la página; el endpoint
 * exige el mismo permiso, que es la autoridad real.
 */
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useReporteStock } from "../hooks/use-reporte-stock";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import {
  parsearFiltrosReporteStock,
  serializarFiltrosReporteStock,
  type FiltrosReporteStock,
} from "../lib/filtros-reporte-stock";
import { formatearCantidadEsAr } from "../lib/formato-cantidad";
import { ETIQUETA_REPOSICION, VARIANTE_REPOSICION } from "../lib/reposicion";
import type { FilaReporteStock } from "../types";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { cn } from "@/lib/utils";

const SIN_VALOR = "—";

/**
 * Fila plana para la tabla: `DataTable` usa `key` como clave de columna, y
 * varias columnas salen del mismo campo anidado de la fila del backend.
 */
interface FilaTabla {
  insumoId: string;
  codigo: string;
  nombre: string;
  familia: string;
  tipo: string;
  unidad: string;
  entera: boolean;
  nuevo: number;
  usado: number;
  total: number;
  puntoReposicion: number | null;
  estadoReposicion: FilaReporteStock["estadoReposicion"];
  activo: boolean;
}

function aFilaTabla(fila: FilaReporteStock): FilaTabla {
  return {
    insumoId: fila.insumoId,
    codigo: fila.codigo,
    nombre: fila.nombre,
    familia: fila.familia.nombre,
    tipo: fila.familia.esRepuesto ? "Repuesto" : "Consumible",
    unidad: fila.unidadMedida.nombre,
    entera: fila.unidadMedida.entera,
    nuevo: fila.saldos.NUEVO,
    usado: fila.saldos.USADO,
    total: fila.saldos.total,
    puntoReposicion: fila.stockMinimo,
    estadoReposicion: fila.estadoReposicion,
    activo: fila.activo,
  };
}

/** Cantidad con coma decimal; un saldo negativo se pinta `text-destructive` (R8). */
function Cantidad({ valor, entera }: { valor: number; entera: boolean }) {
  return (
    <span className={cn(valor < 0 && "font-medium text-destructive")}>
      {formatearCantidadEsAr(valor, entera)}
    </span>
  );
}

const COLUMNAS: Column<FilaTabla>[] = [
  { key: "codigo", header: "Código" },
  { key: "nombre", header: "Nombre" },
  { key: "familia", header: "Familia" },
  { key: "tipo", header: "Tipo" },
  { key: "unidad", header: "Unidad de medida" },
  { key: "nuevo", header: "Stock nuevo", render: (r) => <Cantidad valor={r.nuevo} entera={r.entera} /> },
  { key: "usado", header: "Stock usado", render: (r) => <Cantidad valor={r.usado} entera={r.entera} /> },
  { key: "total", header: "Stock total", render: (r) => <Cantidad valor={r.total} entera={r.entera} /> },
  {
    key: "puntoReposicion",
    header: "Punto de reposición",
    render: (r) => (r.puntoReposicion === null ? SIN_VALOR : formatearCantidadEsAr(r.puntoReposicion, r.entera)),
  },
  {
    key: "estadoReposicion",
    header: "Estado de reposición",
    render: (r) => (
      <Badge variant={VARIANTE_REPOSICION[r.estadoReposicion]}>{ETIQUETA_REPOSICION[r.estadoReposicion]}</Badge>
    ),
  },
  {
    key: "activo",
    header: "Estado",
    render: (r) =>
      r.activo ? <Badge variant="success">Habilitado</Badge> : <Badge variant="outline">Deshabilitado</Badge>,
  },
];

/** @returns El reporte de stock con filtros en la URL y exportación. */
export function ReporteStockView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtros = useMemo(() => parsearFiltrosReporteStock(searchParams), [searchParams]);
  const queryString = serializarFiltrosReporteStock(filtros);

  const reporteQuery = useReporteStock(filtros);
  const familiasQuery = useFamiliasInsumo();

  const aplicar = (patch: Partial<FiltrosReporteStock>) => {
    const qs = serializarFiltrosReporteStock({ ...filtros, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const filas = useMemo(() => (reporteQuery.data?.filas ?? []).map(aFilaTabla), [reporteQuery.data]);

  const tipoActual = filtros.esRepuesto === undefined ? "" : String(filtros.esRepuesto);
  const hayFiltrosActivos = queryString !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reporte de stock"
        description={
          reporteQuery.data
            ? `Generado el ${formatearInstante(reporteQuery.data.generadoEn)}`
            : "Foto del stock actual de insumos y repuestos"
        }
        actions={
          <ExportarCsvButton
            recurso="insumos/reporte-stock"
            nombrePorDefecto="reporte-stock-insumos.csv"
            queryString={queryString}
          />
        }
      />

      <FilterBar>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-familia" className="sr-only">
            Familia
          </label>
          <Select
            id="filtro-familia"
            value={filtros.familiaId ?? ""}
            onChange={(e) => aplicar({ familiaId: e.target.value || undefined })}
          >
            <option value="">Todas las familias</option>
            {(familiasQuery.data ?? []).map((familia) => (
              <option key={familia.id} value={familia.id}>
                {familia.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-tipo" className="sr-only">
            Tipo
          </label>
          <Select
            id="filtro-tipo"
            value={tipoActual}
            onChange={(e) => aplicar({ esRepuesto: e.target.value === "" ? undefined : e.target.value === "true" })}
          >
            <option value="">Consumibles y repuestos</option>
            <option value="false">Solo consumibles</option>
            <option value="true">Solo repuestos</option>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filtros.soloBajoMinimo === true}
            onChange={(e) => aplicar({ soloBajoMinimo: e.target.checked || undefined })}
          />
          Solo bajo mínimo
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filtros.ocultarSinStock === true}
            onChange={(e) => aplicar({ ocultarSinStock: e.target.checked || undefined })}
          />
          Ocultar sin stock
        </label>
      </FilterBar>

      <DataTable
        columns={COLUMNAS}
        data={filas}
        getRowKey={(row) => row.insumoId}
        isLoading={reporteQuery.isLoading}
        error={reporteQuery.isError ? "No se pudo cargar el reporte de stock." : undefined}
        onRetry={() => reporteQuery.refetch().catch(notifyError)}
        emptyTitle="Sin insumos"
        emptyDescription="Todavía no hay insumos cargados en el catálogo."
        hayFiltrosActivos={hayFiltrosActivos}
        onLimpiarFiltros={() => router.replace(pathname)}
      />
    </div>
  );
}
