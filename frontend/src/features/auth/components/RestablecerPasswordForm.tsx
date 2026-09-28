"use client";

/**
 * RestablecerPasswordForm — PRESENTATIONAL component.
 *
 * Valida localmente el largo mínimo y la igualdad de las dos contraseñas
 * antes de enviar (Req 14). Mismo patrón de campos que
 * `CambiarPasswordDialog`, pero sin "contraseña actual": acá no hay una
 * contraseña vigente que pedir, la posesión del token ES la autorización
 * (design ADR-1, "Autorización").
 *
 * Recibe todo el comportamiento por props — sin mutaciones, sin routing, sin
 * llamadas a la API. La página `(auth)/restablecer-password/page.tsx` la usa
 * con `use-restablecer-password` (container).
 *
 * Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
 * flujo completo de self-service", escenario "La confirmación valida antes
 * de enviar". Design ADR-8, "Componentes".
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restablecerPasswordSchema, type RestablecerPasswordFormValues } from "../schemas";

interface RestablecerPasswordFormProps {
  onSubmit: (values: RestablecerPasswordFormValues) => void;
  isLoading: boolean;
}

export function RestablecerPasswordForm({ onSubmit, isLoading }: RestablecerPasswordFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RestablecerPasswordFormValues>({ resolver: zodResolver(restablecerPasswordSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password-nueva" className="text-sm font-medium text-foreground">
          Nueva contraseña
        </label>
        <Input
          id="password-nueva"
          type="password"
          autoComplete="new-password"
          disabled={isLoading}
          placeholder="••••••••"
          error={!!errors.passwordNueva}
          {...register("passwordNueva")}
        />
        {errors.passwordNueva && (
          <p role="alert" className="text-sm text-destructive">
            {errors.passwordNueva.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password-repetir" className="text-sm font-medium text-foreground">
          Repetir nueva contraseña
        </label>
        <Input
          id="password-repetir"
          type="password"
          autoComplete="new-password"
          disabled={isLoading}
          placeholder="••••••••"
          error={!!errors.repetirPassword}
          {...register("repetirPassword")}
        />
        {errors.repetirPassword && (
          <p role="alert" className="text-sm text-destructive">
            {errors.repetirPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={isLoading} className="w-full">
        Restablecer contraseña
      </Button>
    </form>
  );
}
