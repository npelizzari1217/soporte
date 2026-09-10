"use client";

/**
 * RepuestosListView — CONTAINER montado por `/repuestos`: catálogo de
 * REPUESTOS de equipo del inquilino (familia con `esRepuesto = true`, WU-1,
 * sdd/repuestos-familias). Wrapper fino sobre `CatalogoInsumosListView`
 * (WU-2, sdd/repuestos-seccion), hermana de `InsumosListView` con el filtro
 * invertido — mismas columnas, mismo gate `INSUMOS:LECTURA` (decisión del
 * dueño del repo: no hay permiso `REPUESTOS` propio).
 *
 * La fila navega a `/insumos/:id`, no a `/repuestos/:id`: ver el JSDoc de
 * `CatalogoInsumosListView` para el porqué de la ficha única.
 */
import { CatalogoInsumosListView } from "./catalogo-insumos-list-view";

export function RepuestosListView() {
  return <CatalogoInsumosListView esRepuesto={true} tituloSeccion="Repuestos" nombreSingular="repuesto" />;
}
