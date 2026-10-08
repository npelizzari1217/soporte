"use client";

/**
 * DesafioTfaForm — PRESENTATIONAL component del segundo paso del login.
 *
 * Pide el código de la app autenticadora (6 dígitos) o un código de recuperación. No hay casilla
 * para recordar el dispositivo: el backend lo confía solo al verificar (salvo ROOT, que ve el
 * código siempre). El error lo comunica el container (toast); este componente no hace llamadas.
 *
 * Spec: sdd/verificacion-dos-pasos — L6, D4.
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { codigoDesafioSchema, type CodigoDesafioFormValues } from "../schemas";

interface DesafioTfaFormProps {
  onSubmit: (values: CodigoDesafioFormValues) => void;
  isLoading: boolean;
}

export function DesafioTfaForm({ onSubmit, isLoading }: DesafioTfaFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CodigoDesafioFormValues>({
    resolver: zodResolver(codigoDesafioSchema),
    defaultValues: { codigo: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="codigo" className="text-sm font-medium text-foreground">
          Código de verificación
        </label>
        <Input
          id="codigo"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          disabled={isLoading}
          placeholder="123456"
          error={!!errors.codigo}
          {...register("codigo")}
        />
        <p className="text-xs text-muted-foreground">
          Ingresá el código de tu app autenticadora, o un código de recuperación (XXXX-XXXX-XXXX).
        </p>
        {errors.codigo && (
          <p role="alert" className="text-sm text-destructive">
            {errors.codigo.message}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={isLoading} className="w-full">
        Verificar
      </Button>
    </form>
  );
}
