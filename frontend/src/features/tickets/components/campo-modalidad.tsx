"use client";

/**
 * CampoModalidad — select de la modalidad de ejecución (odd/edilicia-obra-externa, S1), compartido
 * por el alta y la edición de Tickets y de Edilicia.
 *
 * `editable` lo decide el backend (`modalidadEditable`): la regla cuenta tareas y compras vinculadas
 * que la pantalla no siempre ve. Deshabilitado, el campo no viaja en el envío (el caller lo omite) y
 * el motivo queda visible y asociado al control.
 */
import type { UseFormRegisterReturn } from "react-hook-form";
import { Select } from "@/components/ui/select";
import { ETIQUETA_MODALIDAD, MODALIDADES_TICKET, MOTIVO_MODALIDAD_NO_EDITABLE } from "../modalidad";

export interface CampoModalidadProps {
  /** `id` del `<select>`; el del motivo se deriva de él. */
  id: string;
  registro: UseFormRegisterReturn;
  /** `false` deshabilita el control y muestra el motivo. Por defecto, editable (el alta). */
  editable?: boolean;
}

/**
 * @param props Ver `CampoModalidadProps`.
 * @returns El bloque etiqueta + select + motivo.
 */
export function CampoModalidad({ id, registro, editable = true }: CampoModalidadProps) {
  const idMotivo = `${id}-motivo`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        Modalidad
      </label>
      <Select
        id={id}
        disabled={!editable}
        aria-describedby={editable ? undefined : idMotivo}
        {...registro}
      >
        {MODALIDADES_TICKET.map((modalidad) => (
          <option key={modalidad} value={modalidad}>
            {ETIQUETA_MODALIDAD[modalidad]}
          </option>
        ))}
      </Select>
      {!editable && (
        <p id={idMotivo} className="text-xs text-muted-foreground">
          {MOTIVO_MODALIDAD_NO_EDITABLE}
        </p>
      )}
    </div>
  );
}
