"use client";

/**
 * UnidadesMedidaAdminView — CONTAINER client component montado por
 * `/admin/unidades` (issue #156). ABM del catálogo TRANSVERSAL de unidades
 * de medida: antes vivía como tab dentro de `InsumosCatalogosAdminView`
 * (`Admin -> Insumos`) y se mudó a sección propia porque una unidad de
 * medida no es una propiedad del insumo — compartir tab con familias la
 * escondía (quien buscaba crear una desde el alta de insumo no tenía forma
 * obvia de saber adónde ir).
 *
 * Gate `esAdminCliente` (ADMINISTRADOR-o-ROOT, ADR-P5) — EXACTAMENTE el
 * mismo permiso que ya gateaba el ABM cuando vivía adentro de Insumos, sin
 * cambio de autorización. Defensa en profundidad: el backend re-valida con
 * `AdminClienteGuard` en cada endpoint de escritura; la lectura NO está
 * gateada, pero esta VISTA es exclusivamente de gestión así que se protege
 * completa. Mismo patrón que `insumos-catalogos-admin-view.tsx`.
 *
 * Refactor sin cambio de conducta: el ABM (crear/editar/activar/desactivar)
 * es el mismo `UnidadMedidaList`/`UnidadMedidaFormDialog` de siempre, solo
 * que montado desde esta sección en vez de una tab.
 */
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { UnidadMedidaList } from "./unidad-medida-list";

export function UnidadesMedidaAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para gestionar las unidades de medida." />}>
        <PageHeader title="Unidades" description="Catálogo de unidades de medida, transversal a los insumos." />
        <UnidadMedidaList />
      </SoloAdminCliente>
    </div>
  );
}
