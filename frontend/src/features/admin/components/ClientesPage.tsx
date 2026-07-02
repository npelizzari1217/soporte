"use client";

/**
 * ClientesPage — pantalla de administración de clientes (solo operador global).
 *
 * Ruta: (dashboard)/admin/clientes. Protegida por middleware (T5.14/T5.15, PR5) —
 * solo accesible con is_global_admin=true.
 *
 * Responsabilidades:
 * - Listar clientes (useClientes, PR5) como filas-tarjeta: nombre, badge de estado,
 *   db_name, acciones (Suspender/Reactivar).
 * - Provisionar un nuevo cliente vía formulario modal (useCrearCliente).
 * - Suspender (DELETE /clientes/:id) / Reactivar (PUT /clientes/:id/reactivar) —
 *   endpoints ya existentes en el backend (ClientesController).
 *
 * Diseño (CLAUDE.md §3): filas-tarjeta (CardRow), glassmorphism, skeleton loader,
 * empty state con acción primaria, botones con loading state, modo dual dark/light
 * heredado de los átomos de @/components/ui.
 *
 * Nota de implementación: el formulario usa estado controlado simple (useState), no
 * react-hook-form + zod (a diferencia de TicketFormModal) — los campos son todos
 * texto/email/password sin validación cliente-side requerida por el spec; la única
 * validación de negocio (db_name duplicado) es server-side y se mapea acá.
 *
 * Spec: [SPEC:admin-ui/Pantalla Clientes]
 */

import { useState, type ChangeEvent, type FormEvent } from "react";
import { Building2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CardRow } from "@/components/ui/card-row";
import { Badge } from "@/components/ui/badge";
import { FormModal } from "@/components/ui/form-modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/shared/lib/notify";
import { mapApiError } from "@/shared/lib/map-api-error";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { ApiError } from "@/shared/api/types";
import { useClientes } from "../hooks/use-clientes";
import { useCrearCliente, type CrearClienteInput } from "../hooks/use-crear-cliente";

const EMPTY_FORM: CrearClienteInput = {
  nombre: "",
  dbName: "",
  adminEmail: "",
  adminNombre: "",
  adminApellido: "",
  adminPassword: "",
};

/**
 * Mapea errores del POST /clientes a mensajes de UI.
 * 409 (db_name duplicado) MUST mostrar el texto fijo del spec, no el mensaje crudo
 * del backend (`Ya existe un cliente con db_name "x".`) — admin-ui/Pantalla Clientes.
 */
function mapCrearClienteError(err: unknown): string {
  if (err instanceof ApiError && err.statusCode === 409) {
    return "Ese identificador de DB ya existe";
  }
  return mapApiError(err);
}

