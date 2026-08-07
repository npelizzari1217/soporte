"use client";

/**
 * SlaConfigRow — PRESENTATIONAL, una fila editable de `sla_config` (T4.4).
 * `horas` con validación cliente-side (zod, `min(1)` — espejo de `@Min(1)`
 * del backend, `HorasInvalidasError`); el backend re-valida de todos modos.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEditarSlaConfig } from "../hooks/use-sla-mutations";
import type { SlaConfig } from "../types";

const horasSchema = z.object({
  horas: z.coerce.number().int().min(1, "Debe ser mayor a 0"),
});
type HorasFormValues = z.infer<typeof horasSchema>;

export interface SlaConfigRowProps {
  config: SlaConfig;
  prioridadNombre: string;
}

export function SlaConfigRow({ config, prioridadNombre }: SlaConfigRowProps) {
  const mutation = useEditarSlaConfig(config.id);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HorasFormValues>({ resolver: zodResolver(horasSchema), defaultValues: { horas: config.horas } });

  function submit(values: HorasFormValues) {
    mutation.mutate({ horas: values.horas });
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
    >
      <span className="flex-1 text-sm font-medium text-foreground">{prioridadNombre}</span>
      <div className="flex flex-col gap-1">
        <label htmlFor={`sla-horas-${config.id}`} className="sr-only">
          {`Horas SLA ${prioridadNombre}`}
        </label>
        <Input
          id={`sla-horas-${config.id}`}
          aria-label={`Horas SLA ${prioridadNombre}`}
          type="number"
          className="w-24"
          error={!!errors.horas}
          {...register("horas")}
        />
        {errors.horas && (
          <p role="alert" className="text-xs text-destructive">
            {errors.horas.message}
          </p>
        )}
      </div>
      <Button type="submit" size="sm" isLoading={mutation.isPending}>
        Guardar
      </Button>
    </form>
  );
}
