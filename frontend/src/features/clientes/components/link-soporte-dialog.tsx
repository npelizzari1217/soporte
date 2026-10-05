"use client";

/**
 * LinkSoporteDialog — muestra y copia el link GENÉRICO de soporte del cliente de la sesión
 * (`${APP_BASE_URL}/c/<slug>/pedido`, sin equipo; el QR por equipo es otra cosa).
 * Lo ve CUALQUIER usuario del cliente, y solo cuando el backend devuelve un link: sin link
 * (formulario deshabilitado, sin slug o cliente inactivo) no renderiza nada.
 */
import { useState } from "react";
import { Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/shared/hooks/use-session";
import { notifySuccess } from "@/shared/lib/toast";
import { toast } from "sonner";
import { useLinkSoporte } from "../hooks/use-link-soporte";

export function LinkSoporteDialog() {
  const { user } = useSession();
  const { data } = useLinkSoporte(user?.cliente_id ?? null);
  const [open, setOpen] = useState(false);
  const url = data?.url ?? null;

  if (!url) return null;

  async function copiar(valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      notifySuccess("Link copiado.");
    } catch {
      // Sin permiso de portapapeles (o contexto no seguro): el campo sigue seleccionable.
      toast.error("No se pudo copiar. Seleccioná el link y copialo a mano.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Link2 className="mr-1 h-4 w-4" aria-hidden="true" />
          Link de soporte
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link de soporte</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Compartí este link con quien quieras: cualquiera que lo tenga puede pedir soporte, y los
            tickets llegan a este cliente. Abre el formulario sin un equipo preseleccionado.
          </p>
          <div className="flex items-center gap-2">
            <Input
              readOnly
              aria-label="Link de soporte"
              value={url}
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button type="button" onClick={() => void copiar(url)}>
              Copiar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
