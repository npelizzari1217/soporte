"use client";

/**
 * KbEditView — CONTAINER client component montado por `/kb/:id/editar`
 * (ADR-1). Gate `kb:gestionar`. NO edita visibilidad (endpoint dedicado,
 * `KbVisibilityToggle` en el detalle, T3.5).
 */
import { useRouter } from "next/navigation";
import { useKbArticulo } from "../hooks/use-kb-articulo";
import { useEditarKbArticulo } from "../hooks/use-kb-mutations";
import { Can } from "@/components/shared/can";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { KbArticuloForm } from "./kb-article-form";
import type { CrearKbArticuloDto } from "../types";

export interface KbEditViewProps {
  articuloId: string;
}

export function KbEditView({ articuloId }: KbEditViewProps) {
  const router = useRouter();
  const articuloQuery = useKbArticulo(articuloId);
  const editarMutation = useEditarKbArticulo(articuloId);

  function handleSubmit(dto: CrearKbArticuloDto) {
    editarMutation.mutate(dto, {
      onSuccess: () => router.push(`/kb/${articuloId}`),
    });
  }

  return (
    <Can permiso="kb:gestionar" fallback={<ErrorState message="No tenés permiso para editar artículos." />}>
      <div>
        <PageHeader title="Editar artículo" />
        {articuloQuery.isLoading && <DetailSkeleton />}
        {articuloQuery.isError && (
          <ErrorState
            message="No se pudo cargar el artículo."
            onRetry={() => {
              articuloQuery.refetch().catch(() => {});
            }}
          />
        )}
        {articuloQuery.data && (
          <KbArticuloForm
            defaultValues={{
              titulo: articuloQuery.data.titulo,
              contenido: articuloQuery.data.contenido,
              tipoTicketId: articuloQuery.data.tipoTicketId ?? "",
            }}
            onSubmit={handleSubmit}
            onCancel={() => router.push(`/kb/${articuloId}`)}
            isSubmitting={editarMutation.isPending}
          />
        )}
      </div>
    </Can>
  );
}
