"use client";

/**
 * ConfigurarLogoDialog — carga, reemplaza y quita el logo de UN cliente
 * (design.md D5/D8, sdd/logo-por-cliente WU4). Diálogo SEPARADO de
 * `EditarClienteDialog`, mismo criterio que `ConfigurarCorreoDialog`/
 * `ConfigurarCsatDialog`: el backend separa `/logo` en rutas propias.
 * Exclusivo ROOT (el caller ya gatea por `isGlobalAdmin`).
 *
 * Al abrir muestra el logo VIGENTE desde `GET /clientes/:id/logo` (el mismo
 * endpoint del sidebar; ROOT puede leer el de cualquier cliente, issue #354).
 * `GET /clientes` no expone `logoUpdatedAt`, así que no se sabe de antemano si
 * hay logo: se intenta cargar y, si falla (404 = sin logo), queda el ícono
 * genérico. Cada apertura usa una versión nueva en la URL para no mostrar un
 * logo cacheado después de subir o quitar. Elegir un archivo lo reemplaza por
 * la vista previa client-side (`URL.createObjectURL`) del archivo RECIÉN
 * elegido, antes de subirlo.
 *
 * "Quitar logo" se ofrece SIEMPRE, sin necesitar saber de antemano si el
 * cliente tiene uno — el `DELETE` es idempotente en el backend (spec, regla
 * 11), detrás de `ConfirmDialog` por ser destructivo.
 *
 * Validación cliente-side (`validarLogoClienteCliente`, espejo de
 * `validarLogoCliente` del backend, design.md D7): rechaza SVG y >512 KB
 * ANTES de habilitar "Subir", con feedback inline (`role="alert"`) — evita
 * un roundtrip que el backend rechazaría igual con 422. La mutación
 * (`useSubirLogoCliente`) repite la misma validación como defensa en
 * profundidad; en el flujo normal nunca se dispara porque el botón ya está
 * deshabilitado.
 */
import { useEffect, useState, type ChangeEvent } from "react";
import { Building2, ImageUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useQuitarLogoCliente, useSubirLogoCliente } from "../hooks/use-clientes-mutations";
import { validarLogoClienteCliente } from "../lib/validar-logo-cliente-cliente";
import type { Cliente } from "../types";

export interface ConfigurarLogoDialogProps {
  cliente: Cliente;
}

export function ConfigurarLogoDialog({ cliente }: ConfigurarLogoDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [versionVigente, setVersionVigente] = useState(0);
  const [vigenteNoCarga, setVigenteNoCarga] = useState(false);
  const subirMutation = useSubirLogoCliente(cliente.id);
  const quitarMutation = useQuitarLogoCliente(cliente.id);

  // Reabrir arranca sin selección — la vista previa es solo del archivo
  // recién elegido, nunca sobrevive a un cierre. Revoca la object URL
  // anterior para no filtrar memoria entre aperturas.
  useEffect(() => {
    if (open) {
      setVersionVigente(Date.now());
      setVigenteNoCarga(false);
      return;
    }
    setFile(null);
    setError(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [open]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;

    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(selected);
    });
    setError(validarLogoClienteCliente(selected));
    setFile(selected);
  }

  function submit() {
    if (!file || error) return;
    subirMutation.mutate(file, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Logo de ${cliente.nombre}`}>
          <ImageUp className="h-4 w-4" aria-hidden="true" />
          Logo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Logo — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-input bg-muted">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa de un archivo local recién elegido (blob:), next/image no soporta ese esquema
              <img
                src={previewUrl}
                alt="Vista previa del logo seleccionado"
                className="h-full w-full object-contain"
              />
            ) : !vigenteNoCarga && versionVigente > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element -- binario autenticado servido por el BFF, mismo criterio que el logo del sidebar
              <img
                src={`/api/clientes/${cliente.id}/logo?v=${versionVigente}`}
                alt={`Logo actual de ${cliente.nombre}`}
                className="h-full w-full object-contain"
                onError={() => setVigenteNoCarga(true)}
              />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            )}
          </div>

          <label
            htmlFor={`logo-archivo-${cliente.id}`}
            className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm text-primary hover:underline"
          >
            Elegir archivo
          </label>
          <input
            id={`logo-archivo-${cliente.id}`}
            type="file"
            // Sin `accept`: mismo criterio que `TicketAttachmentUpload`
            // (tickets, T21) — un `accept` HTML es solo un filtro del selector
            // nativo, ignorable por drag&drop o "Todos los archivos", así que
            // la validación real es SIEMPRE `validarLogoClienteCliente`
            // (`role="alert"` de abajo). `accept` además rompería la prueba
            // adversarial de este control: `user-event` filtra archivos que
            // no matchean el atributo ANTES de disparar `onChange`.
            className="sr-only"
            disabled={subirMutation.isPending}
            onChange={handleChange}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            PNG, JPEG o WebP, hasta 512 KB. Los usuarios lo verán en su próximo inicio de sesión.
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <ConfirmDialog
            trigger={
              <Button type="button" variant="destructive" size="sm">
                Quitar logo
              </Button>
            }
            title="Quitar logo"
            description={`¿Confirmás quitar el logo de "${cliente.nombre}"? Sus usuarios verán el ícono genérico en su próximo inicio de sesión.`}
            confirmLabel="Quitar"
            confirmVariant="destructive"
            isConfirming={quitarMutation.isPending}
            onConfirm={() => quitarMutation.mutate(undefined, { onSuccess: () => setOpen(false) })}
          />
          <Button
            type="button"
            disabled={!file || !!error}
            isLoading={subirMutation.isPending}
            onClick={submit}
          >
            Subir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
