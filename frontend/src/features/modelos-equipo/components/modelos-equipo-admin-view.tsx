"use client";

/**
 * ModelosEquipoAdminView — CONTAINER client component montado por
 * `/admin/modelos-equipo`. ABM del catálogo `ModeloEquipo`, molde exacto de
 * `features/insumos/components/unidades-medida-admin-view.tsx` (ADR-1).
 *
 * Gate `esAdminCliente` (ADMINISTRADOR-o-ROOT) — defensa en profundidad: el
 * backend re-valida con `AdminClienteGuard` en cada endpoint de escritura
 * (`crear`/`editar`/`cambiarEstadoActivo`); la lectura NO está gateada, pero
 * esta VISTA es exclusivamente de gestión así que se protege completa. Sin
 * permiso nuevo en la matriz `MODULO:ACCION` (R1).
 */
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { ModeloEquipoList } from "./modelo-equipo-list";

export function ModelosEquipoAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para gestionar los modelos de equipo." />}>
        <PageHeader title="Modelos de equipo" description="Catálogo de modelos de equipo, transversal a los equipos." />
        <ModeloEquipoList />
      </SoloAdminCliente>
    </div>
  );
}
