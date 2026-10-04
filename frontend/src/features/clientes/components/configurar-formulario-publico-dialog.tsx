"use client";

/**
 * ConfigurarFormularioPublicoDialog — carga el slug y prende/apaga el
 * formulario público de pedidos de UN cliente (sdd/formulario-publico-qr,
 * WU-3, D7 y D12). Diálogo SEPARADO de `EditarClienteDialog`, mismo criterio
 * que `ConfigurarCsatDialog`: el backend separa `/formulario-publico` en una
 * ruta propia, así que la edición comercial y esta configuración nunca
 * comparten body. Exclusivo ROOT (el caller ya gatea por `isGlobalAdmin`).
 *
 * Manda solo lo que cambió. El backend es la autoridad de las reglas que el
 * front no puede saber (slug congelado por un QR emitido, duplicado, forma de
 * UUID): esos casos vuelven como error y los muestra el toast del hook.
 */
import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { configurarFormularioPublicoSchema } from "../schemas";
import { useConfigurarFormularioPublicoCliente } from "../hooks/use-clientes-mutations";
import type { Cliente, ConfigurarFormularioPublicoDto } from "../types";

export interface ConfigurarFormularioPublicoDialogProps {
  cliente: Cliente;
}

export function ConfigurarFormularioPublicoDialog({ cliente }: ConfigurarFormularioPublicoDialogProps) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(cliente.slug ?? "");
  const [habilitado, setHabilitado] = useState(cliente.formularioPublicoHabilitado);
  const [error, setError] = useState<string | null>(null);
  const configurarMutation = useConfigurarFormularioPublicoCliente(cliente.id);

  // Reabrir el diálogo siempre refleja el valor real del cliente, no un
  // estado local viejo de una apertura anterior sin guardar.
  useEffect(() => {
    if (open) {
      setSlug(cliente.slug ?? "");
      setHabilitado(cliente.formularioPublicoHabilitado);
      setError(null);
    }
  }, [open, cliente.slug, cliente.formularioPublicoHabilitado]);

  function submit() {
    const slugLimpio = slug.trim();
    const dto: ConfigurarFormularioPublicoDto = {};

    if (slugLimpio !== (cliente.slug ?? "")) {
      const parsed = configurarFormularioPublicoSchema.shape.slug.safeParse(slugLimpio);
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      dto.slug = parsed.data;
    }
    if (habilitado && slugLimpio === "") {
      setError("Cargá un slug antes de habilitar el formulario público.");
      return;
    }
    if (habilitado !== cliente.formularioPublicoHabilitado) dto.habilitado = habilitado;

    setError(null);
    if (Object.keys(dto).length === 0) {
      setOpen(false);
      return;
    }
    configurarMutation.mutate(dto, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Formulario público de ${cliente.nombre}`}>
          <Link2 className="h-4 w-4" aria-hidden="true" />
          Formulario
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Formulario público — {cliente.nombre}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={`slug-${cliente.id}`} className="text-sm font-medium text-foreground">
              Slug
            </label>
            <Input
              id={`slug-${cliente.id}`}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="colegio-norte"
              autoComplete="off"
              aria-invalid={error !== null}
            />
            <p className="text-xs text-muted-foreground">
              Identifica al cliente en la dirección pública. Solo minúsculas, números y guiones. Una vez
              que se emite el primer QR de un equipo, ya no se puede cambiar.
            </p>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={habilitado} onCheckedChange={(checked) => setHabilitado(checked === true)} />
            Formulario público habilitado
          </label>
          <p className="text-xs text-muted-foreground">
            Con el formulario habilitado, quien tenga el link o escanee un QR puede pedir soporte sin
            tener usuario. Si el cliente no tiene correo configurado, solo pueden pedir los usuarios con
            sesión iniciada. Apagado, el link deja de funcionar.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" isLoading={configurarMutation.isPending} onClick={submit}>
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
