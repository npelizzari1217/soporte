"use client";

import * as React from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { obtenerCatalogoZonasHorarias } from "@/shared/lib/zonas-horarias";
import { cn } from "@/lib/utils";

const LIMITE_RESULTADOS_VISIBLES = 50;

const RANGO_DIACRITICOS_UNICODE = /[̀-ͯ]/g;

/**
 * Normaliza un texto para comparar por búsqueda: minúsculas, sin diacríticos
 * y con los `_` de los IDs IANA convertidos a espacio. Sin esto, tipear
 * "Buenos Aires" tal como lo escribe una persona (con espacio) no matchea
 * `America/Argentina/Buenos_Aires` (con guion bajo) — la zona por DEFECTO
 * del producto (D8) habría quedado inalcanzable por búsqueda natural.
 */
function normalizarParaBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(RANGO_DIACRITICOS_UNICODE, "")
    .replace(/_/g, " ")
    .toLowerCase();
}

/** Ver `ZonaHorariaCombobox` para el porqué de cada prop. */
export interface ZonaHorariaComboboxProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (valor: string) => void;
  onBlur?: () => void;
  error?: boolean;
  placeholder?: string;
  /** Catálogo a mostrar; por defecto `obtenerCatalogoZonasHorarias()`. Permite inyectar un catálogo acotado en tests. */
  catalogo?: string[];
  /** Valor vigente del tenant: se agrega a las opciones aunque no esté en el catálogo base. */
  valorVigente?: string;
}

/**
 * Combobox de zona horaria — construido sobre `@radix-ui/react-popover`
 * (ya instalado, sin dependencias nuevas), siguiendo los patrones de
 * `src/components/ui/select.tsx` (`forwardRef`, `cn`, estilos consistentes).
 *
 * El catálogo (`obtenerCatalogoZonasHorarias`) es SOLO la ayuda visual de
 * búsqueda: la validez real del valor la decide `esZonaValida`
 * (`shared/lib/formato-fecha.ts`) en el schema de Zod que envuelve este
 * campo, nunca este componente. Por diseño, `onChange` solo se dispara
 * cuando el usuario ELIGE una opción de la lista (click o Enter sobre la
 * opción resaltada) — nunca con el texto libre que está tipeando para
 * filtrar, así que no existe forma de comitear un valor fuera del catálogo
 * visible.
 *
 * `valorVigente` se agrega a las opciones aunque no esté en el catálogo
 * base: lo necesita el diálogo de configuración de zona (C2c) para mostrar
 * la zona actual del tenant, que puede no estar en
 * `Intl.supportedValuesOf('timeZone')` (el mismo mecanismo que resuelve
 * `ZONAS_FALTANTES_EN_INTL` en `zonas-horarias.ts`, pero para un valor que
 * no se conoce de antemano).
 */
