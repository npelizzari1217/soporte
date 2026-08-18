/**
 * CompraItemsSection — tabla de ítems de una compra (`CompraDetalle.items`,
 * spec §1).
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
 *
 * Columna "Acciones" (cierre del hueco de wiring, PR-26/PR-27 dejaron las 7
 * piezas AUTÓNOMAS; gates migrados a la matriz en WU-7.6): cablea
 * `ItemEditDialog`/`RegistrarCompraDialog`/`RegistrarEntregaDialog`/
 * `ItemCerrarFaltanteDialog` detrás de `<Can permiso="COMPRAS:MODIFICACION">`,
 * `ItemEliminarControl` detrás de `<Can permiso="COMPRAS:BORRADO">`, y
 * `ItemDecisionActions` (aprobar/rechazar) detrás de
 * `<Can permiso="COMPRAS:APROBACION">` — mismo patrón de MÚLTIPLES `<Can>`
 * en una sola celda que `usuarios-admin-view.tsx` (permisos independientes,
 * un `<Can>` por acción). Cada pieza es PRESENTACIONAL y ya trae su propio
 * gate de estado (S7/S10/S16/S20/S25), este archivo solo decide QUIÉN la ve.
 */
import { Inbox } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { Can } from "@/components/shared/can";
import { ItemEditDialog } from "./item-edit-dialog";
import { ItemEliminarControl } from "./item-eliminar-control";
import { ItemDecisionActions } from "./item-decision-actions";
import {
  RegistrarOrdenDialog,
  RegistrarRecepcionDialog,
  RegistrarEntregaDialog,
} from "./registrar-avance-dialog";
import { ItemCerrarFaltanteDialog } from "./item-cerrar-faltante-dialog";
import type { EstadoAprobacionItem, ItemCompra } from "../types";
import { aFechaInput } from "../lib/fecha";
import { formatearMontoConMoneda } from "../lib/formato-numero";

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

/** "YYYY-MM-DD" desde un ISO string del backend, con guion cuando la etapa todavía no se registró. */
function formatFecha(fechaISO: string | null): string {
  return fechaISO ? aFechaInput(fechaISO) : "—";
}

export interface CompraItemsSectionProps {
  compraId: string;
  items: ItemCompra[];
}

export function CompraItemsSection({ compraId, items }: CompraItemsSectionProps) {
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
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fechas (orden / recepción / entrega)</TableHead>
              <TableHead>Comprado</TableHead>
              <TableHead>Entregado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
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
                  <TableCell>{formatearMontoConMoneda(item.moneda, item.monto)}</TableCell>
                  <TableCell>{formatearMontoConMoneda(item.moneda, item.totalItem)}</TableCell>
                  <TableCell>
                    <Badge variant={estadoConfig.variant}>{estadoConfig.label}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div>Orden: {formatFecha(item.fechaOrden)}</div>
                    <div>Recepción: {formatFecha(item.fechaRecepcion)}</div>
                    <div>Entrega: {formatFecha(item.fechaEntrega)}</div>
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
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <Can permiso="COMPRAS:APROBACION">
                        <ItemDecisionActions compraId={compraId} item={item} />
                      </Can>
                      <Can permiso="COMPRAS:MODIFICACION">
                        <>
                          <RegistrarOrdenDialog compraId={compraId} item={item} />
                          <RegistrarRecepcionDialog compraId={compraId} item={item} />
                          <RegistrarEntregaDialog compraId={compraId} item={item} />
                          <ItemCerrarFaltanteDialog compraId={compraId} item={item} />
                          <ItemEditDialog compraId={compraId} item={item} />
                        </>
                      </Can>
                      <Can permiso="COMPRAS:BORRADO">
                        <ItemEliminarControl compraId={compraId} item={item} />
                      </Can>
                    </div>
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
