"use client";

/**
 * CompraBitacoraSection — bitácora de operaciones de una compra (§4.10,
 * S35-S37, `GET /compras/:id/operaciones`). Append-only, ordenada
 * `created_at ASC` por el backend (`PrismaOperacionCompraRepository.
 * listarPorCompra`) — este componente NO reordena ni agrupa, solo renderiza
 * en el orden recibido.
 *
 * Consume `useOperacionesCompra` (`../hooks/use-operaciones-compra.ts`,
 * PR-25 — PR-23 declaró explícitamente que este hook queda fuera de su
 * alcance).
 */
import { History } from "lucide-react";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { useOperacionesCompra } from "../hooks/use-operaciones-compra";
import type { TipoOperacionCompra } from "../types";

/** Etiquetas legibles del catálogo CERRADO de 10 tipos (espejo de `TIPOS_OPERACION_VALIDOS`). */
const TIPO_OPERACION_LABELS: Record<TipoOperacionCompra, string> = {
  CREACION: "Creación",
  ITEM_AGREGADO: "Ítem agregado",
  ITEM_EDITADO: "Ítem editado",
  ITEM_ELIMINADO: "Ítem eliminado",
  ITEM_APROBADO: "Ítem aprobado",
  ITEM_RECHAZADO: "Ítem rechazado",
  COMPRA_REGISTRADA: "Compra registrada",
  ENTREGA_REGISTRADA: "Entrega registrada",
  ITEM_CERRADO_CON_FALTANTE: "Cerrado con faltante",
  CANCELACION: "Cancelación",
};

/** Fecha corta + hora, mismo formato que `EquipoComponentesSection.formatFecha` (sin util compartido en el repo). */
function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export interface CompraBitacoraSectionProps {
  compraId: string;
}

export function CompraBitacoraSection({ compraId }: CompraBitacoraSectionProps) {
  const operacionesQuery = useOperacionesCompra(compraId);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Bitácora</h2>

      {operacionesQuery.isLoading && <TableSkeleton rows={3} columns={2} />}

      {operacionesQuery.isError && (
        <ErrorState
          message="No se pudo cargar la bitácora."
          onRetry={() => {
            operacionesQuery.refetch().catch(() => {});
          }}
        />
      )}

      {operacionesQuery.data && operacionesQuery.data.length === 0 && (
        <EmptyState
          icon={History}
          title="Sin operaciones"
          description="Todavía no hay movimientos registrados para esta compra."
        />
      )}

      {operacionesQuery.data && operacionesQuery.data.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="compra-bitacora-lista">
          {operacionesQuery.data.map((operacion) => (
            <li
              key={operacion.id}
              className="flex flex-col gap-0.5 border-b border-border pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="font-medium text-foreground">
                {TIPO_OPERACION_LABELS[operacion.tipo]}
              </span>
              <span className="text-muted-foreground">{operacion.detalle}</span>
              <span className="text-xs text-muted-foreground">{formatFecha(operacion.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