export const ZonaHorariaCombobox = React.forwardRef<HTMLInputElement, ZonaHorariaComboboxProps>(
  (
    {
      id,
      name,
      value,
      onChange,
      onBlur,
      error = false,
      placeholder = "Buscar zona horaria...",
      catalogo,
      valorVigente,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState(value);
    const [activeIndex, setActiveIndex] = React.useState(-1);
    const listboxId = React.useId();

    // Mientras el usuario no está editando, el texto mostrado sigue al valor
    // confirmado externo (p.ej. `reset()` de react-hook-form en C2c).
    React.useEffect(() => {
      if (!open) setQuery(value);
    }, [value, open]);

    const opciones = React.useMemo(() => {
      const base = catalogo ?? obtenerCatalogoZonasHorarias();
      if (valorVigente && !base.includes(valorVigente)) {
        return [valorVigente, ...base];
      }
      return base;
    }, [catalogo, valorVigente]);

    const coincidencias = React.useMemo(() => {
      const texto = normalizarParaBusqueda(query.trim());
      return texto === "" ? opciones : opciones.filter((zona) => normalizarParaBusqueda(zona).includes(texto));
    }, [opciones, query]);

    const filtradas = React.useMemo(
      () => coincidencias.slice(0, LIMITE_RESULTADOS_VISIBLES),
      [coincidencias],
    );
    const ocultasPorLimite = coincidencias.length - filtradas.length;

    function seleccionar(opcion: string): void {
      onChange(opcion);
      setQuery(opcion);
      setOpen(false);
      setActiveIndex(-1);
    }

    function manejarTeclado(evento: React.KeyboardEvent<HTMLInputElement>): void {
      if (evento.key === "ArrowDown") {
        evento.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(0);
          return;
        }
        setActiveIndex((indice) => Math.min(indice + 1, filtradas.length - 1));
      } else if (evento.key === "ArrowUp") {
        evento.preventDefault();
        if (!open) {
          setOpen(true);
          setActiveIndex(filtradas.length - 1);
          return;
        }
        setActiveIndex((indice) => Math.max(indice - 1, 0));
      } else if (evento.key === "Enter") {
        // `preventDefault` corre para CUALQUIER Enter con la lista abierta,
        // haya o no una opción resaltada — no solo cuando hay selección. Si
        // no, un Enter sin match (p.ej. el usuario edita el texto después de
        // haber elegido una zona válida) burbujea al `<form>` que envuelve
        // este campo y lo somete con el valor VIEJO ya comiteado, mientras la
        // pantalla muestra el texto sin confirmar — la pantalla dice una cosa
        // y se guarda otra.
        if (open) {
          evento.preventDefault();
          if (activeIndex >= 0 && filtradas[activeIndex]) {
            seleccionar(filtradas[activeIndex]);
          }
        }
      } else if (evento.key === "Escape") {
        if (open) {
          evento.preventDefault();
          setOpen(false);
          setQuery(value);
          setActiveIndex(-1);
        }
      }
    }

    const activeId = activeIndex >= 0 && filtradas[activeIndex] ? `${listboxId}-${activeIndex}` : undefined;

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <Input
            id={id}
            name={name}
            ref={ref}
            role="combobox"
            aria-expanded={open}
            // Solo referencia el listbox MIENTRAS está montado: `PopoverContent`
            // (Radix, sin `forceMount`) desmonta todo su subárbol al cerrarse
            // (`popover.tsx` lo envuelve en `Portal` sin mantenerlo en el DOM),
            // así que un `aria-controls` fijo apuntaría a un id inexistente en
            // el estado por defecto del control.
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            error={error}
            placeholder={placeholder}
            value={query}
            onChange={(evento) => {
              setQuery(evento.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            // `onFocus` no vuelve a disparar sobre un input YA enfocado — el
            // camino normal tras elegir una opción (el mousedown de la lista
            // está prevenido, así que el foco nunca se va del input). Sin
            // esto, "elegir zona → notar que está mal → volver a clickear el
            // campo" no reabre nada.
            onClick={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setQuery(value);
              setActiveIndex(-1);
              onBlur?.();
            }}
            onKeyDown={manejarTeclado}
          />
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] max-h-64 overflow-y-auto p-1"
          onOpenAutoFocus={(evento) => evento.preventDefault()}
          onCloseAutoFocus={(evento) => evento.preventDefault()}
          // Prevenido acá, no por opción: CUALQUIER mousedown adentro del
          // popover (arrastrar el scrollbar con hasta 50 ítems, clickear la
          // fila "Mostrando N de M", el padding del contenedor) blurrea el
          // input si no se previene, y el `onBlur` de arriba cierra la lista
          // a mitad de la interacción. Radix ya resuelve el dismiss por click
          // AFUERA con su propia capa, así que esto no rompe cerrar el popover.
          onMouseDown={(evento) => evento.preventDefault()}
        >
          {/*
            El `<ul role="listbox">` con `id={listboxId}` se renderiza siempre
            que `PopoverContent` está montado (o sea, mientras `open` es
            `true` — ver el comentario de `aria-controls` en el input): cubre
            tanto la lista de opciones como el estado "Sin resultados", así
            que ese id nunca queda apuntando a nada mientras es referenciado.
          */}
          <ul role="listbox" id={listboxId} className="flex flex-col">
            {filtradas.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-muted-foreground">Sin resultados</li>
            ) : (
              <>
                {filtradas.map((zona, indice) => (
                  <li
                    key={zona}
                    role="option"
                    id={`${listboxId}-${indice}`}
                    aria-selected={indice === activeIndex}
                    className={cn(
                      "cursor-pointer rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground",
                      indice === activeIndex && "bg-accent text-accent-foreground",
                    )}
                    onClick={() => seleccionar(zona)}
                  >
                    {zona}
                  </li>
                ))}
                {ocultasPorLimite > 0 && (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground">
                    Mostrando {filtradas.length} de {coincidencias.length} — refiná la búsqueda
                  </li>
                )}
              </>
            )}
          </ul>
        </PopoverContent>
      </Popover>
    );
  },
);
ZonaHorariaCombobox.displayName = "ZonaHorariaCombobox";
