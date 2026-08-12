"use client";

/**
 * AdoptarCicloForm — PRESENTATIONAL. Adopta un ciclo del catálogo master
 * (T4.5) eligiéndolo de un selector poblado por `GET /ciclos-vigentes`
 * (item 4 backend-gaps — cierra G6, antes UUID de texto libre).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { adoptarCicloSchema, type AdoptarCicloFormValues } from "../schemas";
import { useAdoptarCiclo } from "../hooks/use-ciclos-mutations";
import { useCiclosVigentes } from "../hooks/use-ciclos-vigentes";

export interface AdoptarCicloFormProps {
  /** Se llama tras un alta exitosa, además del reset del form (ej. cerrar el modal contenedor). */
  onSuccess?: () => void;
}

export function AdoptarCicloForm({ onSuccess }: AdoptarCicloFormProps = {}) {
  const mutation = useAdoptarCiclo();
  const ciclosVigentesQuery = useCiclosVigentes();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdoptarCicloFormValues>({ resolver: zodResolver(adoptarCicloSchema), defaultValues: { cicloVigenteId: "" } });

  function submit(values: AdoptarCicloFormValues) {
    mutation.mutate(values.cicloVigenteId, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} noValidate className="flex items-end gap-2 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="ciclo-vigente-id" className="text-sm font-medium text-foreground">
          Adoptar ciclo (catálogo master)
        </label>
        <Select id="ciclo-vigente-id" defaultValue="" error={!!errors.cicloVigenteId} {...register("cicloVigenteId")}>
          <option value="" disabled>
            {ciclosVigentesQuery.isLoading ? "Cargando ciclos…" : "Elegí un ciclo"}
          </option>
          {(ciclosVigentesQuery.data ?? []).map((ciclo) => (
            <option key={ciclo.id} value={ciclo.id}>
              {ciclo.nombre}
            </option>
          ))}
        </Select>
        {errors.cicloVigenteId && (
          <p role="alert" className="text-xs text-destructive">
            {errors.cicloVigenteId.message}
          </p>
        )}
      </div>
      <Button type="submit" isLoading={mutation.isPending}>
        Adoptar
      </Button>
    </form>
  );
}
