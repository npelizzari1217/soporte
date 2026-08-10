"use client";

/**
 * EditarUsuarioDialog — edita nombre y apellido de un usuario del tenant
 * (spec §5). El `email` NO se edita (identidad de acceso global): se muestra
 * deshabilitado como referencia. `clienteId` NUNCA se envía — aislamiento
 * estricto, el backend SIEMPRE usa `actor.cliente_id` del JWT.
 *
 * Los campos se precargan con los valores actuales del row. La edición de
 * nombre/apellido es identidad GLOBAL: impacta al usuario en todos sus tenants.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditarUsuarioTenant } from "../hooks/use-usuarios-tenant-mutations";
import { editarUsuarioSchema, type EditarUsuarioFormValues } from "../schemas";
import type { UsuarioTenant } from "../types";

export interface EditarUsuarioDialogProps {
  usuario: UsuarioTenant;
}

export function EditarUsuarioDialog({ usuario }: EditarUsuarioDialogProps) {
  const [open, setOpen] = useState(false);
  const mutation = useEditarUsuarioTenant(usuario.id);
  const defaults: EditarUsuarioFormValues = { nombre: usuario.nombre, apellido: usuario.apellido };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditarUsuarioFormValues>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: defaults,
  });

  function submit(values: EditarUsuarioFormValues) {
    mutation.mutate(values, {
      onSuccess: () => setOpen(false),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Pencil className="mr-1 h-4 w-4" aria-hidden="true" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="editar-usuario-email" className="text-sm font-medium text-foreground">
              Email
            </label>
            <Input
              id="editar-usuario-email"
              type="email"
              defaultValue={usuario.email ?? ""}
              disabled
            />
            <p className="text-xs text-muted-foreground">El email no se puede modificar.</p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editar-usuario-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="editar-usuario-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="editar-usuario-apellido" className="text-sm font-medium text-foreground">
              Apellido
            </label>
            <Input id="editar-usuario-apellido" error={!!errors.apellido} {...register("apellido")} />
            {errors.apellido && (
              <p role="alert" className="text-sm text-destructive">
                {errors.apellido.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={mutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
