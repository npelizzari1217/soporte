"use client";

/**
 * RepuestosListView — CONTAINER montado por `/repuestos`: catálogo de
 * REPUESTOS de equipo del inquilino (familia con `esRepuesto = true`, WU-1,
 * sdd/repuestos-familias). Wrapper fino sobre `CatalogoInsumosListView`
 * (WU-2, sdd/repuestos-seccion), hermana de `InsumosListView` con el filtro
 * invertido — mismas columnas, mismo gate `INSUMOS:LECTURA` (decisión del
 * dueño del repo: no hay permiso `REPUESTOS` propio).
 *
 * La fila navega a `/repuestos/:id` (decisión del dueño, 2026-09-30): el
 * repuesto se abre dentro de su sección. La ficha es la MISMA vista que la de
 * insumos (`InsumoDetailView`), que nombra "repuesto" según la familia.
 */
import { CatalogoInsumosListView } from "./catalogo-insumos-list-view";

export function RepuestosListView() {
  return <CatalogoInsumosListView esRepuesto={true} tituloSeccion="Repuestos" nombreSingular="repuesto" />;
}
