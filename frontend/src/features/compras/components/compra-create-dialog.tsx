"use client";

/**
 * CompraCreateDialog — crear un ticket de compra (T5.2). Sin ruta dedicada
 * (ADR-1 solo lista `/compras`, `/compras/[id]`) — el alta es inline en la
 * lista, mismo patrón que `TipoTicketFormDialog` (B4).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { usePrioridades, useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { useCrearCompra } from "../hooks/use-compra-mutations";
import { crearCompraSchema, type CrearCompraFormValues } from "../schemas";

export function CompraCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const prioridadesQuery = usePrioridades();
  const tiposQuery = useTiposTicket();
  const crearMutation = useCrearCompra();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearCompraFormValues>({ resolver: zodResolver(crearCompraSchema) });

  function submit(values: CrearCompraFormValues) {
    crearMutation.mutate(
      {
        titulo: values.titulo,
        descripcion: values.descripcion || undefined,
        tipoId: values.tipoId,
        prioridadId: values.prioridadId,
      },
      {
        onSuccess: (compra) => {
          setOpen(false);
          reset();
          router.push(`/compras/${compra.ticketId}`);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Nuevo ticket de compra</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ticket de compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="compra-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="compra-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Textarea id="compra-descripcion" {...register("descripcion")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="compra-tipo" className="text-sm font-medium text-foreground">
              Tipo de compra
            </label>
            <Select id="compra-tipo" error={!!errors.tipoId} defaultValue="" {...register("tipoId")}>
              <option value="" disabled>
                Elegí un tipo de compra
              </option>
              {(tiposQuery.data ?? []).map((tipo) => (
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
            <label htmlFor="compra-prioridad" className="text-sm font-medium text-foreground">
              Prioridad
            </label>
            <Select id="compra-prioridad" error={!!errors.prioridadId} defaultValue="" {...register("prioridadId")}>
              <option value="" disabled>
                Elegí una prioridad
              </option>
              {(prioridadesQuery.data ?? []).map((prioridad) => (
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

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={crearMutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
