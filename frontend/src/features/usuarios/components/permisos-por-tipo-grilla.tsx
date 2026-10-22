"use client";

/**
 * PermisosPorTipoGrilla — sección "Tipos de ticket" de Permisos (odd/permisos-por-tipo-ticket, T7,
 * S1-S3, S5): una fila por tipo de ticket del tenant y una columna por acción.
 *
 * - Sin Ver, el resto de la fila queda deshabilitado (S3): destildar Ver vacía la fila, y el
 *   backend rechaza con 422 cualquier acción sin Ver, así que el control espeja esa regla. Una
 *   fila guardada antes de esta regla puede traer acciones sin Ver: esas casillas se pueden
 *   destildar (quitar nunca viola la regla, conceder sí) y `Guardar` queda deshabilitado hasta
 *   corregirla, porque el backend la rechazaría.
 * - Borrar no tiene columna: borrar un ticket todavía no existe (S8) y el backend no lo concede.
 *   Ofrecerlo, aunque sea deshabilitado, sería mostrar un control sin operación detrás.
 * - "Aplicar plantilla del rol" carga en la fila lo que la plantilla del rol da sobre ese tipo. Lo
 *   calcula el backend (D4); acá solo se copia a la fila y se guarda con `Guardar`.
 * - "Copiar permisos de otro usuario" reemplaza en el servidor todas las filas, previa
 *   confirmación, y la grilla se resiembra con lo guardado.
 *
 * Se monta dentro del diálogo de Permisos, que desmonta su contenido al cerrarse: cada apertura
 * vuelve a pedir el estado vigente y siembra la grilla con él, sin arrastrar lo que quedó sin
 * guardar la vez anterior.
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { AccionTipoTicket } from "@/shared/auth/permisos-por-tipo";
import {
  useCopiarPermisosPorTipo,
  usePermisosPorTipoUsuario,
  useReemplazarPermisosPorTipo,
  type PermisosPorTipoUsuario,
} from "../hooks/use-permisos-por-tipo-usuario";
import { useUsuariosTenant } from "../hooks/use-usuarios-tenant";
import type { UsuarioTenant } from "../types";

/** Columnas de la grilla, en el orden de S1. Sin Borrar: ver el comentario del archivo. */
export const COLUMNAS_POR_TIPO: readonly { accion: AccionTipoTicket; etiqueta: string }[] = [
  { accion: "LECTURA", etiqueta: "Ver" },
  { accion: "VER_TODOS", etiqueta: "Ver todos" },
  { accion: "ALTAS", etiqueta: "Crear" },
  { accion: "MODIFICACION", etiqueta: "Modificar" },
  { accion: "TRANSICIONAR", etiqueta: "Estado" },
  { accion: "ASIGNAR", etiqueta: "Asignar" },
  { accion: "COMENTAR", etiqueta: "Comentar" },
  { accion: "OBSERVAR", etiqueta: "Comentario interno" },
  { accion: "IMPRESION", etiqueta: "Imprimir" },
];

/** Acciones por tipo de la grilla en edición. */
type Filas = Record<string, AccionTipoTicket[]>;

function filasDesde(datos: PermisosPorTipoUsuario): Filas {
  return Object.fromEntries(datos.tipos.map((tipo) => [tipo.tipoId, tipo.acciones]));
}

/**
 * Aplica un tilde o destilde sobre una fila. Destildar Ver vacía la fila: sin Ver no queda
 * ninguna otra acción (S3).
 *
 * @param fila Acciones actuales del tipo.
 * @param accion Acción tocada.
 * @param tildada Nuevo estado del checkbox.
 * @returns Las acciones resultantes.
 */
export function alternarAccion(
  fila: readonly AccionTipoTicket[],
  accion: AccionTipoTicket,
  tildada: boolean,
): AccionTipoTicket[] {
  if (!tildada && accion === "LECTURA") return [];
  if (!tildada) return fila.filter((a) => a !== accion);
  return fila.includes(accion) ? [...fila] : [...fila, accion];
}

/**
 * ¿La fila concede algo sin Ver? El backend la rechaza con 422 (S3).
 *
 * @param fila Acciones del tipo.
 * @returns `true` si tiene acciones y no tiene `LECTURA`.
 */
function filaSinVer(fila: readonly AccionTipoTicket[]): boolean {
  return fila.length > 0 && !fila.includes("LECTURA");
}

export interface PermisosPorTipoGrillaProps {
  usuario: UsuarioTenant;
}

