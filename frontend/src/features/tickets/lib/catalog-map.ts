/**
 * buildIdToCodigoMap — resuelve `xId → codigo` para catálogos (G1: la lista/
 * detalle de tickets solo recibe IDs de `tipoId`/`estadoId`/`prioridadId`,
 * los códigos legibles vienen de `GET /catalogos/*` por separado).
 */
export function buildIdToCodigoMap(items: { id: string; codigo: string }[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.codigo]));
}
