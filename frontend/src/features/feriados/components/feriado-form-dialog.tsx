"use client";

/**
 * FeriadoFormDialog — crear/editar un feriado, GLOBAL (`/feriados`,
 * ROOT-only) o de CLIENTE (`/feriados-cliente`, ADMINISTRADOR-only, WU8b) —
 * generalizado vía inyección de HOOKS de mutación (no una mutación ya
 * instanciada): `useCrearMutation`/`useEditarMutation` se llaman DENTRO de
 * este componente para respetar las reglas de hooks (cada fila monta su
 * propia instancia, con su propio hook de editar ligado a `feriado.id`).
 * `FeriadosGlobalesAdminView` (WU7b) y `FeriadosListView` (WU8b) pasan sus
 * propios hooks de `../hooks/*`. Mismo patrón que `CicloVigenteFormDialog`:
 * RHF/zod, un solo componente para crear y editar. `feriadoSchema` valida
 * FORMATO; fecha real y duplicados los valida el backend, 422 vía
 * `notifyError` (`onError` del hook inyectado).
 *
 * Apertura: por defecto NO controlada (`trigger` + estado interno, uso
 * histórico de ambas pantallas). `FeriadosListView` (WU2b, almanaque) además
 * necesita abrir el alta programáticamente al clickear un día libre, con la
 * fecha precargada — para eso, `open`/`onOpenChange` la vuelven controlada
 * (mismo par que `Dialog` de Radix) y `fechaInicial` precarga `fecha` en modo
 * creación. `trigger` pasa a opcional: la instancia controlada del almanaque
 * no tiene disparador propio, la abre `onDiaLibre`.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { feriadoSchema, type FeriadoFormValues } from "../schemas";

/** Shape mínimo que necesita el diálogo — `Feriado` y `FeriadoCliente` lo cumplen ambos. */
export interface FeriadoBasico {
  id: string;
  fecha: string;
  descripcion: string;
}

export interface FeriadoFormDialogProps {
  /** Sin `trigger`, el diálogo no dibuja disparador propio — se abre solo vía `open`. */
  trigger?: ReactNode;
  feriado?: FeriadoBasico;
  /** Precarga `fecha` en modo creación (ignorado si `feriado` está presente). */
  fechaInicial?: string;
  /** Con `open`/`onOpenChange`, la apertura queda controlada por quien monta el diálogo. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  useCrearMutation: () => UseMutationResult<unknown, unknown, FeriadoFormValues>;
  useEditarMutation: (id: string) => UseMutationResult<unknown, unknown, FeriadoFormValues>;
}

export function FeriadoFormDialog({
  trigger,
  feriado,
  fechaInicial,
  open: openControlado,
  onOpenChange: onOpenChangeProp,
  useCrearMutation,
  useEditarMutation,
}: FeriadoFormDialogProps) {
  const [openInterno, setOpenInterno] = useState(false);
  const open = openControlado ?? openInterno;
  const isEdit = !!feriado;
  const crearMutation = useCrearMutation();
  const editarMutation = useEditarMutation(feriado?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render, mismo criterio que `CicloVigenteFormDialog`:
  // el reset de apertura inyecta el dato vigente aunque el diálogo lleve
  // montado desde el primer pintado de la tabla.
  const valoresVigentes: FeriadoFormValues = feriado
    ? { fecha: feriado.fecha, descripcion: feriado.descripcion }
    : { fecha: fechaInicial ?? "", descripcion: "" };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FeriadoFormValues>({
    resolver: zodResolver(feriadoSchema),
    defaultValues: valoresVigentes,
  });

  // Dispara en CUALQUIER apertura, incluida la programática (el `open` pasa
  // de `false` a `true` por afuera, sin pasar por `onOpenChange` de Radix —
  // Radix solo lo llama ante una interacción propia: trigger, ESC, overlay).
  useEffect(() => {
    if (open) reset(valoresVigentes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function cambiarApertura(next: boolean): void {
    if (openControlado === undefined) setOpenInterno(next);
    onOpenChangeProp?.(next);
  }

  function submit(values: FeriadoFormValues) {
    mutation.mutate(
      { fecha: values.fecha, descripcion: values.descripcion },
      {
        onSuccess: () => {
          cambiarApertura(false);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar feriado" : "Nuevo feriado"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="feriado-fecha" className="text-sm font-medium text-foreground">
              Fecha
            </label>
            <Input id="feriado-fecha" type="date" error={!!errors.fecha} {...register("fecha")} />
            {errors.fecha && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fecha.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="feriado-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Input id="feriado-descripcion" error={!!errors.descripcion} {...register("descripcion")} />
            {errors.descripcion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.descripcion.message}
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
