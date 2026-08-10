"use client";

/**
 * TipoComponenteRow — PRESENTATIONAL. Fila del ABM del catálogo master de
 * tipos de componente (PR5, sdd/tipos-componente-master). `codigo` es
 * INMUTABLE (el backend no lo acepta en `PATCH /tipos-componente/:id`) — se
 * muestra como texto fijo, nunca editable, solo `nombre` se edita inline.
 *
 * Activar/Desactivar son directos (sin `ConfirmDialog`): a diferencia de
 * `CicloRow` (activar tiene cascada, R22) o `ClienteAcciones` (desactivar es
 * baja lógica de un tenant), acá ambas acciones son un toggle reversible del
 * catálogo global, sin efectos colaterales documentados en el backend.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useActivarTipoComponente,
  useDesactivarTipoComponente,
  useRenombrarTipoComponente,
} from "../hooks/use-tipos-componente";
import { renombrarTipoComponenteSchema, type RenombrarTipoComponenteFormValues } from "../schemas";
import type { TipoComponente } from "../types";

export interface TipoComponenteRowProps {
  tipo: TipoComponente;
}

export function TipoComponenteRow({ tipo }: TipoComponenteRowProps) {
  const [editing, setEditing] = useState(false);
  const activar = useActivarTipoComponente();
  const desactivar = useDesactivarTipoComponente();
  const renombrar = useRenombrarTipoComponente(tipo.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RenombrarTipoComponenteFormValues>({
    resolver: zodResolver(renombrarTipoComponenteSchema),
    defaultValues: { nombre: tipo.nombre },
  });

  function submit(values: RenombrarTipoComponenteFormValues) {
    renombrar.mutate(values, { onSuccess: () => setEditing(false) });
  }

  function cancelar() {
    reset({ nombre: tipo.nombre });
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{tipo.codigo}</span>

      {editing ? (
        <form onSubmit={handleSubmit(submit)} noValidate className="flex flex-1 items-center gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`tipo-componente-nombre-${tipo.id}`} className="sr-only">
              Nombre de {tipo.codigo}
            </label>
            <Input id={`tipo-componente-nombre-${tipo.id}`} error={!!errors.nombre} {...register("nombre")} />
            {errors.nombre && (
              <p role="alert" className="text-xs text-destructive">
                {errors.nombre.message}
              </p>
            )}
          </div>
          <Button type="submit" size="sm" isLoading={renombrar.isPending}>
            Guardar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={cancelar}>
            Cancelar
          </Button>
        </form>
      ) : (
        <>
          <span className="flex-1 text-sm font-medium text-foreground">{tipo.nombre}</span>
          {tipo.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Editar
          </Button>
          {tipo.activo ? (
            <Button variant="outline" size="sm" disabled={desactivar.isPending} onClick={() => desactivar.mutate(tipo.id)}>
              Desactivar
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={activar.isPending} onClick={() => activar.mutate(tipo.id)}>
              Activar
            </Button>
          )}
        </>
      )}
    </div>
  );
}
