"use client";

/**
 * CompraEditDialog — edita la CABECERA de una compra (`motivo`/`descripcion`/
 * `fechaSolicitud`/`sectorId`), consumidor de `PATCH /compras/:id`.
 *
 * **Ventana de edición, sin re-implementar la máquina de estados**: la
 * cabecera sólo se puede editar mientras la compra deriva `PENDIENTE` (ningún
 * ítem decidido todavía). `compra.estado` YA viene derivado del backend
 * (ADR-C1) — este componente sólo lo compara por igualdad, mismo criterio que
 * `ItemEditDialog` con `item.estadoAprobacion`. Nunca reinterpreta la tabla de
 * verdad ni mira los ítems para decidir.
 *
 * Con la compra fuera de `PENDIENTE` el trigger queda DESHABILITADO con el
 * motivo en el `title`, en vez de desaparecer: un botón que no está no explica
 * nada, y el usuario que ayer pudo editar merece saber por qué hoy no puede.
 * La compra cancelada cae en el mismo caso (deriva `CANCELADO`, nunca
 * `PENDIENTE`) — no hace falta un chequeo aparte de `canceladaEn`.
 *
 * `descripcion`/`sectorId` vacíos viajan como `null` explícito (limpiar), no
 * como `""` — mismo criterio que `observaciones` en `ItemEditDialog`.
 *
 * `numero`/`solicitanteId`/`cicloId` NO son campos de este form (ver JSDoc de
 * `EditarCompraDto`).
 *
 * RBAC: gate `COMPRAS:MODIFICACION` aplicado por el CALLER (mismo criterio que
 * el resto de los diálogos del módulo — este componente es PRESENTACIONAL y no
 * se auto-gatea).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEditarCompra } from "../hooks/use-compra-mutations";
import { aFechaInput } from "@/shared/lib/formato-fecha";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { editarCompraSchema, type EditarCompraFormValues } from "../schemas";
import type { CompraDetalle, EditarCompraDto } from "../types";

export interface CompraEditDialogProps {
  compra: CompraDetalle;
}

const MOTIVO_BLOQUEO =
  "La cabecera sólo se puede editar mientras la compra está pendiente: ya hay ítems decididos.";

export function CompraEditDialog({ compra }: CompraEditDialogProps) {
  const [open, setOpen] = useState(false);
  const editarMutation = useEditarCompra(compra.id);
  const sectoresQuery = useSectores();
  const bloqueada = compra.estado !== "PENDIENTE";

  const defaults: EditarCompraFormValues = {
    motivo: compra.motivo,
    descripcion: compra.descripcion ?? "",
    // El backend serializa `fechaSolicitud` como datetime ISO completo; sin
    // normalizar, `<input type="date">` descarta el valor y aparece vacío.
    fechaSolicitud: aFechaInput(compra.fechaSolicitud),
    sectorId: compra.sectorId ?? "",
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditarCompraFormValues>({
    resolver: zodResolver(editarCompraSchema),
    defaultValues: defaults,
  });

  function submit(values: EditarCompraFormValues) {
    const dto: EditarCompraDto = {
      motivo: values.motivo,
      descripcion: values.descripcion || null,
      fechaSolicitud: values.fechaSolicitud,
      sectorId: values.sectorId || null,
    };
    editarMutation.mutate(dto, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Resetear al ABRIR precarga los valores ACTUALES: reabrir después de
        // guardar refleja la cabecera vigente, no la de la primera apertura.
        if (next) reset(defaults);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={bloqueada}
          title={bloqueada ? MOTIVO_BLOQUEO : undefined}
          aria-label="Editar cabecera"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cabecera</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-editar-motivo" className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Input id="compra-editar-motivo" error={!!errors.motivo} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-editar-fecha-solicitud" className="text-sm font-medium text-foreground">
              Fecha de solicitud
            </label>
            <Input
              id="compra-editar-fecha-solicitud"
              type="date"
              error={!!errors.fechaSolicitud}
              {...register("fechaSolicitud")}
            />
            {errors.fechaSolicitud && (
              <p role="alert" className="text-sm text-destructive">
                {errors.fechaSolicitud.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-editar-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Textarea id="compra-editar-descripcion" rows={3} {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-editar-sector" className="text-sm font-medium text-foreground">
              Sector de destino (opcional)
            </label>
            <Select id="compra-editar-sector" {...register("sectorId")}>
              <option value="">Sin sector</option>
              {(sectoresQuery.data ?? []).map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={editarMutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
