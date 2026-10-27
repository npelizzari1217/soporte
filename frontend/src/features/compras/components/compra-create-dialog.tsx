"use client";

/**
 * CompraCreateDialog — alta de una compra nueva (§4.1, S1/S2). Cierra el
 * HUECO DEL CHECKLIST detectado en `sdd/redisenio-modulo-compras/
 * hueco-compra-create-dialog`: ningún PR de la Fase F asignó el consumidor
 * de `useCrearCompra` (existente desde PR-26/27). Precedente explícito en
 * `ticket-create-dialog.tsx` ("COMPRAS: CompraCreateDialog").
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA viajan en el body (ver JSDoc de
 * `types.ts`/`schemas.ts`) — `crearCompraSchema` (PR-23) ya los excluye por
 * diseño, no se agregan acá.
 *
 * Trigger montado en `ComprasListView`, gate `COMPRAS:ALTAS` aplicado por
 * el CALLER (mismo criterio que el resto de los diálogos del módulo — este
 * componente es PRESENTACIONAL y no se auto-gatea).
 *
 * Al crear con éxito, navega al detalle de la compra nueva (mismo criterio
 * que `TicketCreateDialog`).
 *
 * Tipo (odd/compras-por-tipo, S3): obligatorio, y el selector ofrece solo los tipos activos con
 * `ALTAS` para la sesión (`useTiposDeCompra`); el backend responde 403 a cualquier otro. Con el
 * catálogo y los permisos ya resueltos y ningún tipo elegible, una nota lo explica y el botón de
 * crear queda deshabilitado: la lista vacía por sí sola no basta, porque mientras carga también
 * está vacía.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCrearCompra } from "../hooks/use-compra-mutations";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { useTiposDeCompra } from "../hooks/use-tipos-de-compra";
import { crearCompraSchema, type CrearCompraFormValues } from "../schemas";

const EMPTY: CrearCompraFormValues = {
  motivo: "",
  descripcion: "",
  fechaSolicitud: "",
  sectorId: "",
  tipoTicketId: "",
};

export function CompraCreateDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const crearMutation = useCrearCompra();
  const sectoresQuery = useSectores();
  const tiposDeCompra = useTiposDeCompra("ALTAS");
  const sinTiposElegibles = tiposDeCompra.estado === "listo" && tiposDeCompra.tipos.length === 0;
  const puedeCrear = tiposDeCompra.estado !== "error" && !sinTiposElegibles;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearCompraFormValues>({
    resolver: zodResolver(crearCompraSchema),
    defaultValues: EMPTY,
  });

  function submit(values: CrearCompraFormValues) {
    crearMutation.mutate(
      {
        motivo: values.motivo,
        descripcion: values.descripcion || undefined,
        fechaSolicitud: values.fechaSolicitud,
        sectorId: values.sectorId || undefined,
        tipoTicketId: values.tipoTicketId,
      },
      {
        onSuccess: (compra) => {
          setOpen(false);
          router.push(`/compras/${compra.id}`);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset al ABRIR (mismo criterio que el resto de los diálogos de
        // alta del módulo): el formulario arranca siempre vacío.
        if (next) reset(EMPTY);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Nueva compra
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva compra</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-motivo" className="text-sm font-medium text-foreground">
              Motivo
            </label>
            <Input id="compra-crear-motivo" error={!!errors.motivo} {...register("motivo")} />
            {errors.motivo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.motivo.message}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-tipo" className="text-sm font-medium text-foreground">
              Tipo
            </label>
            <Select id="compra-crear-tipo" error={!!errors.tipoTicketId} {...register("tipoTicketId")}>
              <option value="" disabled>
                Elija un tipo
              </option>
              {tiposDeCompra.tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </Select>
            {errors.tipoTicketId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.tipoTicketId.message}
              </p>
            )}
            {sinTiposElegibles && (
              <p className="text-sm text-muted-foreground">
                No tiene permiso de alta sobre ningún tipo de ticket, por lo que no puede crear
                compras. Solicite el permiso a un administrador.
              </p>
            )}
            {tiposDeCompra.estado === "error" && (
              <p className="text-sm text-muted-foreground">
                No se pudieron cargar los tipos de ticket. Recargue la página e intente nuevamente.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-fecha-solicitud" className="text-sm font-medium text-foreground">
              Fecha de solicitud
            </label>
            <Input
              id="compra-crear-fecha-solicitud"
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
            <label htmlFor="compra-crear-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Textarea id="compra-crear-descripcion" rows={3} {...register("descripcion")} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="compra-crear-sector" className="text-sm font-medium text-foreground">
              Sector de destino (opcional)
            </label>
            <Select id="compra-crear-sector" {...register("sectorId")}>
              <option value="">Sin sector</option>
              {(sectoresQuery.data ?? []).map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.nombre}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" isLoading={crearMutation.isPending} disabled={!puedeCrear}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
