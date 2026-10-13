"use client";

/**
 * WebhookConfigForm — PRESENTATIONAL: URL, eventos suscriptos y activo del
 * destino del webhook (webhooks, T7 / CA1, CA6, CA8). Valida con
 * `guardarWebhookBodySchema` antes de llamar a `onGuardar`; el backend
 * re-valida y además resuelve el host. `errorServidor` es el aviso del último
 * guardado fallido (`avisoErrorWebhook`).
 *
 * Arranca de `inicial`; el caller lo remonta (`key`) cuando cambia lo guardado.
 * Sin destino, propone los cuatro eventos y el destino activo.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ETIQUETAS_EVENTO_WEBHOOK, EVENTOS_WEBHOOK, guardarWebhookBodySchema } from "../schemas";
import type { EventoWebhook, GuardarWebhookBody, WebhookConfig } from "../types";

export interface WebhookConfigFormProps {
  inicial: WebhookConfig;
  guardando: boolean;
  errorServidor?: string;
  onGuardar: (body: GuardarWebhookBody) => void;
}

export function WebhookConfigForm({ inicial, guardando, errorServidor, onGuardar }: WebhookConfigFormProps) {
  const [url, setUrl] = useState(inicial.url ?? "");
  const [eventos, setEventos] = useState<EventoWebhook[]>(inicial.eventos ?? [...EVENTOS_WEBHOOK]);
  const [activo, setActivo] = useState(inicial.activo ?? true);
  const [errores, setErrores] = useState<string[]>([]);

  function alternar(evento: EventoWebhook, marcado: boolean) {
    setEventos((actuales) =>
      marcado ? EVENTOS_WEBHOOK.filter((e) => e === evento || actuales.includes(e)) : actuales.filter((e) => e !== evento),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = guardarWebhookBodySchema.safeParse({ url, eventos, activo });
    if (!parsed.success) {
      setErrores(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    setErrores([]);
    onGuardar(parsed.data);
  }

  return (
    <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="webhook-url" className="text-sm font-medium text-foreground">
          URL de destino
        </label>
        <Input
          id="webhook-url"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Eventos</legend>
        {EVENTOS_WEBHOOK.map((evento) => (
          <label key={evento} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={eventos.includes(evento)} onCheckedChange={(checked) => alternar(evento, checked === true)} />
            {ETIQUETAS_EVENTO_WEBHOOK[evento]}
          </label>
        ))}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-foreground">
        <Checkbox checked={activo} onCheckedChange={(checked) => setActivo(checked === true)} />
        Activo
      </label>
      <p className="-mt-3 text-xs text-muted-foreground">
        Desactivado, no se registran avisos nuevos y los pendientes esperan hasta que lo vuelvas a activar.
      </p>

      {[...errores, ...(errorServidor ? [errorServidor] : [])].map((error) => (
        <p key={error} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ))}

      <div>
        <Button type="submit" isLoading={guardando}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
