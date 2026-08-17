"use client";

/**
 * SubtareasDialog — checklist de subtareas de una reparación (T5.9/T5.10).
 * Sin ruta de detalle (ADR-1: `/edilicia` sin `[id]`) — el checklist se
 * gestiona inline vía este modal, disparado por fila en `ReparacionesList`.
 * Gates por acción (WU-7.6, `sdd/matriz-permisos-por-usuario`): agregar
 * subtarea = `EDILICIA:ALTAS`, completar = `EDILICIA:MODIFICACION`,
 * eliminar = `EDILICIA:BORRADO` — el checklist es de solo lectura para
 * quien no tiene ninguna de las tres.
 *
 * `subtareas` (prop opcional, default `[]`) viene EMBEBIDO de
 * `GET /reparaciones` (item 1 backend-gaps — cierra G7), pasado por
 * `ReparacionesList` como dato inicial real; siembra el cache local
 * (`["subtareas", reparacionId]`), que las mutaciones siguen actualizando
 * optimistamente.
 */
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Circle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/components/shared/can";
import {
  useCompletarSubtarea,
  useCrearSubtarea,
  useEliminarSubtarea,
} from "../hooks/use-reparacion-mutations";
import { crearSubtareaSchema, type CrearSubtareaFormValues } from "../schemas";
import type { SubtareaEdilicia } from "../types";

export interface SubtareasDialogProps {
  reparacionId: string;
  trigger: ReactNode;
  numero: string;
  subtareas?: SubtareaEdilicia[];
}

export function SubtareasDialog({ reparacionId, trigger, numero, subtareas: subtareasIniciales = [] }: SubtareasDialogProps) {
  const [open, setOpen] = useState(false);
  const subtareasQuery = useQuery<SubtareaEdilicia[]>({
    queryKey: ["subtareas", reparacionId],
    queryFn: () => Promise.resolve(subtareasIniciales),
    initialData: subtareasIniciales,
    staleTime: Infinity,
    enabled: open,
  });
  const crearMutation = useCrearSubtarea(reparacionId);
  const completarMutation = useCompletarSubtarea(reparacionId);
  const eliminarMutation = useEliminarSubtarea(reparacionId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearSubtareaFormValues>({ resolver: zodResolver(crearSubtareaSchema) });

  function submit(values: CrearSubtareaFormValues) {
    crearMutation.mutate(values, { onSuccess: () => reset() });
  }

  const subtareas = subtareasQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subtareas — {numero}</DialogTitle>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {subtareas.length === 0 && <p className="text-sm text-muted-foreground">Sin subtareas todavía.</p>}
          {subtareas.map((subtarea) => (
            <li key={subtarea.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
              <div className="flex items-center gap-2">
                {subtarea.completada ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                <span className={subtarea.completada ? "text-sm text-muted-foreground line-through" : "text-sm text-foreground"}>
                  {subtarea.descripcion}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {!subtarea.completada && (
                  <Can permiso="EDILICIA:MODIFICACION">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      isLoading={completarMutation.isPending}
                      onClick={() => completarMutation.mutate(subtarea.id)}
                    >
                      Completar
                    </Button>
                  </Can>
                )}
                <Can permiso="EDILICIA:BORRADO">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Eliminar subtarea ${subtarea.descripcion}`}
                    onClick={() => eliminarMutation.mutate(subtarea.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </Can>
              </div>
            </li>
          ))}
        </ul>

        <Can permiso="EDILICIA:ALTAS">
          <form onSubmit={handleSubmit(submit)} className="flex items-end gap-2" noValidate>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="subtarea-descripcion" className="text-xs font-medium text-foreground">
                Nueva subtarea
              </label>
              <Input id="subtarea-descripcion" error={!!errors.descripcion} {...register("descripcion")} />
            </div>
            <Button type="submit" size="sm" isLoading={crearMutation.isPending}>
              Agregar
            </Button>
          </form>
        </Can>
      </DialogContent>
    </Dialog>
  );
}
