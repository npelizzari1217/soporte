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
 * las acciones "extra" propias de cada módulo, listadas aparte. Cada fila se
 * encabeza con el nombre legible del módulo (`ETIQUETAS_MODULOS`, el mismo
 * que muestra el menú lateral); las acciones sí van con su código.
 *
 * La query de permisos actuales (`useUsuarioPermisos`) se activa recién
 * cuando el diálogo se abre, mismo criterio que el ABM viejo (evita un
 * request por fila de la tabla).
 *
 * "Reaplicar plantilla del rol" (`POST /permisos/aplicar-preset`) vive ACÁ y no
 * en `CambiarRolControl` porque reaplicar una plantilla es una operación de
 * PERMISOS, no de cambio de rol. Antes era un checkbox de aquel control, cuyo
 * `Guardar` está deshabilitado mientras el rol no cambie: quedaba INALCANZABLE
 * justo en el caso más pedido — dejar a alguien con la matriz limpia de su rol
 * actual, sin moverlo de rol. Como SOBRESCRIBE la matriz (pisa los ajustes
 * finos hechos a mano en la grilla), pide confirmación explícita.
 *
 * Se edita en un DIÁLOGO MODAL centrado, no en un popover anclado a la fila:
 * el catálogo completo es más alto que el popover y el botón `Guardar` —
 * único control que persiste — quedaba fuera del viewport, sin scroll para
 * alcanzarlo. Acá el alto se acota con `max-h-[85vh]` y lo que scrollea es
 * SOLO la zona de módulos, así el título y el pie con `Guardar` quedan
 * siempre a la vista por más módulos o acciones que sume el catálogo.
 */
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ACCIONES_PISO, CATALOGO_MODULOS, type CodigoAccion, type Modulo } from "@/shared/auth/acciones";
import { etiquetaDeModulo } from "@/shared/auth/etiquetas-modulos";
import {
  useAplicarPresetPermisos,
  useAsignarPermisos,
  useUsuarioPermisos,
} from "../hooks/use-usuario-permisos";
import type { UsuarioTenant } from "../types";

export interface AsignarPermisosControlProps {
  usuario: UsuarioTenant;
}

const MODULOS = Object.keys(CATALOGO_MODULOS) as Modulo[];

export function AsignarPermisosControl({ usuario }: AsignarPermisosControlProps) {
  const [open, setOpen] = useState(false);
  const [seleccion, setSeleccion] = useState<CodigoAccion[]>([]);
  const [confirmandoPlantilla, setConfirmandoPlantilla] = useState(false);

  const permisosQuery = useUsuarioPermisos(usuario.id, open);
  const mutation = useAsignarPermisos(usuario.id);
  const plantillaMutation = useAplicarPresetPermisos(usuario.id);

  // Sincroniza la selección local con las celdas actuales cuando llegan del
  // backend (al abrir el diálogo). El usuario edita sobre esa base.
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

  /**
   * Reaplica la plantilla del rol ACTUAL del usuario. La respuesta invalida
   * `["usuario-permisos", id]`, el refetch devuelve las celdas nuevas y el
   * `useEffect` de arriba resiembra `seleccion` — así un `Guardar` posterior
   * manda el set nuevo y no pisa la plantilla con lo que había antes.
   */
  function confirmarReaplicarPlantilla() {
    plantillaMutation.mutate(usuario.rol);
    setConfirmandoPlantilla(false);
  }

  const esAdministrador = permisosQuery.data?.esAdministrador ?? false;
  const ocupado = mutation.isPending || plantillaMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <SlidersHorizontal className="mr-1 h-4 w-4" aria-hidden="true" />
          Permisos
        </Button>
      </DialogTrigger>
      {/* `max-h-[85vh]` acota el modal a la pantalla; el scroll va adentro. */}
      {/*
        `overflow-hidden` PISA el `overflow-y-auto` que el átomo trae por
        defecto: acá el scroll es INTERNO (sólo la zona de módulos), para que
        el pie con `Guardar` nunca se vaya de la vista. Si scrolleara también
        el contenedor, volveríamos al bug que este modal vino a arreglar.
      */}
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Permisos de {usuario.nombre}</DialogTitle>
        </DialogHeader>

        {permisosQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : esAdministrador ? (
          <p className="text-sm text-muted-foreground">
            Los administradores ven toda la matriz habilitada. La asignación no tiene efecto.
          </p>
        ) : (
          <>
            {/*
              Única zona scrolleable del modal: `min-h-0` habilita que el flex
              padre la achique (sin él, el contenido la infla y vuelve a empujar
              el pie fuera de la pantalla) y `flex-1` le da el alto sobrante.
            */}
            <div
              data-testid="permisos-modulos"
              className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2"
            >
              {MODULOS.map((modulo) => {
                const def = CATALOGO_MODULOS[modulo];
                return (
                  <div key={modulo} className="flex flex-col gap-1.5">
                    {/*
                      Nombre legible, el mismo que el menú lateral: el código
                      crudo ("KB") no se entiende. El código sigue viajando en
                      el `aria-label` de cada checkbox.
                    */}
                    <p className="text-xs font-semibold text-muted-foreground">
                      {etiquetaDeModulo(modulo)}
                    </p>
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
                              disabled={!soportada || ocupado}
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
            {/* Pie fijo: fuera de la zona scrolleable, siempre visible. */}
            <DialogFooter>
              {/*
                Acción secundaria (`outline`): `Guardar` sigue siendo la
                primaria. Reaplicar la plantilla no persiste la grilla editada
                — la reemplaza en el backend y la grilla se resiembra sola.
              */}
              <Button
                type="button"
                size="sm"
                variant="outline"
                isLoading={plantillaMutation.isPending}
                disabled={permisosQuery.isLoading || mutation.isPending}
                onClick={() => setConfirmandoPlantilla(true)}
              >
                Reaplicar plantilla del rol
              </Button>
              <Button
                type="button"
                size="sm"
                isLoading={mutation.isPending}
                disabled={permisosQuery.isLoading || plantillaMutation.isPending}
                onClick={() => mutation.mutate(seleccion)}
              >
                Guardar
              </Button>
            </DialogFooter>
            {/*
              Se monta ENCIMA del modal de permisos (Radix apila el foco: el
              scope del `AlertDialog` pausa al del `Dialog` mientras está
              abierto).
            */}
            <ConfirmDialog
              open={confirmandoPlantilla}
              onOpenChange={setConfirmandoPlantilla}
              title="Reaplicar plantilla del rol"
              description={`Vas a SOBRESCRIBIR la matriz de permisos de "${usuario.nombre} ${usuario.apellido}" con la plantilla del rol ${usuario.rol}. Los ajustes manuales hechos en la grilla se pierden. ¿Confirmás?`}
              confirmLabel="Confirmar"
              onConfirm={confirmarReaplicarPlantilla}
              isConfirming={plantillaMutation.isPending}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
