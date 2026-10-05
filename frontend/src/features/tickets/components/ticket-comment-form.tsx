"use client";

/**
 * TicketCommentForm — PRESENTATIONAL. El toggle "comentario interno" solo
 * se RENDERIZA con `TICKETS:OBSERVAR` (ADR-4: gate en cliente, el backend
 * además lo re-valida — `TicketsController.comentar` devuelve 403 si
 * `esInterno=true` sin el permiso). Sin el permiso, `esInterno` siempre
 * viaja `false` — nunca puede enviarse `true` por accidente porque el
 * control ni existe en el DOM.
 *
 * "Insertar respuesta": selector de respuestas predefinidas ACTIVAS (roadmap segunda etapa,
 * punto 4). Solo vuelca el texto en el textarea para que el usuario lo edite — NUNCA envía.
 * Si el textarea ya tiene texto, la respuesta se agrega en una línea nueva sin pisarlo. Sin
 * respuestas activas el selector no se renderiza. El texto se inserta tal cual (sin variables).
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { useRespuestasPredefinidas } from "@/features/respuestas-predefinidas/hooks/use-respuestas-predefinidas";
import { useCan } from "@/shared/hooks/use-can";
import { comentarioSchema, type ComentarioFormValues } from "../schemas";

export interface TicketCommentFormProps {
  onSubmit: (values: ComentarioFormValues) => void;
  isSubmitting: boolean;
}

export function TicketCommentForm({ onSubmit, isSubmitting }: TicketCommentFormProps) {
  const puedeObservar = useCan("TICKETS:OBSERVAR");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    reset,
    formState: { errors },
  } = useForm<ComentarioFormValues>({
    resolver: zodResolver(comentarioSchema),
    defaultValues: { texto: "", esInterno: false },
  });

  const respuestasQuery = useRespuestasPredefinidas(true);
  const respuestas = respuestasQuery.data ?? [];

  function insertarRespuesta(id: string) {
    const respuesta = respuestas.find((r) => r.id === id);
    if (!respuesta) return;
    const actual = getValues("texto");
    setValue("texto", actual ? `${actual}\n${respuesta.texto}` : respuesta.texto, {
      shouldDirty: true,
      shouldValidate: !!errors.texto,
    });
  }

  function submit(values: ComentarioFormValues) {
    onSubmit({ texto: values.texto, esInterno: puedeObservar ? (values.esInterno ?? false) : false });
    reset();
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-2" noValidate>
      <label htmlFor="comentario-texto" className="text-sm font-medium text-foreground">
        Comentario
      </label>
      <Textarea
        id="comentario-texto"
        disabled={isSubmitting}
        error={!!errors.texto}
        {...register("texto")}
      />
      {respuestas.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="comentario-respuesta" className="text-sm text-muted-foreground">
            Insertar respuesta
          </label>
          {/* Controlado en "": tras insertar vuelve al placeholder y permite elegir la misma otra vez. */}
          <Select
            id="comentario-respuesta"
            value=""
            disabled={isSubmitting}
            onChange={(event) => insertarRespuesta(event.target.value)}
            className="w-auto"
          >
            <option value="">Elegir…</option>
            {respuestas.map((respuesta) => (
              <option key={respuesta.id} value={respuesta.id}>
                {respuesta.titulo}
              </option>
            ))}
          </Select>
        </div>
      )}
      {errors.texto && (
        <p role="alert" className="text-sm text-destructive">
          {errors.texto.message}
        </p>
      )}

      {puedeObservar && (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            checked={watch("esInterno")}
            onCheckedChange={(checked) => setValue("esInterno", checked === true)}
          />
          Comentario interno (no visible para el solicitante)
        </label>
      )}

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        Enviar
      </Button>
    </form>
  );
}
