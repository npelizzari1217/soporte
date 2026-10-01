"use client";

/**
 * ComponenteRetiroDialog — retira un componente ACTIVO de un equipo con uno de
 * dos desenlaces: devolverlo al stock del depósito como usado, o descartarlo
 * por rotura. El motivo se exige en el cliente solo para el descarte; el
 * backend además lo exige para la devolución sin SALIDA vinculada y responde
 * 422, que se muestra dentro del diálogo (la autoridad es el backend).
 *
 * Con unidad (insumo `SERIE`) el retiro no pide nada más: la unidad vuelve al
 * depósito con su serial. Un componente LEGADO (sin unidad) de un insumo hoy
 * `SERIE` que se devuelve al stock exige el serial de la pieza: el campo
 * arranca con el número de serie de texto cuando es válido (recortado, 1 a 255)
 * y el backend decide si ya está usado (409). Se pide en el cliente solo para
 * ese caso; el seguimiento sale del catálogo (lectura abierta).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRetirarComponente } from "../hooks/use-equipo-mutations";
import { Input } from "@/components/ui/input";
import { useInsumos } from "@/features/insumos/hooks/use-insumos";
import { numeroSerieSchema } from "@/features/insumos/schemas";
import { retirarComponenteSchema, type RetirarComponenteFormValues } from "../schemas";
import type { ComponenteConTipo } from "../types";

export interface ComponenteRetiroDialogProps {
  equipoId: string;
  componente: ComponenteConTipo;
}

/** El serial de texto del legado, solo si ya es un serial válido: si no, el campo arranca vacío. */
function serialPrecargado(componente: ComponenteConTipo): string {
  const serial = numeroSerieSchema.safeParse(componente.numeroSerie ?? "");
  return serial.success ? serial.data : "";
}

export function ComponenteRetiroDialog({ equipoId, componente }: ComponenteRetiroDialogProps) {
  const [open, setOpen] = useState(false);
  const retirarMutation = useRetirarComponente(equipoId);
  const insumosQuery = useInsumos(true);
  const esLegadoSerie =
    !componente.unidadId && insumosQuery.data?.find((insumo) => insumo.id === componente.insumoId)?.seguimiento === "SERIE";
  const defaults: RetirarComponenteFormValues = {
    destino: "STOCK_USADO",
    motivo: "",
    numeroSerie: serialPrecargado(componente),
  };

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<RetirarComponenteFormValues>({
    resolver: zodResolver(retirarComponenteSchema),
    defaultValues: defaults,
  });
  const destino = watch("destino");
  const pideSerial = esLegadoSerie && destino === "STOCK_USADO";

  function submit(values: RetirarComponenteFormValues) {
    const motivo = (values.motivo ?? "").trim();
    let numeroSerie: string | undefined;
    if (pideSerial) {
      const serial = numeroSerieSchema.safeParse(values.numeroSerie ?? "");
      if (!serial.success) {
        setError("numeroSerie", { message: serial.error.issues[0].message });
        return;
      }
      numeroSerie = serial.data;
    }
    retirarMutation.mutate(
      {
        componenteId: componente.id,
        dto: { destino: values.destino, ...(motivo !== "" && { motivo }), ...(numeroSerie && { numeroSerie }) },
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          reset(defaults);
          retirarMutation.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label="Dar de baja componente">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar de baja el componente</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">¿Qué pasa con la pieza?</legend>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="radio" value="STOCK_USADO" {...register("destino")} />
              Devolver al stock como usado
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="radio" value="DESCARTE" {...register("destino")} />
              Descartar por rotura
            </label>
          </fieldset>
          <div className="flex flex-col gap-1">
            <label htmlFor="retiro-componente-motivo" className="text-sm font-medium text-foreground">
              {destino === "DESCARTE" ? "Motivo (obligatorio)" : "Motivo (opcional)"}
            </label>
            <Textarea id="retiro-componente-motivo" error={!!errors.motivo} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-xs text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          {pideSerial && (
            <div className="flex flex-col gap-1">
              <label htmlFor="retiro-componente-serie" className="text-sm font-medium text-foreground">
                Número de serie de la pieza (obligatorio)
              </label>
              <Input id="retiro-componente-serie" error={!!errors.numeroSerie} {...register("numeroSerie")} />
              {errors.numeroSerie && (
                <p role="alert" className="text-xs text-destructive">
                  {errors.numeroSerie.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Este componente se cargó antes del seguimiento por serie: al volver al stock se registra con este
                serial.
              </p>
            </div>
          )}
          {retirarMutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {retirarMutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={retirarMutation.isPending}>
              Confirmar baja
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
