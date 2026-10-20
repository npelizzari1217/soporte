"use client";

/**
 * WebhookEntregasTable — CONTAINER del registro de entregas del webhook
 * (webhooks, T7 / CA4): evento, ticket, estado, intentos, último resultado y
 * fechas, paginado en el servidor, la más nueva primero. La página vive en
 * estado local: es una sección dentro de la pantalla, no un listado propio.
 */
import { useState } from "react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Pagination } from "@/components/shared/pagination";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { formatearInstante } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { ENTREGAS_POR_PAGINA, useWebhookEntregas } from "../hooks/use-webhook";
import { ETIQUETAS_EVENTO_EXTERNO_WEBHOOK } from "../schemas";
import type { EntregaWebhook } from "../types";

const ESTADO_ENTREGA: Record<EntregaWebhook["estado"], { etiqueta: string; variant: BadgeProps["variant"] }> = {
  PENDIENTE: { etiqueta: "Pendiente", variant: "warning" },
  ENTREGADA: { etiqueta: "Entregada", variant: "success" },
  FALLIDA: { etiqueta: "Fallida", variant: "destructive" },
};

function UltimoResultado({ entrega }: { entrega: EntregaWebhook }) {
  if (entrega.ultimoCodigo === null && entrega.ultimoError === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col">
      {entrega.ultimoCodigo !== null && <span className="font-mono text-xs">{entrega.ultimoCodigo}</span>}
      {entrega.ultimoError && <span className="text-xs text-muted-foreground">{entrega.ultimoError}</span>}
    </div>
  );
}

function Seguimiento({ entrega }: { entrega: EntregaWebhook }) {
  if (entrega.estado === "ENTREGADA" && entrega.entregadaAt) return <>Entregada el {formatearInstante(entrega.entregadaAt)}</>;
  if (entrega.estado === "PENDIENTE" && entrega.proximoIntentoAt) {
    return <>Próximo intento: {formatearInstante(entrega.proximoIntentoAt)}</>;
  }
  if (entrega.estado === "FALLIDA") return <span className="text-muted-foreground">Sin más reintentos</span>;
  return <span className="text-muted-foreground">—</span>;
}

const columns: Column<EntregaWebhook>[] = [
  { key: "createdAt", header: "Fecha", render: (e) => formatearInstante(e.createdAt) },
  { key: "evento", header: "Evento", render: (e) => ETIQUETAS_EVENTO_EXTERNO_WEBHOOK[e.evento] ?? e.evento },
  { key: "numero", header: "Ticket", render: (e) => (e.numero ?? "—") },
  {
    key: "estado",
    header: "Estado",
    render: (e) => <Badge variant={ESTADO_ENTREGA[e.estado].variant}>{ESTADO_ENTREGA[e.estado].etiqueta}</Badge>,
  },
  { key: "intentos", header: "Intentos", render: (e) => String(e.intentos) },
  { key: "ultimoCodigo", header: "Último código / error", render: (e) => <UltimoResultado entrega={e} /> },
  { key: "proximoIntentoAt", header: "Próximo intento / entrega", render: (e) => <Seguimiento entrega={e} /> },
];

export function WebhookEntregasTable() {
  const [pagina, setPagina] = useState(1);
  const query = useWebhookEntregas(pagina);
  const total = query.data?.total ?? 0;

  return (
    <div>
      <DataTable variante="tarjeta"
        columns={columns}
        data={query.data?.items ?? []}
        getRowKey={(e) => e.id}
        isLoading={query.isLoading}
        error={query.isError ? "No se pudo cargar el registro de entregas." : undefined}
        onRetry={() => query.refetch().catch(notifyError)}
        emptyTitle="Sin entregas"
        emptyDescription="Cuando ocurra un evento suscripto, el aviso aparece acá con su resultado."
        hayFiltrosActivos={pagina > 1}
        onLimpiarFiltros={() => setPagina(1)}
      />
      {total > ENTREGAS_POR_PAGINA && (
        <Pagination page={pagina} pageSize={ENTREGAS_POR_PAGINA} total={total} onPageChange={setPagina} />
      )}
    </div>
  );
}
