/**
 * Tipos de la API pública del formulario de pedido (sdd/formulario-publico-qr, WU-16).
 * Espejan `ContextoPedido` de `consultar-contexto-pedido.use-case.ts` (backend): solo nombres.
 */
export type ModoPedido = "EXTERNO" | "SESION";

export interface ContextoPedido {
  cliente: { nombre: string };
  equipo: { nombre: string } | null;
  modo: ModoPedido;
}
