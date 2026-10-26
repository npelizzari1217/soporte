"use client";

/**
 * CrearApiClaveDialog — alta de una clave de la API pública (api-publica, T9 /
 * CA3, CA9): nombre y un subconjunto de `PERMISOS_API`. El body se valida con
 * `crearApiClaveBodySchema` antes de enviarlo; el backend re-valida lo mismo.
 *
 * Al crear, el diálogo se cierra y la clave en claro sale por `onClaveCreada`
 * (ver `useCrearApiClave`): este componente nunca la guarda. Un 422 (por
 * ejemplo, la API del cliente deshabilitada) lo informa `notifyError` en el
 * hook y el diálogo queda abierto.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useCrearApiClave } from "../hooks/use-api-claves-mutations";
import { crearApiClaveBodySchema, ETIQUETAS_PERMISO_API, PERMISOS_API } from "../schemas";
import type { PermisoApi } from "../types";

export interface CrearApiClaveDialogProps {
  onClaveCreada: (clave: string) => void;
}

export function CrearApiClaveDialog({ onClaveCreada }: CrearApiClaveDialogProps) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [permisos, setPermisos] = useState<PermisoApi[]>([]);
  const [errores, setErrores] = useState<string[]>([]);
  const crearMutation = useCrearApiClave(onClaveCreada);

  function abrirOCerrar(next: boolean) {
    setOpen(next);
    if (next) {
      setNombre("");
      setPermisos([]);
      setErrores([]);
    }
  }

  function alternar(permiso: PermisoApi, marcado: boolean) {
    setPermisos((actuales) =>
      marcado ? PERMISOS_API.filter((p) => p === permiso || actuales.includes(p)) : actuales.filter((p) => p !== permiso),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = crearApiClaveBodySchema.safeParse({ nombre, permisos });
    if (!parsed.success) {
      setErrores(parsed.error.issues.map((issue) => issue.message));
      return;
    }
    setErrores([]);
    crearMutation.mutate(parsed.data, { onSuccess: () => setOpen(false) });
  }

  return (
    <Dialog open={open} onOpenChange={abrirOCerrar}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nueva clave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva clave de API</DialogTitle>
          <DialogDescription>
            Use un nombre que identifique al sistema que la va a usar, y otórguele solo los permisos que necesita.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1">
            <label htmlFor="api-clave-nombre" className="text-sm font-medium text-foreground">
              Nombre
            </label>
            <Input id="api-clave-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Permisos</legend>
            {PERMISOS_API.map((permiso) => (
              <label key={permiso} className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox
                  checked={permisos.includes(permiso)}
                  onCheckedChange={(checked) => alternar(permiso, checked === true)}
                />
                {ETIQUETAS_PERMISO_API[permiso]}
              </label>
            ))}
          </fieldset>

          {errores.map((error) => (
            <p key={error} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ))}

          <div className="flex justify-end">
            <Button type="submit" isLoading={crearMutation.isPending}>
              Crear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
