"use client";

/**
 * use-reaplicar-al-resolver — reaplica al `<select>` el valor guardado cuando su
 * catálogo termina de resolver.
 *
 * Es el SEGUNDO camino por el que un `<select>` se queda sin la `<option>` de su
 * valor vigente. El primero (el valor está dado de baja y el catálogo no lo trae)
 * lo cubre `shared/lib/opciones-catalogo`. Este es distinto: la opción existe,
 * pero llega DESPUÉS de que el `<select>` montó.
 *
 * Pasa porque el `<select>` NO CONTROLADO de react-hook-form fija su valor una
 * sola vez, al montar. Si el formulario monta con el catálogo todavía cargando,
 * monta con CERO opciones y el navegador se queda con la primera que llegue
 * después. `_formValues` conserva el id correcto (no hubo evento `change`), así
 * que lo que se guarda está bien — el que miente es lo que se ve, y eso es peor:
 * el usuario aprueba una cosa y se persiste otra, sin error y sin log.
 */
import { useEffect, useRef } from "react";
import type { FieldPath, FieldValues, PathValue, UseFormSetValue } from "react-hook-form";

/**
 * @param activo Mientras sea `false`, el hook no hace nada y se REARMA. Sirve
 *   para formularios que no se desmontan al cerrarse (un diálogo que conserva su
 *   estado): pasar el `open` hace que vuelva a sincronizar en cada apertura.
 *   Un formulario que monta y desmonta con su caller pasa `true` fijo.
 * @param resuelto Si el catálogo YA resolvió. Antes de eso no hay nada que
 *   reaplicar y forzar el valor solo generaría trabajo de más.
 * @param campo Campo del formulario a reaplicar.
 * @param valor Valor guardado, el que tiene que quedar seleccionado.
 * @param setValue El `setValue` del `useForm` dueño del campo.
 *
 * Corre UNA sola vez por ciclo activo. Que un refetch del catálogo NO pise lo que
 * el usuario acaba de elegir se sostiene en dos cosas, y conviene no confundirlas:
 *
 *  1. `resuelto` es un BOOLEANO, no la lista. Un refetch entrega una referencia
 *     nueva, pero `resuelto` sigue en `true`, así que ninguna dependencia cambia
 *     y el efecto ni siquiera vuelve a correr. Esta es la defensa principal, y es
 *     la razón por la que el parámetro no es `catalogo: T[] | undefined`.
 *  2. El `ref`, que cubre el caso en que alguna dep SÍ cambie (por ejemplo
 *     `valor`, cuando el prop del registro se actualiza con el formulario
 *     abierto) sin volver a pisar la elección del usuario.
 *
 * No es hipotético: `refetchOnWindowFocus` viene en `true` por defecto y el
 * `QueryProvider` no lo desactiva, así que alcanza con cambiar de ventana y
 * volver. Hay un test de regresión que falla si esto se reescribe como un
 * `useEffect` suelto con la lista en las dependencias.
 */
export function useReaplicarAlResolver<TFieldValues extends FieldValues, TName extends FieldPath<TFieldValues>>(
  activo: boolean,
  resuelto: boolean,
  campo: TName,
  valor: PathValue<TFieldValues, TName>,
  setValue: UseFormSetValue<TFieldValues>,
): void {
  const yaSincronizado = useRef(false);

  useEffect(() => {
    if (!activo) {
      yaSincronizado.current = false;
      return;
    }
    if (!resuelto || yaSincronizado.current) return;
    yaSincronizado.current = true;
    setValue(campo, valor, { shouldDirty: false });
  }, [activo, resuelto, campo, valor, setValue]);
}
