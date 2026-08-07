"use client";

/**
 * KbCreateView — CONTAINER client component montado por `/kb/nuevo`
 * (ADR-1). Gate `kb:gestionar` (`<Can>`, ADR-4) — el backend re-valida vía
 * `@RequirePermissions('kb:gestionar')` de todos modos (K1). El artículo
 * nace interno (`visibleParaSolicitante=false`) — se publica desde el
 * detalle (T3.5).
 */
import { useRouter } from "next/navigation";
import { useCrearKbArticulo } from "../hooks/use-kb-mutations";
import { Can } from "@/components/shared/can";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/error-state";
import { KbArticuloForm } from "./kb-article-form";
import type { CrearKbArticuloDto } from "../types";

export function KbCreateView() {
  const router = useRouter();
  const crearMutation = useCrearKbArticulo();

  function handleSubmit(dto: CrearKbArticuloDto) {
    crearMutation.mutate(dto, {
      onSuccess: (articulo) => router.push(`/kb/${articulo.id}`),
    });
  }

  return (
    <Can permiso="kb:gestionar" fallback={<ErrorState message="No tenés permiso para crear artículos." />}>
      <div>
        <PageHeader title="Nuevo artículo" />
        <KbArticuloForm onSubmit={handleSubmit} isSubmitting={crearMutation.isPending} submitLabel="Crear" />
      </div>
    </Can>
  );
}
