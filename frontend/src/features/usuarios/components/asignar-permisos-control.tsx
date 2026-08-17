"use client";

/**
 * AsignarPermisosControl — PRESENTATIONAL. Grilla módulo × acción de la
 * matriz de permisos de un usuario EN EL TENANT DEL ACTOR (ADR-P10,
 * `sdd/matriz-permisos-por-usuario`). Reemplaza a `AsignarModulosControl`
 * (ABM viejo, retirado en WU-7.6).
 *
 * ROOT y ADMINISTRADOR ven TODA la matriz por su bypass (R2) — para un
 * ADMINISTRADOR la edición no tiene efecto, así que se deshabilita y se
 * muestra una nota (`esAdministrador` en la respuesta del GET, ADR-P10: el
 * backend informa, el frontend no re-deriva del rol).
 *
 * Grilla: filas = módulos (`CATALOGO_MODULOS`), columnas = las 6 acciones
 * "piso" (deshabilitadas cuando el módulo no las declara soportar, R1) +
 * las acciones "extra" propias de cada módulo, listadas aparte.
 *
 * La query de permisos actuales (`useUsuarioPermisos`) se activa recién
 * cuando el popover se abre, mismo criterio que el ABM viejo (evita un
 * request por fila de la tabla).
 */
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ACCIONES_PISO, CATALOGO_MODULOS, type CodigoAccion, type Modulo } from "@/shared/auth/acciones";
import { useAsignarPermisos, useUsuarioPermisos } from "../hooks/use-usuario-permisos";
import type { UsuarioTenant } from "../types";

export interface AsignarPermisosControlProps {
  usuario: UsuarioTenant;
}

const MODULOS = Object.keys(CATALOGO_MODULOS) as Modulo[];

export function AsignarPermisosControl({ usuario }: AsignarPermisosControlProps) {
  const [open, setOpen] = useState(false);
  const [seleccion, setSeleccion] = useState<CodigoAccion[]>([]);

  const permisosQuery = useUsuarioPermisos(usuario.id, open);
  const mutation = useAsignarPermisos(usuario.id);

  // Sincroniza la selección local con las celdas actuales cuando llegan del
  // backend (al abrir el popover). El usuario edita sobre esa base.
  useEffect(() => {
    if (permisosQuery.data) {
      setSeleccion(permisosQuery.data.celdas);
    }
  }, [permisosQuery.data]);

  const toggleCelda = (celda: CodigoAccion, checked: boolean) => {
    setSeleccion((prev) =>
      checked ? [...new Set([...prev, celda])] : prev.filter((c) => c !== celda),
    );
  };

  const esAdministrador = permisosQuery.data?.esAdministrador ?? false;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" />
          Permisos
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[28rem]">
        <p className="mb-3 text-sm font-medium">Permisos de {usuario.nombre}</p>

        {permisosQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : esAdministrador ? (
          <p className="text-sm text-muted-foreground">
            Los administradores ve toda la matriz habilitada. La asignación no tiene efecto.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              {MODULOS.map((modulo) => {
                const def = CATALOGO_MODULOS[modulo];
                return (
                  <div key={modulo} className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{modulo}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {[...ACCIONES_PISO, ...def.extras].map((accion) => {
                        const celda = `${modulo}:${accion}` as CodigoAccion;
                        const soportada =
                          (def.piso as readonly string[]).includes(accion) ||
                          (def.extras as readonly string[]).includes(accion);
                        return (
                          <Label
                            key={celda}
                            htmlFor={`permiso-${usuario.id}-${celda}`}
                            className="flex items-center gap-1.5 text-sm font-normal"
                          >
                            <Checkbox
                              id={`permiso-${usuario.id}-${celda}`}
                              aria-label={celda}
                              checked={seleccion.includes(celda)}
                              disabled={!soportada || mutation.isPending}
                              onCheckedChange={(checked) => toggleCelda(celda, checked === true)}
                            />
                            {accion}
                          </Label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                size="sm"
                isLoading={mutation.isPending}
                disabled={permisosQuery.isLoading}
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
