"use client";

/**
 * PedidoPublicoForm — PRESENTATIONAL. Datos del solicitante externo y del pedido; valida con
 * `pedidoPublicoSchema` (límites del DTO del backend). Todo el comportamiento llega por props.
 *
 * Ref spec: sdd/formulario-publico-qr, pedido-publico. Tarea: 16.3.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { pedidoPublicoSchema, type PedidoPublicoFormValues } from "../schemas";

interface PedidoPublicoFormProps {
  onSubmit: (values: PedidoPublicoFormValues) => void;
  isLoading: boolean;
}

function Campo({ id, etiqueta, error, children }: { id: string; etiqueta: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {etiqueta}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function PedidoPublicoForm({ onSubmit, isLoading }: PedidoPublicoFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PedidoPublicoFormValues>({ resolver: zodResolver(pedidoPublicoSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Campo id="nombre" etiqueta="Tu nombre" error={errors.nombre?.message}>
        <Input id="nombre" autoComplete="name" disabled={isLoading} error={!!errors.nombre} {...register("nombre")} />
      </Campo>
      <Campo id="email" etiqueta="Tu email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" disabled={isLoading} error={!!errors.email} {...register("email")} />
      </Campo>
      <Campo id="telefono" etiqueta="Teléfono (opcional)" error={errors.telefono?.message}>
        <Input id="telefono" type="tel" autoComplete="tel" disabled={isLoading} error={!!errors.telefono} {...register("telefono")} />
      </Campo>
      <Campo id="titulo" etiqueta="Asunto" error={errors.titulo?.message}>
        <Input id="titulo" disabled={isLoading} error={!!errors.titulo} {...register("titulo")} />
      </Campo>
      <Campo id="descripcion" etiqueta="¿Qué pasa?" error={errors.descripcion?.message}>
        <Textarea id="descripcion" rows={5} disabled={isLoading} error={!!errors.descripcion} {...register("descripcion")} />
      </Campo>
      <Button type="submit" isLoading={isLoading} className="w-full">
        Enviar pedido
      </Button>
    </form>
  );
}
