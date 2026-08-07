"use client";

/**
 * EdiliciaView — CONTAINER montado por `/edilicia` (T5.7-T5.10, ADR-1: ruta
 * única "(+ubicaciones)"). Tabs Reparaciones/Ubicaciones, mismo patrón que
 * `CatalogosAdminView` (B4). Gate de acceso a la vista = predicado del
 * ítem "Edilicia" en `nav-config.ts` (`subtarea:actualizar ||
 * catalogo:gestionar`) — las acciones dentro de cada tab tienen su propio
 * gate más específico (`ticket:crear`, `subtarea:actualizar`,
 * `catalogo:gestionar`).
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { ReparacionesList } from "./reparaciones-list";
import { UbicacionesList } from "./ubicaciones-list";

export function EdiliciaView() {
  return (
    <Can
      permiso="subtarea:actualizar"
      fallback={
        <Can permiso="catalogo:gestionar" fallback={<ErrorState message="No tenés permiso para ver Edilicia." />}>
          <Tabs defaultValue="ubicaciones">
            <TabsList>
              <TabsTrigger value="ubicaciones">Ubicaciones</TabsTrigger>
            </TabsList>
            <TabsContent value="ubicaciones">
              <UbicacionesList />
            </TabsContent>
          </Tabs>
        </Can>
      }
    >
      <Tabs defaultValue="reparaciones">
        <TabsList>
          <TabsTrigger value="reparaciones">Reparaciones</TabsTrigger>
          <TabsTrigger value="ubicaciones">Ubicaciones</TabsTrigger>
        </TabsList>
        <TabsContent value="reparaciones">
          <ReparacionesList />
        </TabsContent>
        <TabsContent value="ubicaciones">
          <UbicacionesList />
        </TabsContent>
      </Tabs>
    </Can>
  );
}
