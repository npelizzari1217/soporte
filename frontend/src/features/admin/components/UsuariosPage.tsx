"use client";

/**
 * UsuariosPage — pantalla `/admin/usuarios` (CONTAINER + PRESENTATIONAL).
 *
 * Accesible para ADMINISTRADOR y operador (protección de ruta ya resuelta por
 * middleware — ver [SPEC:admin-ui/Pantalla Usuarios]). Lista usuarios del
 * tenant resuelto por TenantContext como filas-tarjeta, permite crear un
 * usuario nuevo y dar de baja a un usuario existente.
 *
 * NUNCA renderiza passwordHash/password en la lista — el backend ya lo excluye
 * de UsuarioResponseDto (invariante de seguridad).
 *
 * "Dar de baja" está deshabilitado para el usuario autenticado
 * (user.sub === usuario.id) — evita que un admin se autoelimine el acceso.
 *
 * Diseño (CONSTITUTION §3): filas-tarjeta glassmorphism, skeleton loader,
 * empty state con acción, botón con loading state, ConfirmDialog destructivo.
 *
 * Spec: [SPEC:admin-ui/Pantalla Usuarios]
 * Tarea: T6.5 (RED) + T6.6 (GREEN), admin-general PR6c
 */

import { useState } from "react";
import { User as UserIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { CardRow } from "@/components/ui/card-row";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormModal } from "@/components/ui/form-modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { notify } from "@/shared/lib/notify";
import { mapApiError } from "@/shared/lib/map-api-error";
import { useSession } from "@/shared/hooks/use-session";
import { ApiError } from "@/shared/api/types";
import { useUsuariosAdmin } from "../hooks/use-usuarios-admin";
import { useCrearUsuario } from "../hooks/use-crear-usuario";
import { useBajaUsuario } from "../hooks/use-baja-usuario";
import type { NuevoUsuarioInput } from "../types";

/** Roles asignables — mirrors ROLES_VALIDOS (backend/src/auth/interface/dtos/auth.dto.ts). */
const ROL_OPTIONS = [
  { value: "USUARIO", label: "Usuario" },
  { value: "COLABORADOR", label: "Colaborador" },
  { value: "TECNICO", label: "Técnico" },
  { value: "ADMINISTRADOR", label: "Administrador" },
];

const EMPTY_FORM: NuevoUsuarioInput = {
  nombre: "",
  apellido: "",
  email: "",
  password: "",
  rol: "",
};

export function UsuariosPage() {
  const { user } = useSession();
  const { data, isLoading, isError, refetch } = useUsuariosAdmin();

  const [confirmId, setConfirmId] = useState<string | null>(null);
  const bajaUsuario = useBajaUsuario();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<NuevoUsuarioInput>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const crearUsuario = useCrearUsuario();

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setCreateOpen(true);
  }

  async function handleBaja() {
    if (!confirmId) return;
    try {
      await bajaUsuario.mutateAsync(confirmId);
      notify.success("Usuario dado de baja");
      setConfirmId(null);
    } catch (err) {
      notify.error(mapApiError(err));
      // confirmId NOT cleared → dialog stays open (permite reintentar o cancelar)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    try {
      await crearUsuario.mutateAsync(form);
      notify.success("Usuario creado");
      setCreateOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 409) {
        setFormError("Este email ya está registrado");
        return;
      }
      setFormError(mapApiError(err));
    }
  }

  const createModal = (
    <FormModal
      open={createOpen}
      onOpenChange={setCreateOpen}
      title="Nuevo usuario"
      description="Completá los datos para crear un usuario del tenant."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <FormField label="Nombre" htmlFor="usuario-nombre" required>
          <Input
            id="usuario-nombre"
            aria-label="Nombre"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
          />
        </FormField>

        <FormField label="Apellido" htmlFor="usuario-apellido" required>
          <Input
            id="usuario-apellido"
            aria-label="Apellido"
            value={form.apellido}
            onChange={(e) => setForm({ ...form, apellido: e.target.value })}
            required
          />
        </FormField>

        <FormField label="Email" htmlFor="usuario-email" required>
          <Input
            id="usuario-email"
            type="email"
            aria-label="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </FormField>

        <FormField label="Rol" htmlFor="usuario-rol" required>
          <Select
            id="usuario-rol"
            aria-label="Rol"
            value={form.rol}
            onValueChange={(value) => setForm({ ...form, rol: value })}
            options={ROL_OPTIONS}
            placeholder="Seleccionar rol"
          />
        </FormField>

        <FormField label="Contraseña" htmlFor="usuario-password" required>
          <Input
            id="usuario-password"
            type="password"
            aria-label="Contraseña"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </FormField>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCreateOpen(false)}
            disabled={crearUsuario.isPending}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={crearUsuario.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </FormModal>
  );

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Usuarios" />
        <div className="space-y-3">
          <Skeleton data-testid="usuarios-skeleton-row" className="h-16 w-full" />
          <Skeleton data-testid="usuarios-skeleton-row" className="h-16 w-full" />
          <Skeleton data-testid="usuarios-skeleton-row" className="h-16 w-full" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Usuarios" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No se pudieron cargar los usuarios.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Usuarios" />
        <EmptyState
          title="No hay usuarios registrados"
          description="Los usuarios del tenant aparecerán aquí una vez que se creen."
          action={<Button onClick={openCreate}>Nuevo usuario</Button>}
        />
        {createModal}
      </div>
    );
  }

  const confirmUsuario = data.find((u) => u.id === confirmId);

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Usuarios" actions={<Button onClick={openCreate}>Nuevo usuario</Button>} />
      <div className="space-y-2">
        {data.map((usuario) => {
          const esPropio = usuario.id === user?.sub;
          return (
            <CardRow
              key={usuario.id}
              icon={<UserIcon className="h-5 w-5 text-muted-foreground" aria-hidden />}
              title={`${usuario.nombre} ${usuario.apellido}`}
              subtitle={usuario.email}
              badges={
                <>
                  <Badge tone="info">{usuario.roles[0] ?? "Sin rol"}</Badge>
                  <Badge tone={usuario.activo ? "success" : "neutral"}>
                    {usuario.activo ? "Activo" : "Inactivo"}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={esPropio}
                    onClick={() => setConfirmId(usuario.id)}
                  >
                    Dar de baja
                  </Button>
                </>
              }
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={!!confirmId}
        onOpenChange={(v) => {
          if (!v) setConfirmId(null);
        }}
        title="¿Dar de baja este usuario?"
        description={
          confirmUsuario
            ? `¿Dar de baja a "${confirmUsuario.nombre} ${confirmUsuario.apellido}"? Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Dar de baja"
        onConfirm={handleBaja}
        isPending={bajaUsuario.isPending}
      />

      {createModal}
    </div>
  );
}
