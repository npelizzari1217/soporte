"use client";

/**
 * ReglasAsignacionAdminView — CONTAINER client component montado por
 * `/admin/reglas-asignacion`. Una fila por tipo de ticket activo con el
 * selector del responsable; la opción vacía significa "sin regla" (R6).
 *
 * Gate `esAdminCliente` (ADMINISTRADOR-o-ROOT) — defensa en profundidad: el
 * backend re-valida con `AdminClienteGuard` en el GET y en el PUT (R5).
 *
 * El `Select` es CONTROLADO por lo que dice el servidor: si el PUT se rechaza
 * (422) no se invalida la lista, así que el selector vuelve solo a la regla
 * anterior. Mientras corre el PUT de una fila, esa fila queda deshabilitada.
 */
import { SoloAdminCliente } from "@/components/shared/solo-admin-cliente";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { AdminNav } from "@/components/shell/admin-nav";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { notifyError } from "@/shared/lib/toast";
import { useConfigurarReglaAsignacion } from "../hooks/use-configurar-regla-asignacion";
import { useReglasAsignacion } from "../hooks/use-reglas-asignacion";
import type { CandidatoRegla, ReglaAsignacionFila } from "../types";

const AYUDA_ESTADO: Record<ReglaAsignacionFila["estado"], { etiqueta: string; variant: "outline" | "success" | "destructive"; ayuda: string }> = {
  SIN_REGLA: { etiqueta: "Sin regla", variant: "outline", ayuda: "Los tickets de este tipo nacen sin asignar." },
  VALIDA: { etiqueta: "Activa", variant: "success", ayuda: "Los tickets nuevos de este tipo se asignan a esta persona." },
  ROTA: {
    etiqueta: "Rota",
    variant: "destructive",
    ayuda: "El responsable ya no es válido: los tickets nacen sin asignar. Elegí otra persona o dejá la fila vacía.",
  },
};

function nombreCompleto(candidato: CandidatoRegla): string {
  return `${candidato.nombre} ${candidato.apellido}`;
}

function ReglaSelect({
  fila,
  candidatos,
  deshabilitada,
  onChange,
}: {
  fila: ReglaAsignacionFila;
  candidatos: CandidatoRegla[];
  deshabilitada: boolean;
  onChange: (responsableId: string | null) => void;
}) {
  // Regla rota: el responsable actual ya no es candidato, pero se muestra (deshabilitado)
  // para que el selector no parezca vacío cuando hay una regla guardada.
  const mostrarActual = fila.estado === "ROTA" && fila.responsableId !== null;
  return (
    <Select
      aria-label={`Responsable de ${fila.nombre}`}
      value={fila.responsableId ?? ""}
      disabled={deshabilitada}
      onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
    >
      <option value="">Sin regla</option>
      {mostrarActual && (
        <option value={fila.responsableId as string} disabled>
          {fila.responsableNombre ?? "Usuario no disponible"}
        </option>
      )}
      {candidatos.map((c) => (
        <option key={c.id} value={c.id}>
          {nombreCompleto(c)}
        </option>
      ))}
    </Select>
  );
}

function ReglasAsignacionTable() {
  const query = useReglasAsignacion();
  const mutation = useConfigurarReglaAsignacion();
  const enCurso = mutation.isPending ? mutation.variables?.tipoId : undefined;

  const columns: Column<ReglaAsignacionFila>[] = [
    { key: "nombre", header: "Tipo" },
    { key: "codigo", header: "Código" },
    { key: "modulo", header: "Módulo" },
    {
      key: "estado",
      header: "Estado",
      render: (fila) => {
        const { etiqueta, variant, ayuda } = AYUDA_ESTADO[fila.estado];
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant={variant}>{etiqueta}</Badge>
            <span className="text-xs text-muted-foreground">{ayuda}</span>
          </div>
        );
      },
    },
    {
      key: "responsableId",
      header: "Responsable",
      render: (fila) => (
        <ReglaSelect
          fila={fila}
          candidatos={query.data?.candidatosPorModulo[fila.modulo] ?? []}
          deshabilitada={enCurso === fila.tipoId}
          onChange={(responsableId) => mutation.mutate({ tipoId: fila.tipoId, responsableId })}
        />
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={query.data?.reglas ?? []}
      getRowKey={(fila) => fila.tipoId}
      isLoading={query.isLoading}
      error={query.isError ? "No se pudieron cargar las reglas de asignación." : undefined}
      onRetry={() => query.refetch().catch(notifyError)}
      emptyTitle="Sin tipos de ticket"
      emptyDescription="Creá un tipo de ticket activo para configurar su asignación automática."
    />
  );
}

export function ReglasAsignacionAdminView() {
  return (
    <div>
      <AdminNav />
      <SoloAdminCliente fallback={<ErrorState message="No tenés permiso para configurar la asignación automática." />}>
        <PageHeader
          title="Asignación automática"
          description="Elegí quién recibe los tickets nuevos de cada tipo. Sin responsable, el ticket nace sin asignar."
        />
        <ReglasAsignacionTable />
      </SoloAdminCliente>
    </div>
  );
}
