"use client";

/**
 * UnidadSerialDialog — carga o corrige el número de serie de una unidad.
 *
 * - Modo `cargar`: la unidad está pendiente de serie. Pide solo el serial
 *   (`INSUMOS:ALTAS`, lo gatea la sección).
 * - Modo `corregir`: la unidad ya tiene serial. Pide el serial nuevo y un motivo
 *   obligatorio de hasta 500 caracteres (`INSUMOS:AJUSTAR`).
 *
 * **Un serial repetido (409) se muestra en el campo**, no en un toast: es el
 * dato que el usuario tiene que cambiar. Cualquier otro rechazo del backend
 * (p. ej. 422 de una unidad que ya no admite la operación) sale como alerta
 * del formulario con el mensaje del servidor.
 *
 * El diálogo se abre con `unidad !== null` y el formulario se monta por
 * unidad/modo (`key`), así que cada apertura arranca limpia.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/shared/api/types";
import { useCargarSerialUnidad, useCorregirSerialUnidad } from "../hooks/use-serial-unidad-mutations";
import { cargarSerialSchema, corregirSerialSchema, type CorregirSerialFormValues } from "../schemas";
import type { UnidadInsumo } from "../types";

export type ModoSerial = "cargar" | "corregir";

export interface UnidadSerialDialogProps {
  insumoId: string;
  /** Unidad a la que se le carga o corrige el serial; `null` cierra el diálogo. */
  unidad: UnidadInsumo | null;
  modo: ModoSerial;
  onClose: () => void;
}

interface FormularioProps {
  insumoId: string;
  unidad: UnidadInsumo;
  modo: ModoSerial;
  onClose: () => void;
}

function FormularioSerial({ insumoId, unidad, modo, onClose }: FormularioProps) {
  const corrige = modo === "corregir";
  const [errorSerial, setErrorSerial] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const cargar = useCargarSerialUnidad(insumoId, unidad.id);
  const corregir = useCorregirSerialUnidad(insumoId, unidad.id);
  const mutation = corrige ? corregir : cargar;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CorregirSerialFormValues>({
    resolver: zodResolver(corrige ? corregirSerialSchema : cargarSerialSchema) as never,
    defaultValues: { numeroSerie: "", motivo: "" },
  });

  function submit(values: CorregirSerialFormValues) {
    setErrorSerial(null);
    setErrorGeneral(null);
    const numeroSerie = values.numeroSerie.trim();
    const onSuccess = () => onClose();
    const onError = (error: Error) => {
      if (!(error instanceof ApiError)) return setErrorGeneral("No se pudo guardar el serial.");
      const mensaje = error.messages.join(" ");
      if (error.statusCode === 409) setErrorSerial(mensaje);
      else setErrorGeneral(mensaje);
    };
    if (corrige) {
      corregir.mutate({ numeroSerie, motivo: (values.motivo ?? "").trim() }, { onSuccess, onError });
    } else {
      cargar.mutate({ numeroSerie }, { onSuccess, onError });
    }
  }

  const mensajeSerial = errors.numeroSerie?.message ?? errorSerial;

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
      {corrige && (
        <p className="text-sm text-muted-foreground">
          Serial actual: <span className="font-medium text-foreground">{unidad.numeroSerie}</span>
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="unidad-serial-numero" className="text-sm font-medium text-foreground">
          {corrige ? "Número de serie nuevo" : "Número de serie"}
        </label>
        <Input id="unidad-serial-numero" error={!!mensajeSerial} {...register("numeroSerie")} />
        {mensajeSerial && (
          <p role="alert" className="text-sm text-destructive">
            {mensajeSerial}
          </p>
        )}
      </div>
      {corrige && (
        <div className="flex flex-col gap-1">
          <label htmlFor="unidad-serial-motivo" className="text-sm font-medium text-foreground">
            Motivo de la corrección
          </label>
          <Textarea id="unidad-serial-motivo" rows={3} error={!!errors.motivo} {...register("motivo")} />
          {errors.motivo && (
            <p role="alert" className="text-sm text-destructive">
              {errors.motivo.message}
            </p>
          )}
        </div>
      )}
      {errorGeneral && (
        <p role="alert" className="text-sm text-destructive">
          {errorGeneral}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" isLoading={mutation.isPending}>
          {corrige ? "Corregir serial" : "Cargar serial"}
        </Button>
      </div>
    </form>
  );
}

/**
 * @param insumoId Insumo dueño de la unidad.
 * @param unidad Unidad a editar, o `null` con el diálogo cerrado.
 * @param modo `cargar` (pendiente, sin motivo) o `corregir` (con motivo).
 * @param onClose Cierra el diálogo, con o sin cambios.
 */
export function UnidadSerialDialog({ insumoId, unidad, modo, onClose }: UnidadSerialDialogProps) {
  return (
    <Dialog open={unidad !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modo === "corregir" ? "Corregir serial" : "Cargar serial"}</DialogTitle>
          <DialogDescription>
            {modo === "corregir"
              ? "El serial anterior queda en el historial de la unidad, junto con el motivo."
              : "Esta pieza ingresó sin número de serie. Cargalo para completar su identificación."}
          </DialogDescription>
        </DialogHeader>
        {unidad && (
          <FormularioSerial
            key={`${unidad.id}-${modo}`}
            insumoId={insumoId}
            unidad={unidad}
            modo={modo}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
