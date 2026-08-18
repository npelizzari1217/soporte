"use client";

/**
 * ComentariosDialog — bitácora de comentarios de una reparación, hermano del
 * `SubtareasDialog`. Sin ruta de detalle (ADR-1: `/edilicia` sin `[id]`) — se
 * gestiona inline vía este modal, disparado por fila en `ReparacionesList`.
 *
 * Diferencia clave con `SubtareasDialog`: los comentarios tienen `GET` propio
 * (`useComentariosReparacion`), así que acá hay estados reales de carga,
 * error y vacío usando las primitivas compartidas (ADR-8), en vez de sembrar
 * un cache local desde un array embebido.
 *
 * Gate por acción: agregar comentario = `EDILICIA:ALTAS` (mismo permiso que
 * agregar una subtarea). Leer no lleva gate en el cliente: si el usuario pudo
 * cargar la reparación, el backend ya lo autorizó con `EDILICIA:LECTURA`.
 *
 * Append-only: no hay editar ni eliminar, ni acá ni en el backend.
 */
import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/components/shared/can";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { notifyError } from "@/shared/lib/toast";
import { useComentariosReparacion, useCrearComentarioReparacion } from "../hooks/use-comentarios-reparacion";
import { crearComentarioSchema, type CrearComentarioFormValues } from "../schemas";
import type { ComentarioReparacion } from "../types";

export interface ComentariosDialogProps {
  reparacionId: string;
  trigger: ReactNode;
  numero: string;
}

/** Fecha corta + hora, mismo formato que `TicketTimeline`/`CompraBitacoraSection` (sin util compartido en el repo). */
function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

/**
 * Nombre visible del autor. Cae al `autorId` cuando el backend no pudo
 * resolver el nombre contra MASTER (usuario dado de baja): mostrar el id
 * crudo es peor que un nombre, pero mucho mejor que dejar la autoría en
 * blanco en una bitácora.
 */
function nombreAutor(comentario: ComentarioReparacion): string {
  const completo = [comentario.autorNombre, comentario.autorApellido].filter(Boolean).join(" ");
  return completo.length > 0 ? completo : comentario.autorId;
}

export function ComentariosDialog({ reparacionId, trigger, numero }: ComentariosDialogProps) {
  const [open, setOpen] = useState(false);
  const comentariosQuery = useComentariosReparacion(reparacionId, open);
  const crearMutation = useCrearComentarioReparacion(reparacionId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearComentarioFormValues>({ resolver: zodResolver(crearComentarioSchema) });

  function submit(values: CrearComentarioFormValues) {
    crearMutation.mutate(values, { onSuccess: () => reset({ texto: "" }) });
  }

  const comentarios = comentariosQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Comentarios — {numero}</DialogTitle>
        </DialogHeader>

        {comentariosQuery.isLoading && <TableSkeleton rows={3} columns={1} />}

        {comentariosQuery.isError && (
          <ErrorState
            message="No se pudieron cargar los comentarios."
            onRetry={() => comentariosQuery.refetch().catch(notifyError)}
          />
        )}

        {!comentariosQuery.isLoading && !comentariosQuery.isError && comentarios.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title="Sin comentarios"
            description="Dejá el primero para asentar por qué se está demorando."
          />
        )}

        {comentarios.length > 0 && (
          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {comentarios.map((comentario) => (
              <li key={comentario.id} className="flex flex-col gap-1 rounded-lg border border-border p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">{nombreAutor(comentario)}</span>
                  <span className="text-xs text-muted-foreground">{formatFecha(comentario.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground">{comentario.texto}</p>
              </li>
            ))}
          </ul>
        )}

        <Can permiso="EDILICIA:ALTAS">
          <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-2" noValidate>
            <label htmlFor="comentario-texto" className="text-xs font-medium text-foreground">
              Nuevo comentario
            </label>
            <Textarea id="comentario-texto" error={!!errors.texto} {...register("texto")} />
            <Button type="submit" size="sm" className="self-end" isLoading={crearMutation.isPending}>
              Comentar
            </Button>
          </form>
        </Can>
      </DialogContent>
    </Dialog>
  );
}
