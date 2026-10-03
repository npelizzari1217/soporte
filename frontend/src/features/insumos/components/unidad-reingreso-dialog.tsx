"use client";

/**
 * UnidadReingresoDialog — devuelve al depósito una pieza que salió de él.
 *
 * - Modo `devolver`: la unidad está `ENTREGADA`. Pide la condición en que
 *   vuelve y un motivo opcional (`INSUMOS:ALTAS`, lo gatea la sección).
 * - Modo `recuperar`: la unidad está `DESCARTADA`. Pide la condición y un
 *   motivo obligatorio de hasta 500 caracteres (`INSUMOS:AJUSTAR`).
 *
 * **USADO solo se ofrece si el reingreso admite usados** (`admiteUsadoEnReingreso` del
 * stock, resuelto por el backend con la exención G2: una familia de repuestos dada de baja o
 * deshabilitada sigue admitiéndolo; `admiteUsado` no sirve acá porque exige familia vigente). Si la consulta de stock no está disponible
 * se ofrece igual y decide el backend; sin selector la condición es NUEVO.
 * Una pendiente descartada se recupera sin serial y el diálogo lo aclara.
 *
 * Cualquier rechazo del backend (p. ej. 422 de un insumo que volvió a
 * `NINGUNO`) sale como alerta del formulario con el mensaje del servidor. El
 * formulario se monta por unidad/modo (`key`), así que cada apertura arranca limpia.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/shared/api/types";
import {
  useDevolverEntregaUnidad,
  useRecuperarUnidadDescartada,
} from "../hooks/use-reingreso-unidad-mutations";
import { useStockInsumo } from "../hooks/use-stock-insumo";
import { devolucionEntregaSchema, recuperacionSchema, type ReingresoFormValues } from "../schemas";
import type { UnidadInsumo } from "../types";

export type ModoReingreso = "devolver" | "recuperar";

export interface UnidadReingresoDialogProps {
  insumoId: string;
  /** Unidad que vuelve al depósito; `null` cierra el diálogo. */
  unidad: UnidadInsumo | null;
  modo: ModoReingreso;
  onClose: () => void;
}

interface FormularioProps {
  insumoId: string;
  unidad: UnidadInsumo;
  modo: ModoReingreso;
  onClose: () => void;
}

function FormularioReingreso({ insumoId, unidad, modo, onClose }: FormularioProps) {
  const recupera = modo === "recuperar";
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const devolver = useDevolverEntregaUnidad(insumoId, unidad.id);
  const recuperar = useRecuperarUnidadDescartada(insumoId, unidad.id);
  const mutation = recupera ? recuperar : devolver;
  const stockQuery = useStockInsumo(insumoId, { refetchOnMount: false });
  const ofreceUsado = stockQuery.isError || stockQuery.data?.admiteUsadoEnReingreso === true;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReingresoFormValues>({
    resolver: zodResolver(recupera ? recuperacionSchema : devolucionEntregaSchema) as never,
    defaultValues: { condicion: "NUEVO", motivo: "" },
  });

  function submit(values: ReingresoFormValues) {
    setErrorGeneral(null);
    const condicion = ofreceUsado ? values.condicion : "NUEVO";
    const motivo = (values.motivo ?? "").trim();
    const opciones = {
      onSuccess: () => onClose(),
      onError: (error: Error) =>
        setErrorGeneral(
          error instanceof ApiError ? error.messages.join(" ") : "No se pudo devolver la pieza al depósito.",
        ),
    };
    if (recupera) recuperar.mutate({ condicion, motivo }, opciones);
    else devolver.mutate({ condicion, ...(motivo ? { motivo } : {}) }, opciones);
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        {unidad.numeroSerie !== null ? (
          <>
            Serial: <span className="font-medium text-foreground">{unidad.numeroSerie}</span>
          </>
        ) : (
          "Esta pieza no tiene serial: vuelve al depósito como serie pendiente."
        )}
      </p>
      {ofreceUsado && (
        <div className="flex flex-col gap-1">
          <label htmlFor="unidad-reingreso-condicion" className="text-sm font-medium text-foreground">
            Condición
          </label>
          <Select id="unidad-reingreso-condicion" {...register("condicion")}>
            <option value="NUEVO">Nuevo</option>
            <option value="USADO">Usado</option>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="unidad-reingreso-motivo" className="text-sm font-medium text-foreground">
          {recupera ? "Motivo de la recuperación" : "Motivo (opcional)"}
        </label>
        <Textarea id="unidad-reingreso-motivo" rows={3} error={!!errors.motivo} {...register("motivo")} />
        {errors.motivo && (
          <p role="alert" className="text-sm text-destructive">
            {errors.motivo.message}
          </p>
        )}
      </div>
      {errorGeneral && (
        <p role="alert" className="text-sm text-destructive">
          {errorGeneral}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="submit" isLoading={mutation.isPending}>
          {recupera ? "Recuperar pieza" : "Devolver al depósito"}
        </Button>
      </div>
    </form>
  );
}

/**
 * @param insumoId Insumo dueño de la unidad.
 * @param unidad Unidad a reingresar, o `null` con el diálogo cerrado.
 * @param modo `devolver` (entregada, motivo opcional) o `recuperar` (descartada, con motivo).
 * @param onClose Cierra el diálogo, con o sin cambios.
 */
export function UnidadReingresoDialog({ insumoId, unidad, modo, onClose }: UnidadReingresoDialogProps) {
  return (
    <Dialog open={unidad !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modo === "recuperar" ? "Recuperar pieza" : "Devolver al depósito"}</DialogTitle>
          <DialogDescription>
            {modo === "recuperar"
              ? "La pieza descartada vuelve al depósito. Dejá escrito por qué se recupera."
              : "La pieza entregada vuelve al depósito en la condición que elijas."}
          </DialogDescription>
        </DialogHeader>
        {unidad && (
          <FormularioReingreso
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
