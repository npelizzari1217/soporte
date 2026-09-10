"use client";

/**
 * InsumosListView — CONTAINER montado por `/insumos`: catálogo de insumos
 * CONSUMIBLES del inquilino (familia con `esRepuesto = false`). Wrapper fino
 * sobre `CatalogoInsumosListView` (WU-2, sdd/repuestos-seccion) — ver ese
 * componente para el detalle de columnas, gates y estados; este archivo solo fija
 * el filtro y la copy de esta sección. `RepuestosListView` es su hermana,
 * con `esRepuesto = true`.
 */
import { CatalogoInsumosListView } from "./catalogo-insumos-list-view";

export function InsumosListView() {
  return <CatalogoInsumosListView esRepuesto={false} tituloSeccion="Insumos" nombreSingular="insumo" />;
}
