"use client";

/**
 * CatalogosAdminView — CONTAINER client component montado por
 * `/admin/catalogos` (T4.1). Tabs Tipos/Prioridades, gate `catalogo:gestionar`
 * (defensa en profundidad — el backend re-valida con `@RequirePermissions`
 * en cada endpoint de escritura; el GET de lectura no está gateado, pero esta
 * VISTA es exclusivamente de gestión así que se protege completa).
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { TipoTicketList } from "./tipo-ticket-list";
import { PrioridadList } from "./prioridad-list";

export function CatalogosAdminView() {
  return (
    <div>
      <AdminNav />
      <Can
        permiso="catalogo:gestionar"
        fallback={<ErrorState message="No tenés permiso para gestionar catálogos." />}
      >
        <PageHeader title="Catálogos" description="Tipos de ticket y prioridades del tenant." />
        <Tabs defaultValue="tipos">
          <TabsList>
            <TabsTrigger value="tipos">Tipos de ticket</TabsTrigger>
            <TabsTrigger value="prioridades">Prioridades</TabsTrigger>
          </TabsList>
          <TabsContent value="tipos">
            <TipoTicketList />
          </TabsContent>
          <TabsContent value="prioridades">
            <PrioridadList />
          </TabsContent>
        </Tabs>
      </Can>
    </div>
  );
}
