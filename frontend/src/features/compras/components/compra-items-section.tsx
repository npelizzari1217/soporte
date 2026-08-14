/**
 * CompraItemsSection — tabla de ítems de una compra (`CompraDetalle.items`,
 * spec §1). SOLO LECTURA en PR-25: sin editar/eliminar/aprobar/rechazar —
 * esas mutaciones son PR-26/PR-27 (`use-compra-mutations.ts` NO existe
 * todavía, fuera de alcance declarado).
 *
 * El backend YA filtra los ítems soft-deleted en `CompraDetalleResponseDto`
 * (`toCompraDetalleResponseDto`, `compras.dto.ts`: `.filter((item) =>
 * !item.isDeleted())`) — este componente NO re-filtra ni asume filas
 * adicionales.
 *
 * CERO lógica condicional sobre ítems para derivar estado de cabecera:
 * `comprado`/`entregado` por FILA son campos YA calculados por el backend
 * (`ItemCompraResponseDto.comprado/.entregado`, `itemComprado`/
 * `itemEntregado` de `estado-compra.ts` del dominio) — se muestran tal
 * cual, nunca se recalculan acá.
 */
import { Inbox } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import type { EstadoAprobacionItem, ItemCompra } from "../types";

/**
 * Presentación de `EstadoAprobacionItem` (decisión sobre UN ítem) — mapeo
 * DISTINTO de `ESTADO_COMPRA_CONFIG` (`../estado-compra.ts`, cabecera de la
 * compra). CERO relación entre ambos: un ítem RECHAZADO no implica que la
 * compra esté RECHAZADO (tabla de verdad T1-T5 vive en el backend).
 */
const ESTADO_ITEM_CONFIG: Record<EstadoAprobacionItem, { label: string; variant: BadgeProps["variant"] }> = {
  PENDIENTE: { label: "Pendiente", variant: "secondary" },
  APROBADO: { label: "Aprobado", variant: "success" },
  RECHAZADO: { label: "Rechazado", variant: "destructive" },
};

/** Formato es-AR de moneda + monto, mismo criterio que `formatearTotalesPorMoneda`. */
function formatMonto(moneda: string, monto: number): string {
  return `${moneda} ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface CompraItemsSectionProps {
  items: ItemCompra[];
}

export function CompraItemsSection({ items }: CompraItemsSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Ítems</h2>
      {items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Sin ítems"
          description="Todavía no se agregaron ítems a esta compra."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descripción</TableHead>
              <TableHead>Cantidad</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Comprado</TableHead>
              <TableHead>Entregado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const estadoConfig = ESTADO_ITEM_CONFIG[item.estadoAprobacion];
              return (
                <TableRow key={item.id} data-testid={`item-compra-${item.id}`}>
                  <TableCell>{item.descripcion}</TableCell>
                  <TableCell>{item.cantidad}</TableCell>
                  <TableCell>{item.proveedor}</TableCell>
                  <TableCell>{formatMonto(item.moneda, item.monto)}</TableCell>
                  <TableCell>
                    <Badge variant={estadoConfig.variant}>{estadoConfig.label}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.comprado ? "success" : "outline"}>
                      {item.comprado ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.entregado ? "success" : "outline"}>
                      {item.entregado ? "Sí" : "No"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
