"use client";

/**
 * AsignarModulosControl — PRESENTATIONAL. Asigna los módulos funcionales de un
 * usuario EN EL TENANT DEL ACTOR (feature 5.2 CAPA 4). Reversible (reemplazo
 * del set completo) — sin `ConfirmDialog`.
 *
 * ROOT y ADMINISTRADOR ven TODOS los módulos por su flag/rol (no dependen de
 * la tabla `usuario_cliente_modulos`); para un ADMINISTRADOR la edición no
 * tiene efecto, así que se deshabilita y se muestra una nota.
 *
 * La query de módulos actuales (`useUsuarioModulos`) se activa recién cuando
 * el popover se abre, para no disparar un request por cada fila de la tabla.
 */
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MODULOS } from "@/shared/auth/modulo-access";
import { useAsignarModulos, useUsuarioModulos } from "../hooks/use-usuario-modulos";
import type { UsuarioTenant } from "../types";

export interface AsignarModulosControlProps {
  usuario: UsuarioTenant;
}

export function AsignarModulosControl({ usuario }: AsignarModulosControlProps) {
  const esAdministrador = usuario.rol === "ADMINISTRADOR";
  const [open, setOpen] = useState(false);
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const modulosQuery = useUsuarioModulos(usuario.id, open && !esAdministrador);
  const mutation = useAsignarModulos(usuario.id);

  // Sincroniza la selección local con los módulos actuales cuando llegan del
  // backend (al abrir el popover). El usuario edita sobre esa base.
  useEffect(() => {
    if (modulosQuery.data) {
      setSeleccion(modulosQuery.data);
    }
  }, [modulosQuery.data]);

  const toggleModulo = (modulo: string, checked: boolean) => {
    setSeleccion((prev) =>
      checked ? [...new Set([...prev, modulo])] : prev.filter((m) => m !== modulo),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" />
          Módulos
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <p className="mb-3 text-sm font-medium">Módulos de {usuario.nombre}</p>

        {esAdministrador ? (
          <p className="text-sm text-muted-foreground">
            Los administradores ven todos los módulos. La asignación no tiene efecto.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {MODULOS.map((modulo) => (
                <Label
                  key={modulo}
                  htmlFor={`modulo-${usuario.id}-${modulo}`}
                  className="flex items-center gap-2 font-normal"
                >
                  <Checkbox
                    id={`modulo-${usuario.id}-${modulo}`}
                    checked={seleccion.includes(modulo)}
                    disabled={modulosQuery.isLoading || mutation.isPending}
                    onCheckedChange={(checked) => toggleModulo(modulo, checked === true)}
                  />
                  {modulo}
                </Label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                size="sm"
                isLoading={mutation.isPending}
                disabled={modulosQuery.isLoading}
                onClick={() => mutation.mutate(seleccion)}
              >
                Guardar
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
