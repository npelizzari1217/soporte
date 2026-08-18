"use client";

/**
 * MontoInput — campo de monto que se lee formateado (`1.234.567,89`) y se
 * edita crudo (`1234567.89`). PRESENTACIONAL: no conoce react-hook-form ni
 * zod, sólo recibe el valor crudo y avisa cuando cambia.
 *
 * **Invariante**: el valor que sale por `onChange` es SIEMPRE el número
 * crudo. El formato es una proyección de sólo lectura que se calcula al
 * vuelo mientras el campo NO tiene foco — nunca se escribe en el valor. Si
 * la cadena formateada llegara al schema, `z.coerce.number()` devolvería
 * `NaN` y el usuario perdería la carga.
 *
 * Al salir del campo se normaliza lo tipeado a su forma canónica cruda
 * (`parsearNumeroEsAr`), así un valor pegado ya formateado también queda
 * utilizable en vez de morir como `NaN` recién al enviar.
 *
 * `type="text"` + `inputMode="decimal"`: un `<input type="number">` rechaza
 * `1.234.567,89`, así que el formato al blur es incompatible con él. Se
 * pierden `min`/`step` del navegador, que igual eran redundantes — las
 * reglas reales (`min(0)` y máximo 2 decimales) viven en el schema y son las
 * que producen el mensaje de error que ve el usuario.
 */
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { formatearNumeroEsAr, parsearNumeroEsAr } from "@/shared/lib/formato-numero";

export interface MontoInputProps {
  id: string;
  name: string;
  /** Valor CRUDO del formulario. `undefined` en un PATCH semántico con el campo sin tocar. */
  value: string | number | undefined;
  /** Recibe SIEMPRE el valor crudo, nunca el formateado. */
  onChange: (valorCrudo: string) => void;
  onBlur: () => void;
  disabled?: boolean;
  error?: boolean;
}

export function MontoInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled = false,
  error = false,
}: MontoInputProps) {
  const [enfocado, setEnfocado] = useState(false);

  const crudo = value === undefined || value === null ? "" : String(value);
  const numero = parsearNumeroEsAr(crudo);
  // Un campo deshabilitado no se puede enfocar ni editar: se muestra siempre
  // formateado, que es la única forma en que aporta algo (se lee).
  const editando = enfocado && !disabled;
  const mostrado = editando || numero === null ? crudo : formatearNumeroEsAr(numero);

  function alSalir() {
    setEnfocado(false);
    // Canonizar lo tipeado ANTES de avisar el blur: si el usuario pegó
    // "1.234.567,89", el formulario se queda con "1234567.89".
    if (numero !== null && String(numero) !== crudo) onChange(String(numero));
    onBlur();
  }

  return (
    <Input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      disabled={disabled}
      error={error}
      value={mostrado}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setEnfocado(true)}
      onBlur={alSalir}
    />
  );
}