export function ClientesPage() {
  const { data: clientes, isLoading, isError, refetch } = useClientes();
  const crearCliente = useCrearCliente();
  const qc = useQueryClient();

  // ── Formulario "Nuevo cliente" ──────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CrearClienteInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function handleOpenCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreateOpen(true);
  }

  function handleChange(field: keyof CrearClienteInput) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    try {
      await crearCliente.mutateAsync(form);
      notify.success("Cliente creado");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
    } catch (err) {
      const msg = mapCrearClienteError(err);
      setFormError(msg);
      notify.error(msg);
    }
  }

  // ── Suspender / Reactivar ────────────────────────────────────────────────────
  const [confirmSuspendId, setConfirmSuspendId] = useState<string | null>(null);

  const suspender = useMutation<void, ApiError, string>({
    mutationFn: (id) => apiFetch<void>(`clientes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.clientes }),
  });

  const reactivar = useMutation<void, ApiError, string>({
    mutationFn: (id) => apiFetch<void>(`clientes/${id}/reactivar`, { method: "PUT" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.clientes }),
  });

  async function handleConfirmSuspend() {
    if (!confirmSuspendId) return;
    try {
      await suspender.mutateAsync(confirmSuspendId);
      notify.success("Cliente suspendido");
      setConfirmSuspendId(null);
    } catch (err) {
      notify.error(mapApiError(err));
      // confirmSuspendId NOT cleared — el dialog permanece abierto (retry/cancel).
    }
  }

  async function handleReactivate(id: string) {
    try {
      await reactivar.mutateAsync(id);
      notify.success("Cliente reactivado");
    } catch (err) {
      notify.error(mapApiError(err));
    }
  }

  // ── Render pieces compartidos ────────────────────────────────────────────────
  const headerActions = <Button onClick={handleOpenCreate}>Nuevo cliente</Button>;

  const formModal = (
    <FormModal
      open={createOpen}
      onOpenChange={setCreateOpen}
      title="Nuevo cliente"
      description="Completá los datos para provisionar un nuevo cliente."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            {formError}
          </p>
        )}

        <FormField label="Nombre" htmlFor="nombre" required>
          <Input
            id="nombre"
            aria-label="Nombre"
            value={form.nombre}
            onChange={handleChange("nombre")}
          />
        </FormField>

        <FormField label="db_name" htmlFor="dbName" required>
          <Input
            id="dbName"
            aria-label="db_name"
            value={form.dbName}
            onChange={handleChange("dbName")}
            placeholder="identificador_unico_db"
          />
        </FormField>

        <FormField label="Email admin" htmlFor="adminEmail" required>
          <Input
            id="adminEmail"
            type="email"
            aria-label="Email admin"
            value={form.adminEmail}
            onChange={handleChange("adminEmail")}
          />
        </FormField>

        <FormField label="Nombre admin" htmlFor="adminNombre" required>
          <Input
            id="adminNombre"
            aria-label="Nombre admin"
            value={form.adminNombre}
            onChange={handleChange("adminNombre")}
          />
        </FormField>

        <FormField label="Apellido admin" htmlFor="adminApellido" required>
          <Input
            id="adminApellido"
            aria-label="Apellido admin"
            value={form.adminApellido}
            onChange={handleChange("adminApellido")}
          />
        </FormField>

        <FormField label="Contraseña admin" htmlFor="adminPassword" required>
          <Input
            id="adminPassword"
            type="password"
            aria-label="Contraseña admin"
            value={form.adminPassword}
            onChange={handleChange("adminPassword")}
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateOpen(false)}
            disabled={crearCliente.isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={crearCliente.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </FormModal>
  );

  // ── Estado: cargando ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Clientes" actions={headerActions} />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
        {formModal}
      </div>
    );
  }

  // ── Estado: error ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Clientes" actions={headerActions} />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar los clientes.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
        {formModal}
      </div>
    );
  }

  // ── Estado: vacío ────────────────────────────────────────────────────────────
  if (!clientes || clientes.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Clientes" />
        <EmptyState
          icon={<Building2 className="h-10 w-10" aria-hidden />}
          title="No hay clientes registrados"
          description="Provisioná el primer cliente para empezar."
          action={<Button onClick={handleOpenCreate}>Nuevo cliente</Button>}
        />
        {formModal}
      </div>
    );
  }

  // ── Estado: éxito ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Clientes" actions={headerActions} />
      <div className="space-y-2">
        {clientes.map((cliente) => (
          <CardRow
            key={cliente.id}
            icon={<Building2 className="h-5 w-5 text-muted-foreground" aria-hidden />}
            title={cliente.nombre}
            subtitle={cliente.dbName}
            badges={
              <>
                <Badge tone={cliente.activo ? "success" : "danger"}>
                  {cliente.activo ? "Activo" : "Suspendido"}
                </Badge>
                {cliente.activo ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmSuspendId(cliente.id)}
                  >
                    Suspender
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    isLoading={reactivar.isPending}
                    onClick={() => handleReactivate(cliente.id)}
                  >
                    Reactivar
                  </Button>
                )}
              </>
            }
          />
        ))}
      </div>

      <ConfirmDialog
        open={!!confirmSuspendId}
        onOpenChange={(open) => {
          if (!open) setConfirmSuspendId(null);
        }}
        title="¿Suspender cliente?"
        description="El cliente y sus usuarios perderán acceso hasta que sea reactivado."
        confirmLabel="Suspender"
        onConfirm={handleConfirmSuspend}
        isPending={suspender.isPending}
      />

      {formModal}
    </div>
  );
}
