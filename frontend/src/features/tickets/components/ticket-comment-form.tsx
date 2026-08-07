"use client";

/**
 * TicketCommentForm — PRESENTATIONAL. El toggle "comentario interno" solo
 * se RENDERIZA con `ticket:observar` (ADR-4: gate en cliente, el backend
 * además lo re-valida — `TicketsController.comentar` devuelve 403 si
 * `esInterno=true` sin el permiso). Sin el permiso, `esInterno` siempre
 * viaja `false` — nunca puede enviarse `true` por accidente porque el
 * control ni existe en el DOM.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useCan } from "@/shared/hooks/use-can";
import { comentarioSchema, type ComentarioFormValues } from "../schemas";

export interface TicketCommentFormProps {
  onSubmit: (values: ComentarioFormValues) => void;
  isSubmitting: boolean;
}

export function TicketCommentForm({ onSubmit, isSubmitting }: TicketCommentFormProps) {
  const puedeObservar = useCan("ticket:observar");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ComentarioFormValues>({
    resolver: zodResolver(comentarioSchema),
    defaultValues: { texto: "", esInterno: false },
  });

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
