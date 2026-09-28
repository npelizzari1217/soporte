"use client";

/**
 * SolicitarResetForm — PRESENTATIONAL component.
 *
 * Pide el email para iniciar el reset por olvido (`/olvide-password`). No
 * distingue si el email existe o no: eso lo resuelve el backend (Req 1) y el
 * mensaje posterior, que siempre es el mismo (`use-solicitar-reset`,
 * `MENSAJE_SOLICITUD_RESET`) — este componente solo valida el formato local
 * del email antes de enviar.
 *
 * Recibe todo el comportamiento por props — sin mutaciones, sin routing, sin
 * llamadas a la API. La página `(auth)/olvide-password/page.tsx` la usa con
 * `use-solicitar-reset` (container).
 *
 * Spec: sdd/reseteo-contrasena-olvidada — Requirement "El frontend ofrece el
 * flujo completo de self-service", escenario "La solicitud muestra el mismo
 * mensaje siempre". Design ADR-8, "Componentes".
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { solicitarResetSchema, type SolicitarResetFormValues } from "../schemas";

interface SolicitarResetFormProps {
  onSubmit: (values: SolicitarResetFormValues) => void;
  isLoading: boolean;
}

export function SolicitarResetForm({ onSubmit, isLoading }: SolicitarResetFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SolicitarResetFormValues>({ resolver: zodResolver(solicitarResetSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          disabled={isLoading}
          placeholder="tu@email.com"
          error={!!errors.email}
          {...register("email")}
        />
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={isLoading} className="w-full">
        Enviar link de recuperación
      </Button>
    </form>
  );
}
