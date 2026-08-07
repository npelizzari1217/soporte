"use client";

/**
 * TicketCreateForm — PRESENTATIONAL. Form de creación (R-M1 / T1.8):
 * título/descripción/tipo/prioridad + referencia opcional ("Continúa de
 * #X"). Gate `ticket:crear` lo aplica el caller (`TicketCreateView`).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { crearTicketSchema, type CrearTicketFormValues } from "../schemas";
import type { CrearTicketDto, Prioridad, TipoTicket } from "../types";

export interface TicketCreateFormProps {
  tipos: TipoTicket[];
  prioridades: Prioridad[];
  onSubmit: (dto: CrearTicketDto) => void;
  isSubmitting: boolean;
}

export function TicketCreateForm({ tipos, prioridades, onSubmit, isSubmitting }: TicketCreateFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearTicketFormValues>({ resolver: zodResolver(crearTicketSchema) });

  function submit(values: CrearTicketFormValues) {
    // El backend exige @IsUUID en ticketReferenciaId cuando está presente —
    // un string vacío del form (campo opcional sin elegir) NUNCA debe viajar.
    onSubmit({
      titulo: values.titulo,
      descripcion: values.descripcion || undefined,
      tipoId: values.tipoId,
      prioridadId: values.prioridadId,
      ticketReferenciaId: values.ticketReferenciaId || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="crear-titulo" className="text-sm font-medium text-foreground">
          Título
        </label>
        <Input id="crear-titulo" error={!!errors.titulo} {...register("titulo")} />
        {errors.titulo && (
          <p role="alert" className="text-sm text-destructive">
            {errors.titulo.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="crear-descripcion" className="text-sm font-medium text-foreground">
          Descripción
        </label>
        <Textarea id="crear-descripcion" {...register("descripcion")} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="crear-tipo" className="text-sm font-medium text-foreground">
          Tipo
        </label>
        <Select id="crear-tipo" error={!!errors.tipoId} defaultValue="" {...register("tipoId")}>
          <option value="" disabled>
            Elegí un tipo
          </option>
          {tipos.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.nombre}
            </option>
          ))}
        </Select>
        {errors.tipoId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.tipoId.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="crear-prioridad" className="text-sm font-medium text-foreground">
          Prioridad
        </label>
        <Select id="crear-prioridad" error={!!errors.prioridadId} defaultValue="" {...register("prioridadId")}>
          <option value="" disabled>
            Elegí una prioridad
          </option>
          {prioridades.map((prioridad) => (
            <option key={prioridad.id} value={prioridad.id}>
              {prioridad.nombre}
            </option>
          ))}
        </Select>
        {errors.prioridadId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.prioridadId.message}
          </p>
        )}
      </div>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        Crear ticket
      </Button>
    </form>
  );
}
