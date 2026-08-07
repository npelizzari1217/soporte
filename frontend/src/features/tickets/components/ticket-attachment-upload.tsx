"use client";

/**
 * TicketAttachmentUpload — PRESENTATIONAL. Valida cliente-side ANTES de
 * llamar `onUpload` (`validarAdjuntoCliente`, mirror del pipe backend,
 * T21/T1.13) — evita un roundtrip de red que el backend rechazaría con 422.
 */
import { useState, type ChangeEvent } from "react";
import { Paperclip } from "lucide-react";
import { validarAdjuntoCliente } from "../lib/validar-adjunto-cliente";

export interface TicketAttachmentUploadProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export function TicketAttachmentUpload({ onUpload, isUploading }: TicketAttachmentUploadProps) {
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const validationError = validarAdjuntoCliente(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onUpload(file);
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor="ticket-adjuntar-archivo"
        className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-primary hover:underline"
      >
        <Paperclip className="h-4 w-4" aria-hidden="true" />
        Adjuntar archivo
      </label>
      <input
        id="ticket-adjuntar-archivo"
        type="file"
        className="sr-only"
        disabled={isUploading}
        onChange={handleChange}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
