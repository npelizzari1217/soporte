"use client";

/**
 * ConfigurarZonaHorariaDialog — cambia la zona operativa de un cliente
 * (`PATCH /clientes/:id/zona-horaria`, D1/D2). Diálogo SEPARADO de
 * `EditarClienteDialog`, mismo criterio que `ConfigurarCsatDialog`: el
 * backend expone la ruta propia (tarea 2.9), así que la edición comercial y
 * esta acción nunca comparten body.
 *
 * GREEN de la tarea 2.13 (`openspec/changes/zona-horaria-por-tenant/tasks.md`).
 * A diferencia de `ConfigurarCsatDialog` (que gestiona su único campo
 * booleano con `useState`+`useEffect`), acá el campo es el combobox de zona
 * con validación Zod (`configurarZonaHorariaSchema`), así que el reset al
 * reabrir sigue el patrón `reset(valoresVigentes)` en `onOpenChange` de
 * `SectorFormDialog`/`CicloVigenteFormDialog` (`dialogos-reset-valores-vigentes`):
 * `valoresVigentes` se recalcula en CADA render a partir de la prop, y el
 * reset se dispara al abrir, nunca al cerrar — así reabrir después de que el
 * tenant cambió de zona por otra vía (otra pestaña, otro admin ROOT) siempre
 * sincroniza con el valor vigente, no con el snapshot del primer montaje.
 *
 * Las props espejan a `ConfigurarCsatDialog` (`{ cliente: Cliente }`), igual
 * que el resto de los diálogos que monta `cliente-acciones.tsx`.
 */
import { useState } from "react";
import { useController, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZonaHorariaCombobox } from "@/components/ui/zona-horaria-combobox";
import { useConfigurarZonaHorariaCliente } from "../hooks/use-clientes-mutations";
import { configurarZonaHorariaSchema, type ConfigurarZonaHorariaFormValues } from "../schemas";
import type { Cliente } from "../types";

export interface ConfigurarZonaHorariaDialogProps {
  cliente: Cliente;
}

export function ConfigurarZonaHorariaDialog({ cliente }: ConfigurarZonaHorariaDialogProps) {
  const [open, setOpen] = useState(false);
  const mutation = useConfigurarZonaHorariaCliente(cliente.id);

  // Recalculado en CADA render: el reset de apertura inyecta el valor
  // VIGENTE de la prop, no un snapshot capturado en el primer montaje.
  const valoresVigentes: ConfigurarZonaHorariaFormValues = { zonaHoraria: cliente.zonaHoraria };

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ConfigurarZonaHorariaFormValues>({
    resolver: zodResolver(configurarZonaHorariaSchema),
    defaultValues: valoresVigentes,
  });
  const { field } = useController({ control, name: "zonaHoraria" });
  const inputId = "configurar-zona-horaria";

  function submit(values: ConfigurarZonaHorariaFormValues) {
    mutation.mutate(
      { zonaHoraria: values.zonaHoraria },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset(valoresVigentes);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Configurar zona horaria de ${cliente.nombre}`}>
          <Clock className="h-4 w-4" aria-hidden="true" />
          Zona horaria
        </Button>
      </DialogTrigger>
      <DialogContent
        // El combobox es el ÚNICO campo del formulario, así que Radix lo
        // autofocalizaría al abrir el diálogo (es el primer elemento
        // tabulable). Sin este guard, ese autofocus dispara el `onFocus` del
        // combobox y lo deja ABIERTO antes de que el usuario haga nada — el
        // siguiente click (para recién ahí abrirlo) lo interpreta el
        // dismissable layer de Radix como un click AFUERA (el input es un
        // `PopoverAnchor`, no un `PopoverTrigger` registrado) y lo cierra.
        // Mismo criterio que ya aplica `PopoverContent` en
        // `zona-horaria-combobox.tsx` para su propio `onOpenAutoFocus`.
        onOpenAutoFocus={(evento) => evento.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Zona horaria operativa — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-sm font-medium text-foreground">
              Zona horaria
            </label>
            <ZonaHorariaCombobox
              id={inputId}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              error={!!errors.zonaHoraria}
              valorVigente={cliente.zonaHoraria}
            />
            {errors.zonaHoraria && (
              <p role="alert" className="text-sm text-destructive">
                {errors.zonaHoraria.message}
              </p>
            )}
          </div>

          {/*
            Aviso de re-lectura histórica (design.md, "Migración / rollout"):
            este cambio no migra ni recalcula lo ya registrado. Distinto del
            artículo de Ayuda (tarea 2.14), que además tiene que aclarar que
            HOY todavía ningún cálculo de vencimientos lee esta zona.
          */}
          <p className="text-xs text-muted-foreground">
            Este cambio no reprocesa lo ya registrado: los vencimientos y horarios que ya se
            generaron no se recalculan ni se migran. A medida que el resto del sistema empiece a
            leer esta zona, lo nuevo se va a interpretar con el valor que guardes acá.
          </p>

          <div className="flex justify-end pt-2">
            <Button type="submit" isLoading={mutation.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
