"use client";

/**
 * use-responsable-segun-tipo — mantiene el responsable del formulario de un plan coherente con el
 * tipo de ticket elegido (odd/preventivo-por-tipo, S5).
 *
 * La lista de responsables depende del tipo: cambiar el tipo trae otra lista, y el `<select>` NO
 * CONTROLADO de react-hook-form se queda con el id viejo en sus valores aunque esa `<option>` ya no
 * exista. Sin este hook la pantalla muestra otro técnico (o ninguno) y se guarda el anterior, que el
 * backend rechaza con 422 si no es técnico del tipo nuevo.
 *
 * Cada vez que la lista de un tipo nuevo resuelve, mira el responsable elegido:
 *  - si está en la lista, o si `conservar` lo admite (el responsable vigente de un plan, con su tipo
 *    original: el backend no lo revalida), lo reaplica para que el `<select>` lo muestre;
 *  - si no, lo borra y devuelve un aviso visible, para que el usuario elija otro.
 *
 * Corre una sola vez por tipo y por apertura (`activo`), así que un refetch de la misma lista no pisa
 * lo que el usuario acaba de elegir.
 */
import { useEffect, useRef, useState } from "react";
import { RESPONSABLE_NO_HABILITADO_PARA_TIPO } from "../lib/plan-labels";

/** Parámetros de `useResponsableSegunTipo`. */
export interface ResponsableSegunTipoOpciones {
  /** Mientras sea `false` (diálogo cerrado) no hace nada y se rearma para la próxima apertura. */
  activo: boolean;
  /** Tipo de ticket elegido en el formulario. */
  tipoId: string;
  /** Si la lista de responsables de `tipoId` ya resolvió. */
  resuelto: boolean;
  /** Ids de los responsables de `tipoId`. */
  responsablesIds: readonly string[];
  /** Lee el responsable elegido en el formulario. */
  leerResponsable: () => string;
  /** Escribe el responsable en el formulario ("" lo borra). */
  fijarResponsable: (responsableId: string) => void;
  /**
   * Responsables fuera de la lista que igual se conservan. La edición lo usa para el responsable
   * vigente del plan mientras el tipo sea el original.
   */
  conservar?: (responsableId: string, tipoId: string) => boolean;
}

/**
 * @param opciones Ver `ResponsableSegunTipoOpciones`.
 * @returns El aviso a mostrar si el cambio de tipo dejó afuera al responsable elegido, o `null`.
 */
export function useResponsableSegunTipo({
  activo,
  tipoId,
  resuelto,
  responsablesIds,
  leerResponsable,
  fijarResponsable,
  conservar,
}: ResponsableSegunTipoOpciones): string | null {
  const tipoVerificado = useRef<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!activo) {
      tipoVerificado.current = null;
      setAviso(null);
      return;
    }
    if (!tipoId || !resuelto || tipoVerificado.current === tipoId) return;
    tipoVerificado.current = tipoId;
    const elegido = leerResponsable();
    if (!elegido) return;
    if (responsablesIds.includes(elegido) || conservar?.(elegido, tipoId)) {
      fijarResponsable(elegido);
      setAviso(null);
      return;
    }
    fijarResponsable("");
    setAviso(RESPONSABLE_NO_HABILITADO_PARA_TIPO);
  }, [activo, tipoId, resuelto, responsablesIds, leerResponsable, fijarResponsable, conservar]);

  return aviso;
}
