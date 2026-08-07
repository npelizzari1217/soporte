"use client";

/**
 * TicketEditForm — PRESENTATIONAL, gated por `ticket:editar` a nivel de
 * caller (`TicketDetailView` decide si montarlo, vía `<Can>`). Edita
 * titulo/descripcion/prioridadId — el `estado` NUNCA se edita acá (backend:
 * `EditTicketDto` no acepta `estado`, endpoint dedicado).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { editarTicketSchema, type EditarTicketFormValues } from "../schemas";
import type { Prioridad } from "../types";

export interface TicketEditFormProps {
  defaultValues: EditarTicketFormValues;
  prioridades: Prioridad[];
  onSubmit: (values: EditarTicketFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function TicketEditForm({
  defaultValues,
  prioridades,
  onSubmit,
  onCancel,
  isSubmitting,
}: TicketEditFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditarTicketFormValues>({
    resolver: zodResolver(editarTicketSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="edit-titulo" className="text-sm font-medium text-foreground">
          Título
        </label>
        <Input id="edit-titulo" error={!!errors.titulo} {...register("titulo")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-descripcion" className="text-sm font-medium text-foreground">
          Descripción
        </label>
        <Textarea id="edit-descripcion" {...register("descripcion")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="edit-prioridad" className="text-sm font-medium text-foreground">
          Prioridad
        </label>
        <Select id="edit-prioridad" error={!!errors.prioridadId} {...register("prioridadId")}>
          {prioridades.map((prioridad) => (
            <option key={prioridad.id} value={prioridad.id}>
              {prioridad.nombre}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" isLoading={isSubmitting}>
          Guardar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
