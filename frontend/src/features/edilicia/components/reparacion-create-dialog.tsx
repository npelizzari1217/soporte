"use client";

/**
 * ReparacionCreateDialog — crear un ticket edilicio (T5.8). Sin ruta
 * dedicada (ADR-1: solo `/edilicia`) — alta inline, mismo patrón que
 * `CompraCreateDialog` (B5).
 *
 * Suma el Sector opcional (odd/ubicacion-sector-ticket). La ubicación general
 * del ticket NO va acá: Edilicia usa su propia «Ubicación» (CA2).
 *
 * Tipo (odd/tasks/tipos-ticket-por-modulo.md, S2): los tipos activos del módulo EDILICIA salvo
 * PREVENTIVO, que lo genera solo el barrido, y de esos solo los que tienen `ALTAS` para el usuario
 * (odd/permisos-por-tipo-ticket, S6): el backend responde 403 al alta de cualquier otro. La opción
 * vacía es EDILICIA y no manda `tipoId`, así el valor por defecto no depende de que el catálogo ya
 * haya cargado; se ofrece solo con `ALTAS` sobre EDILICIA. Sin ella, elegir un tipo es obligatorio.
 * Con EDILICIA permitido y sin otros tipos elegibles, el selector no se muestra. Con el catálogo
 * cargado y ningún tipo elegible, el botón no se muestra.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { usePrioridades, useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { useCrearReparacion } from "../hooks/use-reparacion-mutations";
import { usePermisosPorTipo } from "@/shared/hooks/use-permisos-por-tipo";
import { crearReparacionSchema, type CrearReparacionFormValues } from "../schemas";

const TIPO_CODIGO_EDILICIA = "EDILICIA";
/** Lo genera solo el barrido preventivo: no se elige en un alta. */
const TIPO_CODIGO_PREVENTIVO = "PREVENTIVO";

export function ReparacionCreateDialog() {
  const [open, setOpen] = useState(false);
  const prioridadesQuery = usePrioridades();
  // El catálogo de sectores se pide recién al abrir el modal.
  const sectoresQuery = useSectores(open);
  const tiposQuery = useTiposTicket(TIPO_CODIGO_EDILICIA);
  const { tiposCon } = usePermisosPorTipo();
  const tiposConAlta = tiposCon(
    (tiposQuery.data ?? []).filter((tipo) => tipo.codigo !== TIPO_CODIGO_PREVENTIVO),
    "ALTAS",
  );
  const tipoPorDefecto = tiposConAlta.find((tipo) => tipo.codigo === TIPO_CODIGO_EDILICIA);
  const tiposAlternativos = tiposConAlta.filter((tipo) => tipo.codigo !== TIPO_CODIGO_EDILICIA);
  // Mientras el catálogo carga se asume EDILICIA, como el backend sin `tipoId`: decide él.
  const ofreceEdiliciaPorDefecto = !tiposQuery.isSuccess || tipoPorDefecto !== undefined;
  const crearMutation = useCrearReparacion();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CrearReparacionFormValues>({ resolver: zodResolver(crearReparacionSchema) });

  if (tiposQuery.isSuccess && tiposConAlta.length === 0) return null;

  function submit(values: CrearReparacionFormValues) {
    // Sin `tipoId` el backend crea EDILICIA: sin ALTAS sobre ese tipo, sería un 403 seguro.
    if (!values.tipoId && !ofreceEdiliciaPorDefecto) {
      setError("tipoId", { message: "Elegí un tipo" });
      return;
    }
    crearMutation.mutate(
      {
        titulo: values.titulo,
        descripcion: values.descripcion || undefined,
        prioridadId: values.prioridadId,
        tipoId: values.tipoId || undefined,
        ubicacion: values.ubicacion || undefined,
        sectorId: values.sectorId || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>Nueva reparación</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva reparación</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="reparacion-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          {(tiposAlternativos.length > 0 || !ofreceEdiliciaPorDefecto) && (
            <div className="flex flex-col gap-1">
              <label htmlFor="reparacion-tipo" className="text-sm font-medium text-foreground">
                Tipo
              </label>
              <Select id="reparacion-tipo" error={!!errors.tipoId} defaultValue="" {...register("tipoId")}>
                {ofreceEdiliciaPorDefecto ? (
                  <option value="">{tipoPorDefecto?.nombre ?? "Edilicia"}</option>
                ) : (
                  <option value="" disabled>
                    Elegí un tipo
                  </option>
                )}
                {tiposAlternativos.map((tipo) => (
                  <option key={tipo.id} value={tipo.id}>
                    {tipo.nombre}
                  </option>
                ))}
              </Select>
              {errors.tipoId && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.tipoId.message}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-descripcion" className="text-sm font-medium text-foreground">
              Descripción
            </label>
            <Textarea id="reparacion-descripcion" {...register("descripcion")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-ubicacion" className="text-sm font-medium text-foreground">
              Ubicación
            </label>
            <Input id="reparacion-ubicacion" error={!!errors.ubicacion} {...register("ubicacion")} />
            {errors.ubicacion && (
              <p role="alert" className="text-sm text-destructive">
                {errors.ubicacion.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-prioridad" className="text-sm font-medium text-foreground">
              Prioridad
            </label>
            <Select
              id="reparacion-prioridad"
              error={!!errors.prioridadId}
              defaultValue=""
              {...register("prioridadId")}
            >
              <option value="" disabled>
                Elegí una prioridad
              </option>
              {(prioridadesQuery.data ?? []).map((prioridad) => (
                <option key={prioridad.id} value={prioridad.id}>
                  {prioridad.nombre}
                </option>
              ))}
            </Select>
            {errors.prioridadId && (
              <p role="alert" className="text-sm text-destructive">
                {errors.prioridadId.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="reparacion-sector" className="text-sm font-medium text-foreground">
              Sector
            </label>
            <Select id="reparacion-sector" defaultValue="" {...register("sectorId")}>
              <option value="">Sin sector</option>
              {(sectoresQuery.data ?? []).map((sector) => (
                <option key={sector.id} value={sector.id}>
                  {sector.nombre}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="submit" isLoading={crearMutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
