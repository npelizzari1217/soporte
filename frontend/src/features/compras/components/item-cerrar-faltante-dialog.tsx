"use client";

/**
 * ItemCerrarFaltanteDialog — cierra un ítem con faltante, estado TERMINAL
 * del ítem (§4.7 req 9, S22-S25). PIEZA AUTÓNOMA de PR-27, sin cablear a
 * `compra-detail-view.tsx`.
 *
 * NO figura en la lista de componentes del design (`sdd/redisenio-modulo-
 * compras/design`, sección FRONTEND) — se agrega igual porque la tarea del
 * checklist (PR-27: "registro de compra, registro de entrega, cierre con
 * faltante, cancelación") lo exige explícitamente y el comando
 * `CerrarItemConFaltanteUseCase` (§4.7) no tiene otro control asignado.
 * Deviación declarada, sin impacto de contrato (usa el DTO/schema ya
 * existentes de PR-23).
 *
 * Requiere un motivo (S24, `MotivoCierreFaltanteRequeridoError`) — por eso
 * es un `Dialog` con formulario, no un `ConfirmDialog` sin campos. S25:
 * `item.cerradoConFaltante` YA es un campo calculado por el backend — se
 * lee directamente para deshabilitar el trigger (irreversible, TERMINAL),
 * sin reimplementar la regla.
 *
 * RBAC: gate `COMPRAS:MODIFICACION` aplicado por el CALLER.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCerrarItemConFaltante } from "../hooks/use-compra-mutations";
import { cerrarItemConFaltanteSchema, type CerrarItemConFaltanteFormValues } from "../schemas";
import type { ItemCompra } from "../types";

export interface ItemCerrarFaltanteDialogProps {
  compraId: string;
  item: ItemCompra;
}

const EMPTY: CerrarItemConFaltanteFormValues = { motivo: "" };

export function ItemCerrarFaltanteDialog({ compraId, item }: ItemCerrarFaltanteDialogProps) {
  const [open, setOpen] = useState(false);
  const cerrarMutation = useCerrarItemConFaltante(compraId);
  /**
   * Espeja las TRES precondiciones de estado que el dominio exige, en el
   * mismo orden que sus guards (`ItemCompraEntity.cerrarConFaltante`):
   * terminalidad (S25), aprobación y faltante real (S23). La segunda entró
   * con el fix de C1, que cerró el hueco por el que un ítem no aprobado
   * llegaba al INSERT y volvía como 500.
   *
   * La tercera faltaba: sin ella el botón queda habilitado sobre un ítem que
   * ya recibió todo lo pedido, y la operación falla SIEMPRE con 422
   * (`ItemSinFaltanteError`) por algo que se veía en pantalla. El motivo
   * (S24) NO entra acá: lo valida el formulario, no el estado del ítem.
   *
   * WU-29 (`compras-tres-etapas-y-sectores` R3): `cantidadComprada` se
   * renombró a `cantidadRecibida` (mismo campo, misma regla — "faltante" es
   * lo que no LLEGÓ, no lo que no se entregó puertas adentro).
   */
  const hayFaltanteReal = item.cantidadRecibida < item.cantidad;
  const puedeCerrar =
    !item.cerradoConFaltante && item.estadoAprobacion === "APROBADO" && hayFaltanteReal;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CerrarItemConFaltanteFormValues>({
    resolver: zodResolver(cerrarItemConFaltanteSchema),
    defaultValues: EMPTY,
  });

  function submit(values: CerrarItemConFaltanteFormValues) {
    cerrarMutation.mutate(
      { itemId: item.id, dto: { motivo: values.motivo } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!puedeCerrar}
          title={
            puedeCerrar
              ? undefined
              : item.cerradoConFaltante
                ? "El ítem ya fue cerrado con faltante — es TERMINAL (S25)"
                : item.estadoAprobacion !== "APROBADO"
                  ? "El ítem debe estar aprobado para cerrarse con faltante"
                  : "No hay faltante: ya se compró todo lo pedido"
          }
        >
          Cerrar con faltante
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cerrar con faltante — {item.descripcion}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <p className="text-xs text-muted-foreground">
            Acción TERMINAL: bloquea nuevas compras/entregas sobre este ítem (S25).
          </p>
          <div className="flex flex-col gap-1">
            <label htmlFor="cerrar-faltante-motivo" className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Textarea id="cerrar-faltante-motivo" rows={3} error={!!errors.motivo} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" variant="destructive" isLoading={cerrarMutation.isPending}>
              Confirmar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
