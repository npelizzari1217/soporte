"use client";

/**
 * LoginForm — PRESENTATIONAL component.
 *
 * Receives all behavior via props — no mutations, no routing, no API calls.
 * Wired by the login page which uses the `use-login` hook (Container/
 * Presentational pattern).
 *
 * Spec: PR11 — LoginForm (react-hook-form + zod). El link "¿Olvidaste tu
 * contraseña?" es estático (sdd/reseteo-contrasena-olvidada, WU-11): apunta a
 * `/olvide-password`, ruta pública agregada a `RUTAS_PUBLICAS` en el mismo WU.
 */

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, KeyRound, Mail } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginSchema, type LoginFormValues } from "../schemas";

interface LoginFormProps {
  onSubmit: (values: LoginFormValues) => void;
  isLoading: boolean;
}

export function LoginForm({ onSubmit, isLoading }: LoginFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });
  const [verPassword, setVerPassword] = useState(false);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
          Email
        </label>
        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            disabled={isLoading}
            placeholder="nombre@empresa.com"
            error={!!errors.email}
            className="h-11 pl-10"
            {...register("email")}
          />
        </div>
        {errors.email && (
          <p role="alert" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Contraseña
        </label>
        <div className="relative">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            type={verPassword ? "text" : "password"}
            autoComplete="current-password"
            disabled={isLoading}
            placeholder="Su contraseña"
            error={!!errors.password}
            className="h-11 pl-10 pr-10"
            {...register("password")}
          />
          {/* Permite revisar lo tipeado antes de enviar; no altera el valor del campo. */}
          <button
            type="button"
            onClick={() => setVerPassword((visible) => !visible)}
            aria-label={verPassword ? "Ocultar la clave" : "Mostrar la clave"}
            aria-pressed={verPassword}
            disabled={isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {verPassword ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
        {errors.password && (
          <p role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
        <Link
          href="/olvide-password"
          className="self-end text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ¿Olvidó su contraseña?
        </Link>
      </div>

      <Button
        type="submit"
        isLoading={isLoading}
        className="mt-2 h-11 w-full rounded-full bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-lg shadow-blue-600/25 hover:from-blue-600 hover:to-blue-800"
      >
        Iniciar sesión
      </Button>
    </form>
  );
}
