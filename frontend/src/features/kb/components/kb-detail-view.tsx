"use client";

/**
 * KbDetailView — CONTAINER client component montado por `/kb/:id` (ADR-1).
 * Lectura de un artículo (R-M3 / T3.3) + acciones de gestión
 * (editar/publicar-despublicar/eliminar, T3.4-T3.6) gateadas por ROOT
 * (`<SoloRoot>`): la Ayuda es una sola para todo el sistema, y un
 * administrador de cliente que la editara estaría cambiando lo que leen los
 * demás clientes. El contenido se renderiza
 * como markdown vía `KbMarkdown` — ADR-6 ("sin lib WYSIWYG") se mantiene: el
 * autor escribe markdown plano en un textarea, no hay editor visual. El
 * renderer NO habilita HTML crudo ni usa `dangerouslySetInnerHTML`; el porqué
 * está documentado en `kb-markdown.tsx` y no debe revertirse.
 */
import { useRouter } from "next/navigation";
import { useKbArticulo } from "../hooks/use-kb-articulo";
import { useCambiarVisibilidadKbArticulo, useEliminarKbArticulo } from "../hooks/use-kb-mutations";
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { SoloRoot } from "@/components/shared/solo-root";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { KbArticleEditDialog } from "./kb-article-edit-dialog";
import { KbVisibilityToggle } from "./kb-visibility-toggle";
import { KbDeleteControl } from "./kb-delete-control";
import { KbMarkdown } from "./kb-markdown";

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
          <div className="flex items-center gap-2">
            <SoloRoot>
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
            </SoloRoot>
          </div>
        }
      />

      <div>
        <Badge variant={articulo.visibleParaSolicitante ? "success" : "outline"}>
          {articulo.visibleParaSolicitante ? "Publicado" : "Interno"}
        </Badge>
      </div>

      <article aria-label="Contenido del artículo">
        <KbMarkdown contenido={articulo.contenido} />
      </article>
    </div>
  );
}
