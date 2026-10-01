"use client";

/**
 * UnidadesInsumoSection — la sección "Unidades" de la ficha de un insumo con
 * seguimiento por número de serie: una fila por pieza, con su serial (o "Serie
 * pendiente"), su condición, su estado y el equipo donde está.
 *
 * Solo la monta la ficha cuando `seguimiento = SERIE`; un insumo por cantidad
 * no tiene unidades y la sección no existe para él.
 *
 * **El filtro por estado es del cliente.** La query trae todas las unidades
 * (ver `useUnidadesInsumo`) y el contador de pendientes se calcula sobre ese
 * universo: una pieza pendiente es una `EN_DEPOSITO` sin serial, la misma
 * definición que `pendientesDeSerie` del stock. Filtrar por "Instalada" no
 * esconde que quedan piezas sin serial en el depósito.
 */
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { notifyError } from "@/shared/lib/toast";
import { useUnidadesInsumo } from "../hooks/use-unidades-insumo";
import { UnidadHistorialDialog } from "./unidad-historial-dialog";
import { ESTADOS_UNIDAD_INSUMO } from "../types";
import type { CondicionStock, EstadoUnidadInsumo, UnidadInsumo } from "../types";

const SIN_VALOR = "—";
const SERIE_PENDIENTE = "Serie pendiente";
const TODOS_LOS_ESTADOS = "TODOS";

/** Cómo se lee cada estado de una unidad; el `Record` obliga a cubrir uno nuevo. */
export const ETIQUETA_ESTADO_UNIDAD: Record<EstadoUnidadInsumo, string> = {
  EN_DEPOSITO: "En depósito",
  INSTALADA: "Instalada",
  ENTREGADA: "Entregada",
  DESCARTADA: "Descartada",
};

const VARIANTE_ESTADO_UNIDAD: Record<
  EstadoUnidadInsumo,
  "success" | "default" | "outline" | "destructive"
> = {
  EN_DEPOSITO: "success",
  INSTALADA: "default",
  ENTREGADA: "outline",
  DESCARTADA: "destructive",
};

const ETIQUETA_CONDICION: Record<CondicionStock, string> = {
  NUEVO: "Nuevo",
  USADO: "Usado",
};

export interface UnidadesInsumoSectionProps {
  insumoId: string;
}

/**
 * @param insumoId Insumo `SERIE` cuyas unidades se listan.
 * @returns El bloque de unidades con filtro por estado y contador de pendientes.
 */
export function UnidadesInsumoSection({ insumoId }: UnidadesInsumoSectionProps) {
  const [estado, setEstado] = useState<EstadoUnidadInsumo | typeof TODOS_LOS_ESTADOS>(
    TODOS_LOS_ESTADOS,
  );
  const [conHistorial, setConHistorial] = useState<UnidadInsumo | null>(null);
  const query = useUnidadesInsumo(insumoId);

  const todas = query.data;
  const pendientes = (todas ?? []).filter(
    (u) => u.estado === "EN_DEPOSITO" && u.numeroSerie === null,
  ).length;
  const visibles = (todas ?? []).filter((u) => estado === TODOS_LOS_ESTADOS || u.estado === estado);

  const columnas: Column<UnidadInsumo>[] = [
    {
      key: "numeroSerie",
      header: "Número de serie",
      render: (fila) =>
        fila.numeroSerie ?? <span className="text-muted-foreground">{SERIE_PENDIENTE}</span>,
    },
    { key: "condicion", header: "Condición", render: (fila) => ETIQUETA_CONDICION[fila.condicion] },
    {
      key: "estado",
      header: "Estado",
      render: (fila) => (
        <Badge variant={VARIANTE_ESTADO_UNIDAD[fila.estado]}>{ETIQUETA_ESTADO_UNIDAD[fila.estado]}</Badge>
      ),
    },
    // El guion es correcto: solo una unidad INSTALADA tiene equipo.
    { key: "equipoNombre", header: "Equipo", render: (fila) => fila.equipoNombre ?? SIN_VALOR },
    {
      key: "id",
      header: "",
      render: (fila) => (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Ver historial de ${fila.numeroSerie ?? SERIE_PENDIENTE.toLowerCase()}`}
          onClick={() => setConHistorial(fila)}
        >
          Historial
        </Button>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-foreground">Unidades</h2>
          {pendientes > 0 && (
            <Badge variant="outline">
              {pendientes === 1 ? "1 serie pendiente" : `${pendientes} series pendientes`}
            </Badge>
          )}
        </div>
        <div className="w-48">
          <Select
            aria-label="Filtrar por estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as EstadoUnidadInsumo | typeof TODOS_LOS_ESTADOS)}
          >
            <option value={TODOS_LOS_ESTADOS}>Todos los estados</option>
            {ESTADOS_UNIDAD_INSUMO.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESTADO_UNIDAD[e]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <DataTable
        columns={columnas}
        data={visibles}
        getRowKey={(fila) => fila.id}
        isLoading={query.isLoading}
        error={query.isError ? "No se pudieron cargar las unidades." : undefined}
        onRetry={() => query.refetch().catch(notifyError)}
        emptyTitle="Sin unidades"
        emptyDescription={
          estado === TODOS_LOS_ESTADOS
            ? "Todavía no hay unidades registradas para este insumo."
            : "No hay unidades en ese estado."
        }
      />
      <UnidadHistorialDialog
        insumoId={insumoId}
        unidad={conHistorial}
        onClose={() => setConHistorial(null)}
      />
    </section>
  );
}
