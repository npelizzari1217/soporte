"use client";

/**
 * CompraItemsSection — agregar/eliminar ítems de una compra (T5.3). Gate
 * `compra:gestionar`. `items` inicial viene del `GET /compras/:id`
 * (`CompraDetailView`, item 1 backend-gaps — cierra G7); las mutaciones
 * siguen reflejándose optimistamente en el cache local
 * `["compra-items", compraId]`, sembrado con esos datos reales.
 */
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/components/shared/can";
import { useAgregarItemCompra, useEliminarItemCompra } from "../hooks/use-compra-mutations";
import { itemCompraSchema, type ItemCompraFormValues } from "../schemas";
import type { ItemCompra } from "../types";

export interface CompraItemsSectionProps {
  compraId: string;
  items: ItemCompra[];
}

export function CompraItemsSection({ compraId, items }: CompraItemsSectionProps) {
  const itemsQuery = useQuery<ItemCompra[]>({
    queryKey: ["compra-items", compraId],
    queryFn: () => Promise.resolve(items),
    initialData: items,
    staleTime: Infinity,
  });
  const agregarMutation = useAgregarItemCompra(compraId);
  const eliminarMutation = useEliminarItemCompra(compraId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ItemCompraFormValues>({ resolver: zodResolver(itemCompraSchema) });

  function submit(values: ItemCompraFormValues) {
    agregarMutation.mutate(
      {
        descripcion: values.descripcion,
        cantidad: values.cantidad,
        unidad: values.unidad || undefined,
        precioUnitarioRef: values.precioUnitarioRef,
        observaciones: values.observaciones || undefined,
      },
      { onSuccess: () => reset() },
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground">Ítems</h2>
      <ul className="flex flex-col gap-2">
        {(itemsQuery.data ?? []).map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
            <span className="text-sm text-foreground">
              {item.cantidad} {item.unidad ?? ""} — {item.descripcion}
            </span>
            <Can permiso="compra:gestionar">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Eliminar ítem ${item.descripcion}`}
                onClick={() => eliminarMutation.mutate(item.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </Can>
          </li>
        ))}
      </ul>

      <Can permiso="compra:gestionar">
        <form onSubmit={handleSubmit(submit)} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-descripcion" className="text-xs font-medium text-foreground">
              Descripción
            </label>
            <Input id="item-descripcion" error={!!errors.descripcion} {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-cantidad" className="text-xs font-medium text-foreground">
              Cantidad
            </label>
            <Input id="item-cantidad" type="number" error={!!errors.cantidad} {...register("cantidad")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="item-unidad" className="text-xs font-medium text-foreground">
              Unidad
            </label>
            <Input id="item-unidad" {...register("unidad")} />
          </div>
          <Button type="submit" size="sm" isLoading={agregarMutation.isPending}>
            Agregar ítem
          </Button>
        </form>
      </Can>
    </section>
  );
}
