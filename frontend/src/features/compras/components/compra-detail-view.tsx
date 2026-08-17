"use client";

/**
 * CompraDetailView — CONTAINER montado por `/compras/[id]` (PR-25,
 * sdd/redisenio-modulo-compras). Reemplaza el placeholder "Módulo en
 * reconstrucción" de PR-1 con el detalle real: cabecera + tabla de ítems +
 * bitácora, sobre el dominio nuevo `Compra`/`ItemCompra`/`OperacionCompra`.
 *
 * RBAC (decisión del maintainer, `sdd/redisenio-modulo-compras/
 * rbac-consultas`, 2026-08-14): la LECTURA se gatea SOLO por módulo
 * (COMPRAS, resuelto aguas arriba por el guard de navegación/layout) — la
 * vista en sí NO está envuelta en `<Can permiso=...>`, mismo criterio que
 * `ComprasListView` (PR-24). `ComprasController.obtener()`/
 * `.listarOperaciones()` no declaran `@RequirePermissions`.
 *
 * Las ACCIONES DE ESCRITURA sí van gateadas por acción (WU-7.6,
 * `sdd/matriz-permisos-por-usuario`): `CompraEditDialog`
 * (`COMPRAS:MODIFICACION`)/`ItemCreateDialog` (`COMPRAS:ALTAS`)/
 * `CompraCancelarDialog` (`COMPRAS:BORRADO`) en el toolbar del header; la
 * columna de acciones por ítem vive en `CompraItemsSection`
 * (`COMPRAS:MODIFICACION`/`COMPRAS:BORRADO`/`COMPRAS:APROBACION`, un `<Can>`
 * por acción).
 *
 * CERO lógica condicional sobre ítems para derivar estado: `estado`/
 * `comprado`/`cerrado`/`totalesPorMoneda` llegan YA DERIVADOS del backend
 * (ADR-C1, `derivarEstadoCompra`) — este archivo solo los muestra.
 */
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Badge } from "@/components/ui/badge";
import { useCompra } from "../hooks/use-compras";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { formatearTotalesPorMoneda } from "../lib/formatear-totales";
import { EstadoCompraBadge } from "./estado-compra-badge";
import { CompraItemsSection } from "./compra-items-section";
import { CompraBitacoraSection } from "./compra-bitacora-section";
import { ItemCreateDialog } from "./item-create-dialog";
import { CompraEditDialog } from "./compra-edit-dialog";
import { CompraCancelarDialog } from "./compra-cancelar-dialog";

export interface CompraDetailViewProps {
  compraId: string;
}

export function CompraDetailView({ compraId }: CompraDetailViewProps) {
  const compraQuery = useCompra(compraId);
  const sectoresQuery = useSectores();

  if (compraQuery.isLoading) return <DetailSkeleton />;

  // Cubre tanto el error de red/HTTP (incluida la compra no encontrada, 404)
  // como la respuesta vacía — mismo criterio que `EquipoDetailView`.
  if (compraQuery.isError || !compraQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar la compra."
        onRetry={() => {
          compraQuery.refetch().catch(() => {});
        }}
      />
    );
  }

  const compra = compraQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={compra.numero}
        description={compra.motivo}
        actions={
          <div className="flex items-center gap-2">
            <Can permiso="COMPRAS:MODIFICACION">
              <CompraEditDialog compra={compra} />
            </Can>
            <Can permiso="COMPRAS:ALTAS">
              <ItemCreateDialog compraId={compra.id} />
            </Can>
            <Can permiso="COMPRAS:BORRADO">
              <CompraCancelarDialog compra={compra} />
            </Can>
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-4 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Estado</span>
          <EstadoCompraBadge estado={compra.estado} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Fecha de solicitud</span>
          {/* Fecha cruda ("YYYY-MM-DD"), mismo criterio que `compras-list-view.tsx`
              (`ciclo-row.tsx`): reformatear con `new Date()` puede mostrar el día
              anterior por timezone. */}
          <span className="text-sm text-foreground">{compra.fechaSolicitud}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Progreso</span>
          <div className="flex gap-1">
            <Badge variant={compra.comprado ? "success" : "outline"}>Comprado</Badge>
            <Badge variant={compra.cerrado ? "success" : "outline"}>Cerrado</Badge>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Totales por moneda</span>
          <span className="text-sm text-foreground">
            {formatearTotalesPorMoneda(compra.totalesPorMoneda)}
          </span>
        </div>
        {/* WU-27 (R11): sector de destino, si se asignó al crear la compra (S66/S67). */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Sector</span>
          <span className="text-sm text-foreground">
            {compra.sectorId
              ? (sectoresQuery.data?.find((s) => s.id === compra.sectorId)?.nombre ?? "—")
              : "Sin asignar"}
          </span>
        </div>
      </section>

      {compra.descripcion && <p className="text-sm text-muted-foreground">{compra.descripcion}</p>}

      {/* Regla 0 de la tabla de verdad (spec §2): `canceladaEn != null` prima sobre
          todo lo demás. El backend YA resolvió `estado: "CANCELADO"` — este bloque
          es SOLO el detalle informativo del motivo, no una re-derivación. */}
      {compra.canceladaEn && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          Compra cancelada el {compra.canceladaEn}
          {compra.motivoCancelacion ? `: ${compra.motivoCancelacion}` : ""}
        </div>
      )}

      <CompraItemsSection compraId={compra.id} items={compra.items} />
      <CompraBitacoraSection compraId={compra.id} />
    </div>
  );
}
