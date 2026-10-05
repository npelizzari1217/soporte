"use client";

/**
 * RespuestaPredefinidaFormDialog — crear/editar una respuesta predefinida. Mismo patrón que
 * `features/sectores/components/sector-form-dialog.tsx`.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCrearRespuestaPredefinida, useEditarRespuestaPredefinida } from "../hooks/use-respuesta-predefinida-mutations";
import { respuestaPredefinidaSchema, type RespuestaPredefinidaFormValues } from "../schemas";
import type { RespuestaPredefinida } from "../types";

export interface RespuestaPredefinidaFormDialogProps {
  trigger: ReactNode;
  respuesta?: RespuestaPredefinida;
}

export function RespuestaPredefinidaFormDialog({ trigger, respuesta }: RespuestaPredefinidaFormDialogProps) {
  const [open, setOpen] = useState(false);
  const isEdit = !!respuesta;
  const crearMutation = useCrearRespuestaPredefinida();
  const editarMutation = useEditarRespuestaPredefinida(respuesta?.id ?? "");
  const mutation = isEdit ? editarMutation : crearMutation;

  // Recalculado en CADA render: el diálogo queda montado en la fila de la tabla, así que el
  // reset de apertura tiene que inyectar el dato vigente y no el del primer render.
  const valoresVigentes: RespuestaPredefinidaFormValues = respuesta
    ? { titulo: respuesta.titulo, texto: respuesta.texto }
    : { titulo: "", texto: "" };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RespuestaPredefinidaFormValues>({
    resolver: zodResolver(respuestaPredefinidaSchema),
    defaultValues: valoresVigentes,
  });

  function submit(values: RespuestaPredefinidaFormValues) {
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
          <DialogTitle>{isEdit ? "Editar respuesta" : "Nueva respuesta"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="respuesta-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="respuesta-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="respuesta-texto" className="text-sm font-medium text-foreground">
              Texto
            </label>
            <Textarea id="respuesta-texto" rows={6} error={!!errors.texto} {...register("texto")} />
            {errors.texto && (
              <p role="alert" className="text-sm text-destructive">
                {errors.texto.message}
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
