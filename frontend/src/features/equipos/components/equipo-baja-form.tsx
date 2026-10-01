"use client";

/**
 * EquipoBajaForm — PRESENTATIONAL del diálogo de baja del equipo completo: destino
 * (uno solo para todas las piezas), categoría, texto del motivo, serial de las piezas
 * legadas y, para descartar, la confirmación por nombre. No pide datos ni decide
 * nada: el estado y las validaciones viven en `EquipoBajaDialog`.
 */
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORIAS_BAJA_EQUIPO } from "../types";
import type { CategoriaBajaEquipo, ResumenBajaEquipo } from "../types";
import { serialDePieza, nombreDePieza, type ErroresBaja, type ValoresBaja } from "../baja-equipo-reglas";

export const ETIQUETAS_CATEGORIA_BAJA: Record<CategoriaBajaEquipo, string> = {
  VEJEZ: "Vejez",
  DONACION: "Donación",
  ROTURA: "Rotura",
  OTRA: "Otra",
};

export interface EquipoBajaFormProps {
  resumen: ResumenBajaEquipo;
  valores: ValoresBaja;
  onCambiar: (cambios: Partial<ValoresBaja>) => void;
  /** Error de validación de cada campo, ya redactado por el container. */
  errores: ErroresBaja;
  disabled: boolean;
}

export function EquipoBajaForm({ resumen, valores, onCambiar, errores, disabled }: EquipoBajaFormProps) {
  const tope = resumen.largoMaximoTexto[valores.categoria];
  const largo = valores.motivo.trim().length;
  const piezasConSerial = valores.destino === "STOCK_USADO" ? resumen.piezas.filter((p) => p.requiereSerial) : [];

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="text-sm font-medium text-foreground">¿Qué pasa con las piezas?</legend>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="destino-baja"
            checked={valores.destino === "STOCK_USADO"}
            onChange={() => onCambiar({ destino: "STOCK_USADO" })}
          />
          Devolver todas las piezas al stock (como usadas)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="radio"
            name="destino-baja"
            checked={valores.destino === "DESCARTE"}
            onChange={() => onCambiar({ destino: "DESCARTE" })}
          />
          Descartar todas las piezas
        </label>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="baja-equipo-categoria" className="text-sm font-medium text-foreground">
          Categoría
        </label>
        <Select
          id="baja-equipo-categoria"
          value={valores.categoria}
          disabled={disabled}
          onChange={(e) => onCambiar({ categoria: e.target.value as CategoriaBajaEquipo })}
        >
          {CATEGORIAS_BAJA_EQUIPO.map((categoria) => (
            <option key={categoria} value={categoria}>
              {ETIQUETAS_CATEGORIA_BAJA[categoria]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="baja-equipo-motivo" className="text-sm font-medium text-foreground">
          {valores.categoria === "OTRA" ? "Motivo (obligatorio)" : "Motivo (opcional)"}
        </label>
        <Textarea
          id="baja-equipo-motivo"
          value={valores.motivo}
          disabled={disabled}
          error={!!errores.motivo}
          onChange={(e) => onCambiar({ motivo: e.target.value })}
        />
        <p className="text-xs text-muted-foreground" data-testid="contador-motivo">
          {largo} / {tope}
        </p>
        {errores.motivo && (
          <p role="alert" className="text-xs text-destructive">
            {errores.motivo}
          </p>
        )}
      </div>

      {piezasConSerial.map((pieza) => {
        const error = errores.seriales[pieza.componenteId];
        const id = `baja-equipo-serial-${pieza.componenteId}`;
        return (
          <div key={pieza.componenteId} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm font-medium text-foreground">
              {`Número de serie de ${nombreDePieza(pieza)}`}
            </label>
            <Input
              id={id}
              value={serialDePieza(pieza, valores)}
              disabled={disabled}
              error={!!error}
              onChange={(e) => onCambiar({ seriales: { ...valores.seriales, [pieza.componenteId]: e.target.value } })}
            />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        );
      })}
      {piezasConSerial.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Estas piezas se cargaron antes del seguimiento por serie: al volver al stock se registran con estos seriales.
        </p>
      )}

      {valores.destino === "DESCARTE" && (
        <div className="flex flex-col gap-1">
          <label htmlFor="baja-equipo-confirmacion" className="text-sm font-medium text-foreground">
            Escribí el nombre del equipo para confirmar
          </label>
          <Input
            id="baja-equipo-confirmacion"
            value={valores.confirmacion}
            disabled={disabled}
            autoComplete="off"
            onChange={(e) => onCambiar({ confirmacion: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">Nombre del equipo: {resumen.nombre}</p>
        </div>
      )}
    </div>
  );
}
