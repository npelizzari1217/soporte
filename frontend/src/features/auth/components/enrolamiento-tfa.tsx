"use client";

/**
 * EnrolamientoTfa — PRESENTATIONAL component del enrolamiento obligatorio (paso del login).
 *
 * Muestra el QR del `otpauthUri` (dibujado como SVG propio con `uqr`, igual que el QR de equipos) y
 * la clave manual para quien no puede escanear; confirma con un código de 6 dígitos. El error de
 * código lo comunica el container (toast).
 *
 * Spec: sdd/verificacion-dos-pasos — T4, L5.
 */

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ladoQr, matrizQr, pathQr } from "@/features/equipos/qr-equipo";

interface EnrolamientoTfaProps {
  datos: { otpauthUri: string; claveManual: string } | null;
  onConfirmar: (codigo: string) => void;
  isLoading: boolean;
}

export function EnrolamientoTfa({ datos, onConfirmar, isLoading }: EnrolamientoTfaProps) {
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!datos) {
    return (
      <p role="status" className="text-center text-sm text-muted-foreground">
        Preparando la activación…
      </p>
    );
  }

  const matriz = matrizQr(datos.otpauthUri);
  const lado = ladoQr(matriz);

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(codigo)) {
      setError("Ingresá el código de 6 dígitos de tu app.");
      return;
    }
    setError(null);
    onConfirmar(codigo);
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-muted-foreground">
        Escaneá el QR con tu app autenticadora (Google Authenticator, Authy, etc.) y escribí el código que muestra.
      </p>
      <svg
        role="img"
        aria-label="QR para configurar la app autenticadora"
        viewBox={`0 0 ${lado} ${lado}`}
        className="mx-auto h-48 w-48 rounded border bg-white"
        shapeRendering="crispEdges"
      >
        <rect width={lado} height={lado} fill="#ffffff" />
        <path d={pathQr(matriz)} fill="#000000" />
      </svg>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="clave-manual" className="text-sm font-medium text-foreground">
          ¿No podés escanear? Cargá esta clave a mano
        </label>
        <input
          id="clave-manual"
          readOnly
          value={datos.claveManual}
          onFocus={(e) => e.currentTarget.select()}
          className="rounded border bg-muted px-2 py-1 font-mono text-sm"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="codigo-enrolamiento" className="text-sm font-medium text-foreground">
          Código de verificación
        </label>
        <Input
          id="codigo-enrolamiento"
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={isLoading}
          placeholder="123456"
          error={!!error}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" isLoading={isLoading} className="w-full">
        Activar
      </Button>
    </form>
  );
}
