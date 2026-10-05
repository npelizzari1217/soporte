"use client";

/**
 * CatalogosAdminView — CONTAINER client component montado por
 * `/admin/catalogos` (T4.1, migrado en WU-7.6). Tabs Tipos/Prioridades, gate
 * `esAdminCliente` (ADMINISTRADOR-o-ROOT, ADR-P5) — defensa en profundidad:
 * el backend re-valida con `AdminClienteGuard` en cada endpoint de
 * escritura; las 4 lecturas NO están gateadas (R4), pero esta VISTA es
 * exclusivamente de gestión así que se protege completa.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { TipoTicketList } from "./tipo-ticket-list";
import { PrioridadList } from "./prioridad-list";
import { SectorList } from "@/features/sectores/components/sector-list";
import { RespuestaPredefinidaList } from "@/features/respuestas-predefinidas/components/respuesta-predefinida-list";

/**
 * WU-31 (`compras-tres-etapas-y-sectores` R10): agrega el tab "Sectores" al
 * ABM existente de catálogos. El gate del backend (`AdminClienteGuard` por
 * método, S64) es el mismo que ya protege tipos/prioridades — no requiere
 * ninguna acción `MODULO:ACCION` nueva.
 *
 * Tab "Respuestas" (roadmap segunda etapa, punto 4): respuestas predefinidas de soporte,
 * mismo gate (`AdminClienteGuard`) y tampoco agrega acciones.
 */
export function CatalogosAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para gestionar catálogos." />}>
        <PageHeader title="Catálogos" description="Tipos de ticket, prioridades, sectores y respuestas predefinidas del tenant." />
        <Tabs defaultValue="tipos">
          <TabsList>
            <TabsTrigger value="tipos">Tipos de ticket</TabsTrigger>
            <TabsTrigger value="prioridades">Prioridades</TabsTrigger>
            <TabsTrigger value="sectores">Sectores</TabsTrigger>
            <TabsTrigger value="respuestas">Respuestas</TabsTrigger>
          </TabsList>
          <TabsContent value="tipos">
            <TipoTicketList />
          </TabsContent>
          <TabsContent value="prioridades">
            <PrioridadList />
          </TabsContent>
          <TabsContent value="sectores">
            <SectorList />
          </TabsContent>
          <TabsContent value="respuestas">
            <RespuestaPredefinidaList />
          </TabsContent>
        </Tabs>
      </SoloAdminCliente>
    </div>
  );
}
