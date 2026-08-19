"use client";

/**
 * KbArticuloForm — PRESENTATIONAL. Form crear/editar (R-M3 / T3.4): título +
 * contenido (textarea markdown liviano, sin WYSIWYG pesado, ADR-6). Gate
 * `KB:ALTAS`/`KB:MODIFICACION` lo aplica el caller (`KbArticleCreateDialog`/`KbArticleEditDialog`).
 *
 * El contenido se renderiza como markdown en la vista de detalle
 * (`KbMarkdown`), así que el textarea lleva una ayuda breve que lo anuncia.
 * Deliberadamente NO hay vista previa: el alta y la edición siguen siendo un
 * campo de texto, sin editor visual (ADR-6). La ayuda vive acá, en el form
 * compartido, para que alta y edición no la dupliquen ni se desincronicen.
 */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { kbArticuloSchema, type KbArticuloFormValues } from "../schemas";
import type { CrearKbArticuloDto } from "../types";

export interface KbArticuloFormProps {
  defaultValues?: KbArticuloFormValues;
  onSubmit: (dto: CrearKbArticuloDto) => void;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

export function KbArticuloForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = "Guardar",
}: KbArticuloFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<KbArticuloFormValues>({
    resolver: zodResolver(kbArticuloSchema),
    defaultValues,
  });

  function submit(values: KbArticuloFormValues) {
    onSubmit({
      titulo: values.titulo,
      contenido: values.contenido,
      tipoTicketId: values.tipoTicketId || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="kb-titulo" className="text-sm font-medium text-foreground">
          Título
        </label>
        <Input id="kb-titulo" error={!!errors.titulo} {...register("titulo")} />
        {errors.titulo && (
          <p role="alert" className="text-sm text-destructive">
            {errors.titulo.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="kb-contenido" className="text-sm font-medium text-foreground">
          Contenido
        </label>
        <Textarea
          id="kb-contenido"
          className="min-h-[240px]"
          error={!!errors.contenido}
          aria-describedby="kb-contenido-ayuda"
          {...register("contenido")}
        />
        <p id="kb-contenido-ayuda" className="text-xs text-muted-foreground">
          Acepta formato markdown: <code className="font-mono">##</code> para títulos,{" "}
          <code className="font-mono">-</code> para listas, <code className="font-mono">**texto**</code> para negrita.
        </p>
        {errors.contenido && (
          <p role="alert" className="text-sm text-destructive">
            {errors.contenido.message}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" isLoading={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
