"use client";

/**
 * HorarioLaboralForm — grilla PRESENTACIONAL de 7 filas (D14, design.md),
 * sdd/horario-laboral-por-cliente, WU-8a. RHF + `zodResolver`
 * (`horarioLaboralFormSchema`, WU-7b). Sin `apiFetch` ni hooks de datos: el
 * container (`HorarioLaboralView`, WU-8b) pasa `valoresIniciales` (DTO en
 * minutos) y recibe el DTO ya convertido en `onGuardar` — la conversión
 * HH:MM ↔ minutos vive acá vía `minutos.ts` (D14), nunca en `HorarioLaboralFila`.
 *
 * El schema es un ARRAY (`HorarioLaboralFormValues = DiaFormValues[]`,
 * `schemas.ts`), así que RHF lo envuelve en `{ dias }`: `useForm` necesita
 * un objeto en la raíz. El error agregado de "al menos un día abierto"
 * (superRefine con `path: []`) queda en `errors.dias.message` — verificado
 * contra `zodResolver`@3.10/`react-hook-form`@7.80: cuando el único issue
 * del array es el de la raíz, RHF deja `errors.dias` como el `FieldError`
 * único (no lo envuelve en `.root`, esa forma es de `useFieldArray`, que
 * este form no usa).
 *
 * `soloLectura` deshabilita las 7 filas y oculta el botón Guardar (spec:
 * "Contrato observable del frontend").
 */
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { horarioLaboralFormSchema, type HorarioLaboralFormValues, type DiaFormValues } from "../schemas";
import { minutosAHhmm, hhmmAMinutos } from "../minutos";
import type { HorarioLaboral, HorarioLaboralDto, DiaHorarioLaboral } from "../types";
import { HorarioLaboralFila } from "./horario-laboral-fila";

const NOMBRES_DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const formShape = z.object({ dias: horarioLaboralFormSchema });
type FormValues = z.infer<typeof formShape>;

function desdeHorario(horario: HorarioLaboral): HorarioLaboralFormValues {
  return [...horario.dias]
    .sort((a, b) => a.diaSemana - b.diaSemana)
    .map(
      (dia): DiaFormValues => ({
        diaSemana: dia.diaSemana,
        abierto: dia.aperturaMinuto !== null && dia.cierreMinuto !== null,
        apertura: dia.aperturaMinuto !== null ? minutosAHhmm(dia.aperturaMinuto, false) : "",
        cierre: dia.cierreMinuto !== null ? minutosAHhmm(dia.cierreMinuto, true) : "",
      }),
    );
}

function aDto(dias: HorarioLaboralFormValues): HorarioLaboralDto {
  return {
    dias: dias.map(
      (dia): DiaHorarioLaboral => ({
        diaSemana: dia.diaSemana as DiaHorarioLaboral["diaSemana"],
        aperturaMinuto: dia.abierto ? hhmmAMinutos(dia.apertura, false) : null,
        cierreMinuto: dia.abierto ? hhmmAMinutos(dia.cierre, true) : null,
      }),
    ),
  };
}

export interface HorarioLaboralFormProps {
  valoresIniciales: HorarioLaboral;
  soloLectura: boolean;
  guardando: boolean;
  errorServidor?: string | null;
  onGuardar: (dto: HorarioLaboralDto) => void;
}

export function HorarioLaboralForm({
  valoresIniciales,
  soloLectura,
  guardando,
  errorServidor,
  onGuardar,
}: HorarioLaboralFormProps) {
  const {
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formShape),
    defaultValues: { dias: desdeHorario(valoresIniciales) },
  });

  useEffect(() => {
    reset({ dias: desdeHorario(valoresIniciales) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valoresIniciales]);

  const dias = watch("dias");
  const errorRaiz = typeof errors.dias?.message === "string" ? errors.dias.message : undefined;

  function submit(values: FormValues) {
    onGuardar(aDto(values.dias));
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-2" noValidate>
      {dias.map((dia, index) => (
        <HorarioLaboralFila
          key={dia.diaSemana}
          nombreDia={NOMBRES_DIAS[dia.diaSemana]}
          abierto={dia.abierto}
          apertura={dia.apertura}
          cierre={dia.cierre}
          soloLectura={soloLectura}
          errorApertura={errors.dias?.[index]?.apertura?.message}
          errorCierre={errors.dias?.[index]?.cierre?.message}
          onCambiarAbierto={(abierto) => setValue(`dias.${index}.abierto`, abierto, { shouldValidate: true })}
          onCambiarApertura={(valor) => setValue(`dias.${index}.apertura`, valor, { shouldValidate: true })}
          onCambiarCierre={(valor) => setValue(`dias.${index}.cierre`, valor, { shouldValidate: true })}
        />
      ))}

      {errorRaiz && (
        <p role="alert" className="text-sm text-destructive">
          {errorRaiz}
        </p>
      )}

      {errorServidor && (
        <p role="alert" className="text-sm text-destructive">
          {errorServidor}
        </p>
      )}

      {!soloLectura && (
        <div className="flex justify-end pt-2">
          <Button type="submit" isLoading={guardando}>
            Guardar
          </Button>
        </div>
      )}
    </form>
  );
}
