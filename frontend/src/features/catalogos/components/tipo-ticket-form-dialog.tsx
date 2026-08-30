"use client";

/**
 * TipoTicketFormDialog — crear/editar un `TipoTicket` (T4.2). Modal genérico
 * (`components/ui/dialog.tsx`) + RHF/zod, mismo patrón que `KbArticuloForm`
 * pero en un `Dialog` (no página completa) — la tabla de tipos vive en una
 * sola pantalla con acciones inline, no una ruta por tipo.
 */
import { useState } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MODULOS } from "@/shared/auth/modulo-access";
import { useCrearTipoTicket, useEditarTipoTicket } from "../hooks/use-catalogo-mutations";
import { tipoTicketSchema, type TipoTicketFormValues } from "../schemas";
import type { TipoTicket } from "@/features/tickets/types";

export interface TipoTicketFormDialogProps {
  trigger: ReactNode;
  tipo?: TipoTicket;
}

export function TipoTicketFormDialog({ trigger, tipo }: TipoTicketFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!tipo;
  const crearMutation = useCrearTipoTicket();
  const editarMutation = useEditarTipoTicket(tipo?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el reset de apertura inyecta el dato vigente
  // aunque el diálogo lleve montado desde el primer pintado de la tabla.
  // El placeholder "" de `modulo` en la rama de alta es un módulo INVÁLIDO A
  // PROPÓSITO: el schema lo rechaza con "El módulo es requerido"
  // (catalogos/schemas.ts). Va explícito, y no ausente, porque si la clave
  // falta RHF adopta el valor actual del <select> en vez de limpiarlo — acá
  // es el único de los cuatro diálogos con un <Select> de valor no
  // controlado (D1b).
  const valoresVigentes: DefaultValues<TipoTicketFormValues> = tipo
    ? { codigo: tipo.codigo, nombre: tipo.nombre, modulo: tipo.modulo }
    : { codigo: "", nombre: "", modulo: "" as TipoTicketFormValues["modulo"] };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TipoTicketFormValues>({
    resolver: zodResolver(tipoTicketSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: TipoTicketFormValues) {
    mutation.mutate(values, {
      onSuccess: () => {
        setOpen(false);
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(valoresVigentes);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tipo de ticket" : "Nuevo tipo de ticket"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-codigo" className="text-sm font-medium text-foreground">
              Código
            </label>
            <Input id="tipo-codigo" error={!!errors.codigo} {...register("codigo")} />
            {errors.codigo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.codigo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="tipo-nombre" error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-sm text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="tipo-modulo" className="text-sm font-medium text-foreground">
              Módulo
            </label>
            <Select
              id="tipo-modulo"
              error={!!errors.modulo}
              {...register("modulo")}
            >
              <option value="" disabled>
                Elegí un módulo
              </option>
              {MODULOS.map((modulo) => (
                <option key={modulo} value={modulo}>
                  {modulo}
                </option>
              ))}
            </Select>
            {errors.modulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.modulo.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={mutation.isPending}>
              {isEdit ? "Guardar" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
