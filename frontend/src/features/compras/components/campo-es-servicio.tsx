"use client";

/**
 * CampoEsServicio — casilla "Es un servicio" del alta y la edición de un ítem de compra
 * (odd/edilicia-obra-externa, S2). Un servicio no declara insumo: al marcarla, el caller limpia el
 * insumo y deshabilita su selector, espejo de `ItemServicioConInsumoError` del backend.
 */
import { Controller, type Control, type FieldValues, type Path } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";

export interface CampoEsServicioProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
  /** Se llama al marcar la casilla, para que el caller saque el insumo. */
  onMarcar: () => void;
  /** Motivo por el que no se puede cambiar; si viene, la casilla queda deshabilitada. */
  motivoBloqueo?: string;
}

/**
 * @param props Ver `CampoEsServicioProps`.
 * @returns La casilla con su texto de ayuda o su motivo de bloqueo.
 */
export function CampoEsServicio<T extends FieldValues>({
  control,
  name,
  onMarcar,
  motivoBloqueo,
}: CampoEsServicioProps<T>) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Checkbox
              checked={field.value === true}
              disabled={motivoBloqueo !== undefined}
              onCheckedChange={(checked) => {
                const marcado = checked === true;
                field.onChange(marcado);
                if (marcado) onMarcar();
              }}
            />
          )}
        />
        Es un servicio (mano de obra o trabajo contratado)
      </label>
      <p className="text-xs text-muted-foreground">
        {motivoBloqueo ??
          "Un servicio no declara insumo y no suma stock. Una compra solo de servicios no bloquea el ticket vinculado."}
      </p>
    </div>
  );
}
