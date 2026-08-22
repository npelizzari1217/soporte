"use client";

/**
 * EncuestaForm — PRESENTATIONAL. Recibe todo el comportamiento por props —
 * sin fetch, sin mutación, sin routing (Container/Presentational, mismo
 * criterio que `LoginForm`).
 *
 * Ref spec: sdd/csat/spec. Tarea: 8.2.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StarRating } from "./star-rating";
import { encuestaSchema, type EncuestaFormValues } from "../schemas";

export interface EncuestaFormProps {
  onSubmit: (values: EncuestaFormValues) => void;
  isLoading: boolean;
}

export function EncuestaForm({ onSubmit, isLoading }: EncuestaFormProps) {
  const {
    handleSubmit,
    register,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EncuestaFormValues>({ resolver: zodResolver(encuestaSchema) });

  const puntaje = watch("puntaje") ?? null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          ¿Cómo calificarías la atención recibida?
        </span>
        <StarRating
          value={puntaje}
          onChange={(nuevoPuntaje) => setValue("puntaje", nuevoPuntaje, { shouldValidate: true })}
          disabled={isLoading}
        />
        {errors.puntaje && (
          <p role="alert" className="text-sm text-destructive">
            {errors.puntaje.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="comentario" className="text-sm font-medium text-foreground">
          Comentario (opcional)
        </label>
        <Textarea
          id="comentario"
          disabled={isLoading}
          placeholder="Contanos más sobre tu experiencia"
          error={!!errors.comentario}
          {...register("comentario")}
        />
        {errors.comentario && (
          <p role="alert" className="text-sm text-destructive">
            {errors.comentario.message}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={isLoading} className="w-full">
        Enviar respuesta
      </Button>
    </form>
  );
}