/** Grilla editable de los permisos por tipo de `usuario`. */
export function PermisosPorTipoGrilla({ usuario }: PermisosPorTipoGrillaProps) {
  const permisosQuery = usePermisosPorTipoUsuario(usuario.id, true);
  const usuariosQuery = useUsuariosTenant();
  const guardar = useReemplazarPermisosPorTipo(usuario.id);
  const copiar = useCopiarPermisosPorTipo(usuario.id);
  const [filas, setFilas] = useState<Filas>({});
  const [origenId, setOrigenId] = useState("");
  const [confirmandoCopia, setConfirmandoCopia] = useState(false);

  // Siembra la grilla con el estado del servidor al montar (cada apertura del diálogo) y cada vez
  // que llega uno nuevo: el refetch de la apertura, o la respuesta de guardar o de copiar.
  useEffect(() => {
    if (permisosQuery.data) setFilas(filasDesde(permisosQuery.data));
  }, [permisosQuery.data]);

  if (permisosQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }
  if (permisosQuery.isError || !permisosQuery.data) {
    return (
      <p className="text-sm text-destructive">No se pudieron cargar los permisos por tipo.</p>
    );
  }
  const datos = permisosQuery.data;
  if (datos.sinRestriccion) {
    return (
      <p className="text-sm text-muted-foreground">
        Los administradores operan todos los tipos de ticket. No tienen permisos por tipo para
        editar.
      </p>
    );
  }

  const ocupado = guardar.isPending || copiar.isPending;
  const haySinVer = datos.tipos.some((tipo) => filaSinVer(filas[tipo.tipoId] ?? []));
  // Copiar de un administrador no tiene filas que copiar (el backend lo rechaza): no se ofrece.
  const candidatos = (usuariosQuery.data ?? []).filter(
    (otro) => otro.id !== usuario.id && otro.rol !== "ADMINISTRADOR",
  );
  const origen = candidatos.find((otro) => otro.id === origenId);

  function alternar(tipoId: string, accion: AccionTipoTicket, tildada: boolean) {
    setFilas((previas) => ({
      ...previas,
      [tipoId]: alternarAccion(previas[tipoId] ?? [], accion, tildada),
    }));
  }

  function confirmarCopia() {
    copiar.mutate(origenId);
    setConfirmandoCopia(false);
  }

  return (
    <>
      <div
        data-testid="permisos-tipos"
        className="-mr-2 flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-2"
      >
        {datos.tipos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tipos de ticket cargados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 pr-2 font-semibold">
                  Tipo
                </th>
                {COLUMNAS_POR_TIPO.map(({ accion, etiqueta }) => (
                  <th key={accion} scope="col" className="px-1 py-1 text-center font-semibold">
                    {etiqueta}
                  </th>
                ))}
                <th scope="col" className="py-1 pl-2">
                  <span className="sr-only">Plantilla</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.tipos.map((tipo) => {
                const fila = filas[tipo.tipoId] ?? [];
                const tieneVer = fila.includes("LECTURA");
                const sinVer = filaSinVer(fila);
                return (
                  <tr key={tipo.tipoId} className="border-t border-border">
                    <th scope="row" className="py-1 pr-2 text-left font-normal">
                      <span className="flex items-center gap-1.5">
                        {tipo.nombre}
                        {!tipo.activo && <Badge variant="outline">Inactivo</Badge>}
                      </span>
                      {sinVer && (
                        <span className="block text-xs text-destructive">
                          Tiene acciones sin Ver: tilde Ver o quite las demás.
                        </span>
                      )}
                    </th>
                    {COLUMNAS_POR_TIPO.map(({ accion, etiqueta }) => (
                      <td key={accion} className="px-1 py-1 text-center">
                        <Checkbox
                          aria-label={`${tipo.nombre}: ${etiqueta}`}
                          checked={fila.includes(accion)}
                          disabled={
                            ocupado ||
                            (accion !== "LECTURA" && !tieneVer && !fila.includes(accion))
                          }
                          onCheckedChange={(checked) =>
                            alternar(tipo.tipoId, accion, checked === true)
                          }
                        />
                      </td>
                    ))}
                    <td className="py-1 pl-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label={`Aplicar plantilla del rol a ${tipo.nombre}`}
                        title={
                          tipo.plantilla === null
                            ? `El rol ${datos.rolCodigo} no tiene plantilla definida.`
                            : undefined
                        }
                        disabled={ocupado || tipo.plantilla === null}
                        onClick={() => {
                          const plantilla = tipo.plantilla;
                          if (plantilla !== null) {
                            setFilas((previas) => ({ ...previas, [tipo.tipoId]: [...plantilla] }));
                          }
                        }}
                      >
                        Aplicar plantilla del rol
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">
          Sin Ver, el resto de la fila queda deshabilitado. Borrar tickets todavía no existe, así
          que no se puede conceder.
        </p>
        {haySinVer && (
          <p role="alert" className="text-xs text-destructive">
            Para guardar, corrija las filas que tienen acciones sin Ver.
          </p>
        )}
      </div>
      <DialogFooter className="flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <Label htmlFor={`copiar-permisos-${usuario.id}`} className="text-sm font-normal">
            Copiar permisos de otro usuario
          </Label>
          <Select
            id={`copiar-permisos-${usuario.id}`}
            value={origenId}
            disabled={ocupado}
            onChange={(evento) => setOrigenId(evento.target.value)}
          >
            <option value="">Elegir usuario…</option>
            {candidatos.map((otro) => (
              <option key={otro.id} value={otro.id}>
                {otro.nombre} {otro.apellido}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            isLoading={copiar.isPending}
            disabled={!origen || guardar.isPending}
            onClick={() => setConfirmandoCopia(true)}
          >
            Copiar
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          isLoading={guardar.isPending}
          disabled={copiar.isPending || haySinVer}
          onClick={() =>
            guardar.mutate(
              datos.tipos.map((tipo) => ({ tipoId: tipo.tipoId, acciones: filas[tipo.tipoId] ?? [] })),
            )
          }
        >
          Guardar
        </Button>
      </DialogFooter>
      <ConfirmDialog
        open={confirmandoCopia}
        onOpenChange={setConfirmandoCopia}
        title="Copiar permisos de otro usuario"
        description={`Se van a REEMPLAZAR los permisos por tipo de "${usuario.nombre} ${usuario.apellido}" con los de "${origen?.nombre ?? ""} ${origen?.apellido ?? ""}". Los cambios sin guardar se pierden. ¿Confirma?`}
        confirmLabel="Confirmar"
        onConfirm={confirmarCopia}
        isConfirming={copiar.isPending}
      />
    </>
  );
}
