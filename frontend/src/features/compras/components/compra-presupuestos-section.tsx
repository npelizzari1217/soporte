"use client";

/**
 * CompraPresupuestosSection — crear/seleccionar/adjuntar presupuestos de
 * proveedor (T5.4). Gate `compra:gestionar`. `presupuestos` inicial viene
 * del `GET /compras/:id` (`CompraDetailView`, item 1 backend-gaps — cierra
 * G7). Invariante "un solo presupuesto seleccionado" (backend ADR-7, swap
 * atómico) reflejada en el cache local por `useSeleccionarPresupuesto` (ver
 * hooks), sembrado con los datos reales del GET.
 */
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Can } from "@/components/shared/can";
import {
  useAdjuntarPresupuesto,
  useAgregarPresupuesto,
  useSeleccionarPresupuesto,
} from "../hooks/use-compra-mutations";
import { presupuestoSchema, type PresupuestoFormValues } from "../schemas";
import { MONEDAS, type Presupuesto } from "../types";

function PresupuestoAdjuntoInput({ compraId, presupuestoId }: { compraId: string; presupuestoId: string }) {
  const adjuntarMutation = useAdjuntarPresupuesto(compraId, presupuestoId);
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-primary hover:underline">
      <Paperclip className="h-3 w-3" aria-hidden="true" />
      Adjuntar
      <input
        type="file"
        className="sr-only"
        disabled={adjuntarMutation.isPending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) adjuntarMutation.mutate(file);
        }}
      />
    </label>
  );
}

export interface CompraPresupuestosSectionProps {
  compraId: string;
  presupuestos: Presupuesto[];
}

export function CompraPresupuestosSection({ compraId, presupuestos }: CompraPresupuestosSectionProps) {
  const presupuestosQuery = useQuery<Presupuesto[]>({
    queryKey: ["compra-presupuestos", compraId],
    queryFn: () => Promise.resolve(presupuestos),
    initialData: presupuestos,
    staleTime: Infinity,
  });
  const agregarMutation = useAgregarPresupuesto(compraId);
  const seleccionarMutation = useSeleccionarPresupuesto(compraId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PresupuestoFormValues>({ resolver: zodResolver(presupuestoSchema) });

  function submit(values: PresupuestoFormValues) {
    agregarMutation.mutate(
      {
        proveedor: values.proveedor,
        montoTotal: values.montoTotal,
        moneda: values.moneda,
        fechaCotizacion: values.fechaCotizacion,
        observaciones: values.observaciones || undefined,
      },
      { onSuccess: () => reset() },
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Presupuestos</h2>
      <ul className="flex flex-col gap-2">
        {(presupuestosQuery.data ?? []).map((presupuesto) => (
          <li
            key={presupuesto.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-2"
          >
            <span className="text-sm text-foreground">
              {presupuesto.proveedor} — {presupuesto.montoTotal} {presupuesto.moneda}
            </span>
            <div className="flex items-center gap-2">
              {presupuesto.seleccionado ? (
                <Badge variant="success">
                  <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                  Seleccionado
                </Badge>
              ) : (
                <Can permiso="compra:gestionar">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={seleccionarMutation.isPending}
                    onClick={() => seleccionarMutation.mutate(presupuesto.id)}
                  >
                    Seleccionar
                  </Button>
                </Can>
              )}
              <Can permiso="compra:gestionar">
                <PresupuestoAdjuntoInput compraId={compraId} presupuestoId={presupuesto.id} />
              </Can>
            </div>
          </li>
        ))}
      </ul>

      <Can permiso="compra:gestionar">
        <form onSubmit={handleSubmit(submit)} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="presupuesto-proveedor" className="text-xs font-medium text-foreground">
              Proveedor
            </label>
            <Input id="presupuesto-proveedor" error={!!errors.proveedor} {...register("proveedor")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="presupuesto-monto" className="text-xs font-medium text-foreground">
              Monto
            </label>
            <Input id="presupuesto-monto" type="number" error={!!errors.montoTotal} {...register("montoTotal")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="presupuesto-moneda" className="text-xs font-medium text-foreground">
              Moneda
            </label>
            <Select id="presupuesto-moneda" error={!!errors.moneda} defaultValue="" {...register("moneda")}>
              <option value="" disabled>
                Elegí
              </option>
              {MONEDAS.map((moneda) => (
                <option key={moneda} value={moneda}>
                  {moneda}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="presupuesto-fecha" className="text-xs font-medium text-foreground">
              Fecha cotización
            </label>
            <Input
              id="presupuesto-fecha"
              type="date"
              error={!!errors.fechaCotizacion}
              {...register("fechaCotizacion")}
            />
          </div>
          <Button type="submit" size="sm" isLoading={agregarMutation.isPending}>
            Agregar presupuesto
          </Button>
        </form>
      </Can>
    </section>
  );
}
