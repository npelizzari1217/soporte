"use client";

/**
 * EditarUsuarioDialog — edita nombre y apellido de un usuario del tenant
 * (spec §5) Y, opcionalmente, resetea su contraseña
 * (`sdd/reset-de-contrasena-por-admin`). El `email` NO se edita (identidad de
 * acceso global): se muestra deshabilitado como referencia. `clienteId` NUNCA
 * se envía — aislamiento estricto, el backend SIEMPRE usa `actor.cliente_id`
 * del JWT.
 *
 * Los campos se precargan con los valores actuales del row. La edición de
 * nombre/apellido es identidad GLOBAL: impacta al usuario en todos sus tenants.
 *
 * ADR-3: el `submit` dispara hasta DOS mutaciones SECUENCIALES con un corte —
 * identidad primero, reset después, solo si el campo de contraseña no está
 * vacío. Si la identidad falla, el reset NUNCA se emite: el peor desenlace
 * (contraseña cambiada + error mostrado) queda estructuralmente inalcanzable.
 * El diálogo compone y emite los toasts (ni `useEditarUsuarioTenant` ni
 * `useResetearPasswordUsuarioTenant` los tienen) porque un mensaje verde de
 * éxito al lado de uno rojo de la otra mutación reproduce la ambigüedad de
 * `scripts/reset-password.ts:6-19`. El diálogo NO cierra ante un fallo
 * parcial: cerrar destruye el form y, con él, la contraseña tipeada.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ApiError } from "@/shared/api/types";
import {
  useEditarUsuarioTenant,
  useResetearTfaUsuarioTenant,
  useResetearPasswordUsuarioTenant,
} from "../hooks/use-usuarios-tenant-mutations";
import { editarUsuarioSchema, type EditarUsuarioFormValues } from "../schemas";
import type { UsuarioTenant } from "../types";

export interface EditarUsuarioDialogProps {
  usuario: UsuarioTenant;
}

/** Mensaje de error legible, sin loguear ni exponer nada que no sea `messages`. */
function mensajeDeError(err: unknown): string {
  if (err instanceof ApiError) return err.messages.join(" ");
  return "Ocurrió un error inesperado. Intentá de nuevo.";
}

export function EditarUsuarioDialog({ usuario }: EditarUsuarioDialogProps) {
  const [open, setOpen] = useState(false);
  const identidadMutation = useEditarUsuarioTenant(usuario.id);
  const passwordMutation = useResetearPasswordUsuarioTenant(usuario.id);
  const tfaMutation = useResetearTfaUsuarioTenant(usuario.id);
  const defaults: EditarUsuarioFormValues = {
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    password: "",
    repetirPassword: "",
  };
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditarUsuarioFormValues>({
    resolver: zodResolver(editarUsuarioSchema),
    defaultValues: defaults,
  });

  async function submit(values: EditarUsuarioFormValues) {
    const identidadCambio = values.nombre !== usuario.nombre || values.apellido !== usuario.apellido;
    const quierePassword = values.password !== "";

    if (identidadCambio) {
      try {
        await identidadMutation.mutateAsync({ nombre: values.nombre, apellido: values.apellido });
      } catch (err) {
        // Corte (ADR-3): identidad falló, el reset NUNCA se emite.
        const mensaje = mensajeDeError(err);
        toast.error(
          quierePassword
            ? `${mensaje} No se guardó nada: la contraseña tampoco se cambió.`
            : mensaje,
        );
        return;
      }
    }

    if (!quierePassword) {
      toast.success("Usuario actualizado.");
      setOpen(false);
      return;
    }

    try {
      await passwordMutation.mutateAsync({ password: values.password });
    } catch (err) {
      toast.error(
        `Se guardaron nombre y apellido, pero la contraseña NO se cambió: ${mensajeDeError(err)}`,
      );
      return;
    }

    toast.success("Usuario actualizado. Contraseña restablecida: las sesiones del usuario se cerraron.");
    setOpen(false);
  }

  function resetearTfa() {
    tfaMutation.mutate(undefined, {
      onSuccess: () => toast.success("2FA reseteado. Deberá configurarlo de nuevo en su próximo ingreso si está obligado."),
      // Cualquier caso no permitido llega como 404: mensaje neutro, sin el motivo.
      onError: () => toast.error("No se pudo resetear el 2FA de este usuario."),
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

          <div className="flex flex-col gap-1">
            <label htmlFor="editar-usuario-password" className="text-sm font-medium text-foreground">
              Contraseña nueva
            </label>
            <Input
              id="editar-usuario-password"
              type="password"
              error={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p role="alert" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="editar-usuario-repetir-password"
              className="text-sm font-medium text-foreground"
            >
              Repetir contraseña
            </label>
            <Input
              id="editar-usuario-repetir-password"
              type="password"
              error={!!errors.repetirPassword}
              {...register("repetirPassword")}
            />
            {errors.repetirPassword && (
              <p role="alert" className="text-sm text-destructive">
                {errors.repetirPassword.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Dejá ambos campos vacíos para no cambiar la contraseña. Al establecer una nueva se
              cierran las sesiones activas del usuario.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="submit"
              isLoading={identidadMutation.isPending || passwordMutation.isPending}
            >
              Guardar
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-1 border-t border-white/10 pt-3">
          <ConfirmDialog
            trigger={
              <Button type="button" size="sm" variant="outline" className="self-start">
                Resetear 2FA
              </Button>
            }
            title="Resetear 2FA"
            description={`¿Confirmás resetear la verificación en dos pasos de "${usuario.nombre} ${usuario.apellido}"? Si su cliente o su rol lo obligan, tendrá que configurarla de nuevo en su próximo ingreso.`}
            confirmLabel="Resetear"
            confirmVariant="destructive"
            isConfirming={tfaMutation.isPending}
            onConfirm={resetearTfa}
          />
          <p className="text-xs text-muted-foreground">
            Usalo si perdió el celular y los códigos de recuperación.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
