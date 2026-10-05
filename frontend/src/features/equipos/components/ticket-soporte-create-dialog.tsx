"use client";

/**
 * TicketSoporteCreateDialog — crear un ticket de soporte IT (T5.15).
 * `equipoId` es OPCIONAL: "Sin equipo" es la opción por defecto — el
 * payload NUNCA envía `equipoId` cuando no se elige uno (espejo del
 * criterio ya usado en Admin > Usuarios, B4, para no enviar campos
 * ausentes al backend). Gate `ticket:crear` — INDEPENDIENTE del gate
 * `equipo:gestionar` del inventario (ver hook), visible incluso a
 * USUARIO/COLABORADOR que no gestionan equipos.
 *
 * `equipoInicial` y `abiertoInicial` (sdd/formulario-publico-qr, WU-18): el landing `/pedido-qr`
 * abre el diálogo ya con el equipo del QR elegido. El equipo se ofrece como opción aunque el
 * listado no lo traiga (un USUARIO sin `EQUIPOS:LECTURA` recibe 403 en `GET /equipos`).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { useEquipos } from "../hooks/use-equipos";
import { useCrearTicketSoporte } from "../hooks/use-ticket-soporte-mutations";
import { crearTicketSoporteSchema, type CrearTicketSoporteFormValues } from "../schemas";

export interface TicketSoporteCreateDialogProps {
  /** Equipo preseleccionado (el del QR); no viaja si el usuario elige "Sin equipo". */
  equipoInicial?: { id: string; nombre: string };
  /** Abre el diálogo al montar. Por defecto, cerrado. */
  abiertoInicial?: boolean;
  /** Aviso al padre cuando el diálogo se cierra (cancelar o alta exitosa). */
  onCerrar?: () => void;
}

export function TicketSoporteCreateDialog({ equipoInicial, abiertoInicial = false, onCerrar }: TicketSoporteCreateDialogProps = {}) {
  const [open, setOpen] = useState(abiertoInicial);
  const prioridadesQuery = usePrioridades();
  const equiposQuery = useEquipos();
  const crearMutation = useCrearTicketSoporte();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearTicketSoporteFormValues>({
    resolver: zodResolver(crearTicketSoporteSchema),
    defaultValues: { equipoId: equipoInicial?.id ?? "" },
  });

  function submit(values: CrearTicketSoporteFormValues) {
    crearMutation.mutate(
      {
        titulo: values.titulo,
        descripcion: values.descripcion || undefined,
        prioridadId: values.prioridadId,
        // Vínculo OPCIONAL: string vacío del select ("Sin equipo") NUNCA viaja como equipoId.
        equipoId: values.equipoId || undefined,
        descripcionProblema: values.descripcionProblema || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
          onCerrar?.();
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          onCerrar?.();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>Nuevo ticket de soporte</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ticket de soporte</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="soporte-titulo" className="text-sm font-medium text-foreground">
              Título
            </label>
            <Input id="soporte-titulo" error={!!errors.titulo} {...register("titulo")} />
            {errors.titulo && (
              <p role="alert" className="text-sm text-destructive">
                {errors.titulo.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="soporte-descripcion-problema" className="text-sm font-medium text-foreground">
              Descripción del problema
            </label>
            <Textarea id="soporte-descripcion-problema" {...register("descripcionProblema")} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="soporte-equipo" className="text-sm font-medium text-foreground">
              Equipo (opcional)
            </label>
            <Select id="soporte-equipo" defaultValue={equipoInicial?.id ?? ""} {...register("equipoId")}>
              <option value="">Sin equipo</option>
              {equipoInicial && <option value={equipoInicial.id}>{equipoInicial.nombre}</option>}
              {(equiposQuery.data ?? []).filter((equipo) => equipo.id !== equipoInicial?.id).map((equipo) => (
                <option key={equipo.id} value={equipo.id}>
                  {equipo.nombre}
                  {equipo.numeroSerie ? ` (${equipo.numeroSerie})` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="soporte-prioridad" className="text-sm font-medium text-foreground">
              Prioridad
            </label>
            <Select id="soporte-prioridad" error={!!errors.prioridadId} defaultValue="" {...register("prioridadId")}>
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
