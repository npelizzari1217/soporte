"use client";

/**
 * PesoTareaControl — fija el peso de una tarea de un ticket EXTERNA (odd/edilicia-obra-externa,
 * S4, S9). Valida contra lo que queda para esta tarea (100 menos el peso de las demás); el backend
 * repite la cuenta con el lock del ticket y su 422 llega como toast.
 *
 * Se resincroniza cuando el peso guardado cambia (otra edición, o la respuesta de la propia), así
 * el campo nunca muestra un valor que no es el vigente.
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pesoTareaSchema, type PesoTareaFormValues } from "../schemas";

export interface PesoTareaControlProps {
  tareaId: string;
  descripcion: string;
  /** Peso guardado de la tarea. */
  peso: number;
  /** Peso máximo que admite esta tarea sin pasar el tope del ticket. */
  disponible: number;
  onGuardar: (peso: number) => void;
  isPending: boolean;
}

/**
 * @param props Ver `PesoTareaControlProps`.
 * @returns Campo de peso con su botón y su error.
 */
export function PesoTareaControl({
  tareaId,
  descripcion,
  peso,
  disponible,
  onGuardar,
  isPending,
}: PesoTareaControlProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PesoTareaFormValues>({
    resolver: zodResolver(pesoTareaSchema(disponible)),
    defaultValues: { peso },
  });

  useEffect(() => {
    reset({ peso });
  }, [peso, reset]);

  const id = `peso-tarea-${tareaId}`;
  return (
    <form
      onSubmit={handleSubmit((values) => onGuardar(values.peso))}
      className="flex flex-col gap-0.5"
      noValidate
    >
      <div className="flex items-center gap-1">
        <label htmlFor={id} className="sr-only">
          Peso de la tarea {descripcion}
        </label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          step="1"
          min="0"
          max={disponible}
          className="w-20"
          error={!!errors.peso}
          {...register("peso")}
        />
        <span className="text-xs text-muted-foreground">%</span>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={!isDirty}
          isLoading={isPending}
        >
          Fijar
        </Button>
      </div>
      {errors.peso && (
        <p role="alert" className="text-xs text-destructive">
          {errors.peso.message}
        </p>
      )}
    </form>
  );
}
