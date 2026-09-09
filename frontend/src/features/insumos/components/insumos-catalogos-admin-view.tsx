"use client";

/**
 * InsumosCatalogosAdminView — CONTAINER client component montado por
 * `/admin/insumos`. ABM de los dos catálogos de Insumos (familias/unidades de
 * medida), gate `esAdminCliente` (ADMINISTRADOR-o-ROOT, ADR-P5) — defensa en
 * profundidad: el backend re-valida con `AdminClienteGuard` en cada endpoint
 * de escritura; las 2 lecturas NO están gateadas, pero esta VISTA es
 * exclusivamente de gestión así que se protege completa. Mismo patrón que
 * `features/catalogos/components/catalogos-admin-view.tsx`.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { FamiliaInsumoList } from "./familia-insumo-list";
import { UnidadMedidaList } from "./unidad-medida-list";

export function InsumosCatalogosAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para gestionar los catálogos de insumos." />}>
        <PageHeader title="Insumos" description="Familias y unidades de medida del catálogo de insumos." />
        <Tabs defaultValue="familias">
          <TabsList>
            <TabsTrigger value="familias">Familias de insumo</TabsTrigger>
            <TabsTrigger value="unidades">Unidades de medida</TabsTrigger>
          </TabsList>
          <TabsContent value="familias">
            <FamiliaInsumoList />
          </TabsContent>
          <TabsContent value="unidades">
            <UnidadMedidaList />
          </TabsContent>
        </Tabs>
      </SoloAdminCliente>
    </div>
  );
}
