"use client";

/**
 * CrearUsuarioDialog — crea un usuario + membresía en el tenant del actor
 * (T4.7, spec §5). `clienteId` NUNCA se pide/envía — aislamiento estricto,
 * el backend SIEMPRE usa `actor.cliente_id` del JWT.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCrearUsuarioTenant } from "../hooks/use-usuarios-tenant-mutations";
import { useRoles } from "../hooks/use-roles";
import { crearUsuarioTenantSchema, type CrearUsuarioTenantFormValues } from "../schemas";

export function CrearUsuarioDialog() {
  const [open, setOpen] = useState(false);
  const mutation = useCrearUsuarioTenant();
  const rolesQuery = useRoles();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearUsuarioTenantFormValues>({
    resolver: zodResolver(crearUsuarioTenantSchema),
    defaultValues: { email: "", nombre: "", apellido: "", password: "", rolCodigo: "USUARIO" },
  });

  function submit(values: CrearUsuarioTenantFormValues) {
    mutation.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        reset();
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo usuario
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="usuario-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input id="usuario-email" type="email" error={!!errors.email} {...register("email")} />
            {errors.email && (
              <p role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="usuario-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="usuario-nombre" error={!!errors.nombre} {...register("nombre")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="usuario-apellido" className="text-sm font-medium text-foreground">
              Apellido
            </label>
            <Input id="usuario-apellido" error={!!errors.apellido} {...register("apellido")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="usuario-password" className="text-sm font-medium text-foreground">
              Contraseña
            </label>
            <Input id="usuario-password" type="password" error={!!errors.password} {...register("password")} />
            {errors.password && (
              <p role="alert" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="usuario-rol" className="text-sm font-medium text-foreground">
              Rol
            </label>
            <Select id="usuario-rol" error={!!errors.rolCodigo} {...register("rolCodigo")}>
              {(rolesQuery.data ?? []).map((rol) => (
                <option key={rol.id} value={rol.codigo}>
                  {rol.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={mutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
