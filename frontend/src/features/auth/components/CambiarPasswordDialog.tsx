"use client";

/**
 * CambiarPasswordDialog — diálogo de cambio de contraseña propio (WU4).
 *
 * El aviso de que TODAS las sesiones se cierran (incluida esta) es texto fijo
 * y visible ANTES de confirmar — el usuario acepta la expulsión sabiendo que
 * viene, no la descubre después (design D6 / reconciliación #2409).
 *
 * `repetirPassword` es SOLO del cliente (`cambiarPasswordSchema`): nunca se
 * envía al backend, que recibe exactamente `{ passwordActual, passwordNueva }`.
 *
 * Manejo de respuesta del BFF `POST /api/auth/change-password`:
 * - 204 → el BFF ya limpió las cookies (proxy transparente, WU3). Navega a
 *   `/login?motivo=password-cambiada` con `router.replace` (no `push`): no
 *   tiene sentido volver atrás a un dashboard sin sesión.
 * - 422 → error de negocio (`AUTH_PASSWORD_ACTUAL_INCORRECTA` |
 *   `AUTH_PASSWORD_NUEVA_IGUAL`, D4/reconciliación #2409 punto 1): se muestra
 *   DENTRO del campo correspondiente vía `setError`, el diálogo NO se cierra
 *   y la sesión sigue viva.
 * - 403 / 400 / 502 (u otro no mapeado): error general legible, formulario
 *   abierto.
 *
 * Spec: sdd/cambio-de-contrasena — WU4, design §"Frontend — detalle".
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import { cambiarPasswordSchema, type CambiarPasswordFormValues } from "../schemas";

interface CambiarPasswordDto {
  passwordActual: string;
  passwordNueva: string;
}

/** Códigos de error de negocio (D4) → campo del formulario donde se muestran. */
const CODIGO_A_CAMPO: Record<string, "passwordActual" | "passwordNueva"> = {
  AUTH_PASSWORD_ACTUAL_INCORRECTA: "passwordActual",
  AUTH_PASSWORD_NUEVA_IGUAL: "passwordNueva",
};

function codigoDeError(err: ApiError): string | undefined {
  const raw = err.raw;
  if (typeof raw !== "object" || raw === null) return undefined;
  const codigo = (raw as { error?: unknown }).error;
  return typeof codigo === "string" ? codigo : undefined;
}

export function CambiarPasswordDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CambiarPasswordFormValues>({
    resolver: zodResolver(cambiarPasswordSchema),
    defaultValues: { passwordActual: "", passwordNueva: "", repetirPassword: "" },
  });

  const mutation = useMutation<void, ApiError, CambiarPasswordDto>({
    mutationFn: (dto) => apiFetch<void>("auth/change-password", { method: "POST", json: dto }),
    onSuccess: () => {
      router.replace("/login?motivo=password-cambiada");
    },
    onError: (err) => {
      const campo = err instanceof ApiError ? CODIGO_A_CAMPO[codigoDeError(err) ?? ""] : undefined;
      if (campo) {
        setError(campo, { message: err.message });
        return;
      }
      setErrorGeneral(err.message);
    },
  });

  function submit(values: CambiarPasswordFormValues) {
    setErrorGeneral(null);
    mutation.mutate({ passwordActual: values.passwordActual, passwordNueva: values.passwordNueva });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setErrorGeneral(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Cambiar contraseña
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
            Al confirmar se van a cerrar todas tus sesiones activas, incluida esta. Vas a tener
            que volver a iniciar sesión con la nueva contraseña.
          </p>

          <div className="flex flex-col gap-1">
            <label htmlFor="password-actual" className="text-sm font-medium text-foreground">
              Contraseña actual
            </label>
            <Input
              id="password-actual"
              type="password"
              error={!!errors.passwordActual}
              {...register("passwordActual")}
            />
            {errors.passwordActual && (
              <p role="alert" className="text-sm text-destructive">
                {errors.passwordActual.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password-nueva" className="text-sm font-medium text-foreground">
              Nueva contraseña
            </label>
            <Input
              id="password-nueva"
              type="password"
              error={!!errors.passwordNueva}
              {...register("passwordNueva")}
            />
            {errors.passwordNueva && (
              <p role="alert" className="text-sm text-destructive">
                {errors.passwordNueva.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password-repetir" className="text-sm font-medium text-foreground">
              Repetir nueva contraseña
            </label>
            <Input
              id="password-repetir"
              type="password"
              error={!!errors.repetirPassword}
              {...register("repetirPassword")}
            />
            {errors.repetirPassword && (
              <p role="alert" className="text-sm text-destructive">
                {errors.repetirPassword.message}
              </p>
            )}
          </div>

          {errorGeneral && (
            <p role="alert" className="text-sm text-destructive">
              {errorGeneral}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={mutation.isPending}>
              Cambiar contraseña
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
