"use client";

/**
 * CiclosPage — pantalla de administración de ciclos del tenant resuelto.
 *
 * Visible para operador global (con cliente seleccionado en TenantContext) y
 * ADMINISTRADOR. Lista los ciclos como filas-tarjeta (CardRow), permite
 * activar un ciclo inactivo (PATCH /ciclos/:id/activar) y crear un ciclo
 * nuevo (POST /ciclos, siempre inactivo por defecto).
 *
 * X-Tenant-Id: inyectado por los hooks (useCiclosAdmin/useActivarCiclo/
 * useCrearCiclo) SOLO cuando isGlobalAdmin && clienteId (design ADR-3).
 *
 * Diseño (CLAUDE.md §3): filas-tarjeta con glassmorphism, badge emerald para
 * ciclo activo, skeleton loader durante la carga, empty state con acción.
 *
 * Spec: [SPEC:admin-ui/Pantalla Ciclos]
 */

import { useState, type FormEvent } from "react";
import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CardRow } from "@/components/ui/card-row";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { FormModal } from "@/components/ui/form-modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { notify } from "@/shared/lib/notify";
import { mapApiError } from "@/shared/lib/map-api-error";
import { useCiclosAdmin } from "../hooks/use-ciclos-admin";
import { useActivarCiclo } from "../hooks/use-activar-ciclo";
import { useCrearCiclo } from "../hooks/use-crear-ciclo";
import type { Ciclo } from "../types";

/**
 * Formatea una fecha ISO ("YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss.sssZ") a
 * dd/mm/yyyy mediante slicing puro de string — evita el gotcha de timezone de
 * `new Date(iso)` + `Intl.DateTimeFormat` para fechas sin hora (@db.Date):
 * en timezones con offset negativo, formatear en zona local puede correr la
 * fecha un día hacia atrás. Como fechaInicio/fechaFin son fechas puras
 * (sin componente horario relevante), reordenar el string es determinista.
 */
function formatFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ─── Nuevo ciclo — modal de creación ───────────────────────────────────────

interface NuevoCicloModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NuevoCicloModal({ open, onOpenChange }: NuevoCicloModalProps) {
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const crearCiclo = useCrearCiclo();

  function resetForm() {
    setNombre("");
    setFechaInicio("");
    setFechaFin("");
    setServerError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    try {
      await crearCiclo.mutateAsync({ nombre, fechaInicio, fechaFin });
      notify.success("Ciclo creado");
      resetForm();
      onOpenChange(false);
    } catch (err) {
      const msg = mapApiError(err);
      setServerError(msg);
      notify.error(msg);
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Nuevo ciclo"
      description="Completá los datos del nuevo ciclo de gestión."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {serverError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {serverError}
          </p>
        )}

        <FormField label="Nombre" htmlFor="ciclo-nombre" required>
          <Input
            id="ciclo-nombre"
            aria-label="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Fecha de inicio" htmlFor="ciclo-fecha-inicio" required>
          <Input
            id="ciclo-fecha-inicio"
            type="date"
            aria-label="Fecha de inicio"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            required
          />
        </FormField>

        <FormField label="Fecha de fin" htmlFor="ciclo-fecha-fin" required>
          <Input
            id="ciclo-fecha-fin"
            type="date"
            aria-label="Fecha de fin"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            required
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={crearCiclo.isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={crearCiclo.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </FormModal>
  );
}

// ─── CiclosPage ──────────────────────────────────────────────────────────────

export function CiclosPage() {
  const { data: ciclos, isLoading } = useCiclosAdmin();
  const activarCiclo = useActivarCiclo();
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function handleActivar(ciclo: Ciclo) {
    setActivatingId(ciclo.id);
    try {
      await activarCiclo.mutateAsync(ciclo.id);
      notify.success("Ciclo activado");
    } catch (err) {
      notify.error(mapApiError(err));
    } finally {
      setActivatingId(null);
    }
  }

  const nuevoCicloModal = (
    <NuevoCicloModal open={createOpen} onOpenChange={setCreateOpen} />
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Ciclos" />
        <div className="space-y-3">
          <Skeleton data-testid="ciclos-page-skeleton" className="h-16 w-full" />
          <Skeleton data-testid="ciclos-page-skeleton" className="h-16 w-full" />
          <Skeleton data-testid="ciclos-page-skeleton" className="h-16 w-full" />
        </div>
      </div>
    );
  }

  const isEmpty = !ciclos || ciclos.length === 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ciclos"
        actions={<Button onClick={() => setCreateOpen(true)}>Nuevo ciclo</Button>}
      />

      {isEmpty ? (
        <EmptyState
          title="No hay ciclos registrados"
          description="Creá el primer ciclo de gestión para este cliente."
          action={<Button onClick={() => setCreateOpen(true)}>Nuevo ciclo</Button>}
        />
      ) : (
        <div className="space-y-2">
          {ciclos.map((ciclo) => (
            <CardRow
              key={ciclo.id}
              icon={<CalendarRange className="h-5 w-5 text-muted-foreground" aria-hidden />}
              title={ciclo.nombre}
              subtitle={`${formatFecha(ciclo.fechaInicio)} – ${formatFecha(ciclo.fechaFin)}`}
              badges={
                <>
                  <Badge tone={ciclo.activo ? "success" : "neutral"}>
                    {ciclo.activo ? "Activo" : "Inactivo"}
                  </Badge>
                  {!ciclo.activo && (
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Activar ${ciclo.nombre}`}
                      isLoading={activarCiclo.isPending && activatingId === ciclo.id}
                      onClick={() => handleActivar(ciclo)}
                    >
                      Activar
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </div>
      )}

      {nuevoCicloModal}
    </div>
  );
}
