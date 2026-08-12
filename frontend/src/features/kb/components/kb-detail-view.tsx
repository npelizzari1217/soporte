"use client";

/**
 * KbDetailView — CONTAINER client component montado por `/kb/:id` (ADR-1).
 * Lectura de un artículo (R-M3 / T3.3) + acciones gateadas por `kb:gestionar`
 * (editar/publicar-despublicar/eliminar, T3.4-T3.6). Contenido renderizado
 * como texto plano con saltos de línea preservados (`whitespace-pre-wrap`) —
 * ADR-6: "sin lib WYSIWYG", esta es la opción "texto plano" explícitamente
 * permitida (sin `dangerouslySetInnerHTML`, cero riesgo XSS).
 */
import { useRouter } from "next/navigation";
import { useKbArticulo } from "../hooks/use-kb-articulo";
import { useCambiarVisibilidadKbArticulo, useEliminarKbArticulo } from "../hooks/use-kb-mutations";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { Can } from "@/components/shared/can";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { KbArticleEditDialog } from "./kb-article-edit-dialog";
import { KbVisibilityToggle } from "./kb-visibility-toggle";
import { KbDeleteControl } from "./kb-delete-control";

export interface KbDetailViewProps {
  articuloId: string;
}

export function KbDetailView({ articuloId }: KbDetailViewProps) {
  const router = useRouter();
  const articuloQuery = useKbArticulo(articuloId);
  const visibilidadMutation = useCambiarVisibilidadKbArticulo(articuloId);
  const eliminarMutation = useEliminarKbArticulo(articuloId);

  if (articuloQuery.isLoading) return <DetailSkeleton />;
  if (articuloQuery.isError || !articuloQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar el artículo."
        onRetry={() => {
          articuloQuery.refetch().catch(() => {});
        }}
      />
    );
  }

  const articulo = articuloQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={articulo.titulo}
        actions={
          <Can permiso="kb:gestionar">
            <div className="flex items-center gap-2">
              <KbArticleEditDialog articulo={articulo} />
              <KbVisibilityToggle
                visible={articulo.visibleParaSolicitante}
                onConfirm={() => visibilidadMutation.mutate({ visible: !articulo.visibleParaSolicitante })}
                isSubmitting={visibilidadMutation.isPending}
              />
              <KbDeleteControl
                onConfirm={() => eliminarMutation.mutate(undefined, { onSuccess: () => router.push("/kb") })}
                isSubmitting={eliminarMutation.isPending}
              />
            </div>
          </Can>
        }
      />

      <div>
        <Badge variant={articulo.visibleParaSolicitante ? "success" : "outline"}>
          {articulo.visibleParaSolicitante ? "Publicado" : "Interno"}
        </Badge>
      </div>

      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{articulo.contenido}</div>
    </div>
  );
}
