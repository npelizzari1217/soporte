"use client";

/**
 * InsumosCatalogosAdminView — CONTAINER client component montado por
 * `/admin/insumos`. ABM del catálogo de familias de insumo, gate
 * `esAdminCliente` (ADMINISTRADOR-o-ROOT, ADR-P5) — defensa en profundidad:
 * el backend re-valida con `AdminClienteGuard` en cada endpoint de
 * escritura; la lectura NO está gateada, pero esta VISTA es exclusivamente
 * de gestión así que se protege completa. Mismo patrón que
 * `features/catalogos/components/catalogos-admin-view.tsx`.
 *
 * Las unidades de medida vivían acá como una segunda tab y se mudaron a
 * `Admin -> Unidades` (issue #156, `UnidadesMedidaAdminView`): son un
 * catálogo TRANSVERSAL, no una propiedad del insumo, y compartir tab con
 * familias las escondía — sin cambio de gate ni de conducta del ABM.
 */
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { FamiliaInsumoList } from "./familia-insumo-list";

export function InsumosCatalogosAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para gestionar los catálogos de insumos." />}>
        <PageHeader title="Familia de Catálogos" description="Familias del catálogo, de consumibles y de repuestos." />
        <FamiliaInsumoList />
      </SoloAdminCliente>
    </div>
  );
}
