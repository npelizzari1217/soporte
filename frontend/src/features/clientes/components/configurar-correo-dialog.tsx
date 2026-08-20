"use client";

/**
 * ConfigurarCorreoDialog — alta/edición de la configuración SMTP de UN
 * cliente (D7, sdd/configuracion-correo-por-cliente). Diálogo SEPARADO de
 * `EditarClienteDialog` a propósito: el backend separa `/correo` en rutas
 * propias para que la edición comercial y la de correo nunca compartan body.
 * Exclusivo ROOT (el caller ya gatea por `isGlobalAdmin`).
 *
 * Contrato de "secreto que nunca vuelve del servidor" (D7):
 * - La contraseña NUNCA llega en la respuesta (`ClienteCorreo` no tiene ese
 *   campo bajo ninguna forma). El input arranca SIEMPRE vacío, incluso al
 *   reabrir sobre un cliente ya configurado.
 * - Guardar con el campo vacío OMITE `password` del body (`|| undefined`,
 *   mismo idioma que `editar-cliente-dialog.tsx`) — el backend preserva la
 *   ciphertext existente. Mandar `""` está prohibido y ni siquiera se arma
 *   esa rama acá.
 * - Quitar la configuración es una acción EXPLÍCITA y separada (`DELETE`,
 *   detrás de `ConfirmDialog`) — vaciar el campo de contraseña NO borra nada.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useClienteCorreo } from "../hooks/use-clientes";
import {
  useConfigurarCorreoCliente,
  useProbarCorreoCliente,
  useQuitarCorreoCliente,
} from "../hooks/use-clientes-mutations";
import { configurarCorreoSchema, type ConfigurarCorreoFormValues } from "../schemas";
import type { Cliente } from "../types";

export interface ConfigurarCorreoDialogProps {
  cliente: Cliente;
}

/** Fecha corta + hora — mismo formato local que el resto del repo (sin util compartido, ver `compra-bitacora-section.tsx`). */
function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

const VALORES_VACIOS: ConfigurarCorreoFormValues = {
  host: "",
  port: 587,
  user: "",
  secure: true,
  from: "",
  password: "",
};

export function ConfigurarCorreoDialog({ cliente }: ConfigurarCorreoDialogProps) {
  const [open, setOpen] = useState(false);
  const correoQuery = useClienteCorreo(cliente.id, open);
  const configurarMutation = useConfigurarCorreoCliente(cliente.id);
  const probarMutation = useProbarCorreoCliente(cliente.id);
  const quitarMutation = useQuitarCorreoCliente(cliente.id);

  const yaConfigurado = correoQuery.data?.configurado ?? false;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ConfigurarCorreoFormValues>({
    resolver: zodResolver(configurarCorreoSchema(yaConfigurado)),
    defaultValues: VALORES_VACIOS,
  });

  // Al llegar el detalle, prellená host/puerto/usuario/remitente/secure — la
  // contraseña NUNCA se prellena (no viaja en la respuesta, D7).
  useEffect(() => {
    if (correoQuery.data) {
      reset({
        host: correoQuery.data.host ?? "",
        port: correoQuery.data.port ?? 587,
        user: correoQuery.data.user ?? "",
        secure: correoQuery.data.secure ?? true,
        from: correoQuery.data.from ?? "",
        password: "",
      });
    }
  }, [correoQuery.data, reset]);

  function submit(values: ConfigurarCorreoFormValues) {
    configurarMutation.mutate({
      host: values.host,
      port: values.port,
      user: values.user,
      secure: values.secure,
      from: values.from,
      // Campo vacío ⇒ NO se manda `password`: preserva la contraseña ya
      // guardada. Nunca `""` — el backend la rechaza a propósito (D7).
      password: values.password || undefined,
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset(VALORES_VACIOS);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Correo de ${cliente.nombre}`}>
          <Mail className="h-4 w-4" aria-hidden="true" />
          Correo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración de correo — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          {yaConfigurado ? (
            <Badge variant="success">Correo configurado</Badge>
          ) : (
            <Badge variant="outline">Correo no configurado</Badge>
          )}
          {yaConfigurado && correoQuery.data?.verificadoAt && !correoQuery.data.verificacionError && (
            <span className="text-xs text-muted-foreground">
              Verificado el {formatFecha(correoQuery.data.verificadoAt)}
            </span>
          )}
          {yaConfigurado && correoQuery.data?.verificacionError && (
            <span className="text-xs text-destructive">
              Verificación fallida: {correoQuery.data.verificacionError}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="correo-host" className="text-sm font-medium text-foreground">
              Host
            </label>
            <Input id="correo-host" error={!!errors.host} {...register("host")} />
            {errors.host && (
              <p role="alert" className="text-sm text-destructive">
                {errors.host.message}
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="correo-port" className="text-sm font-medium text-foreground">
                Puerto
              </label>
              <Input id="correo-port" type="number" error={!!errors.port} {...register("port")} />
              {errors.port && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.port.message}
                </p>
              )}
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
              <Checkbox
                checked={watch("secure")}
                onCheckedChange={(checked) => setValue("secure", checked === true)}
              />
              TLS/SSL
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="correo-user" className="text-sm font-medium text-foreground">
              Usuario
            </label>
            <Input id="correo-user" error={!!errors.user} {...register("user")} />
            {errors.user && (
              <p role="alert" className="text-sm text-destructive">
                {errors.user.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="correo-from" className="text-sm font-medium text-foreground">
              Remitente
            </label>
            <Input id="correo-from" error={!!errors.from} {...register("from")} />
            {errors.from && (
              <p role="alert" className="text-sm text-destructive">
                {errors.from.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="correo-password" className="text-sm font-medium text-foreground">
              Contraseña{yaConfigurado ? " (opcional)" : ""}
            </label>
            <Input
              id="correo-password"
              type="password"
              autoComplete="new-password"
              error={!!errors.password}
              {...register("password")}
            />
            <p className="text-xs text-muted-foreground">
              {yaConfigurado ? "Dejalo vacío para no cambiarla." : "Requerida para la primera configuración."}
            </p>
            {errors.password && (
              <p role="alert" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {yaConfigurado ? (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="destructive" size="sm">
                    Quitar configuración
                  </Button>
                }
                title="Quitar configuración de correo"
                description={`¿Confirmás quitar la configuración de correo de "${cliente.nombre}"? El cliente dejará de recibir notificaciones por correo hasta que se configure de nuevo.`}
                confirmLabel="Quitar"
                confirmVariant="destructive"
                isConfirming={quitarMutation.isPending}
                onConfirm={() => quitarMutation.mutate()}
              />
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {yaConfigurado && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={probarMutation.isPending}
                  onClick={() => probarMutation.mutate()}
                >
                  Probar conexión
                </Button>
              )}
              <Button type="submit" isLoading={configurarMutation.isPending}>
                Guardar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
