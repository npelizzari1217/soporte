"use client";

/**
 * CrearTipoComponenteForm — PRESENTATIONAL. Alta de un tipo de componente en
 * el catálogo master (PR5, sdd/tipos-componente-master, `POST
 * /tipos-componente`). Envuelto por `CrearTipoComponenteDialog` (modal,
 * feat/ui-premium-educandow) — mismo patrón que `AdoptarCicloForm`/
 * `AdoptarCicloDialog` (`features/ciclos`).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { crearTipoComponenteSchema, type CrearTipoComponenteFormValues } from "../schemas";
import { useCrearTipoComponente } from "../hooks/use-tipos-componente";

export interface CrearTipoComponenteFormProps {
  /** Se llama tras un alta exitosa, además del reset del form (ej. cerrar el modal contenedor). */
  onSuccess?: () => void;
}

export function CrearTipoComponenteForm({ onSuccess }: CrearTipoComponenteFormProps = {}) {
  const mutation = useCrearTipoComponente();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearTipoComponenteFormValues>({
    resolver: zodResolver(crearTipoComponenteSchema),
    defaultValues: { codigo: "", nombre: "" },
  });

  function submit(values: CrearTipoComponenteFormValues) {
    mutation.mutate(values, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      noValidate
      className="flex items-end gap-2 rounded-lg border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="tipo-componente-codigo" className="text-sm font-medium text-foreground">
          Código
        </label>
        <Input id="tipo-componente-codigo" error={!!errors.codigo} {...register("codigo")} />
        {errors.codigo && (
          <p role="alert" className="text-xs text-destructive">
            {errors.codigo.message}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor="tipo-componente-nombre" className="text-sm font-medium text-foreground">
          Nombre
        </label>
        <Input id="tipo-componente-nombre" error={!!errors.nombre} {...register("nombre")} />
        {errors.nombre && (
          <p role="alert" className="text-xs text-destructive">
            {errors.nombre.message}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={mutation.isPending}>
        Crear
      </Button>
    </form>
  );
}
