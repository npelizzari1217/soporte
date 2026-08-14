/**
 * `/compras` — Server Component fino (ADR-1). Sin gate de permiso: la
 * lectura del listado se gatea SOLO por módulo (`COMPRAS`), decisión del
 * maintainer en `sdd/redisenio-modulo-compras/rbac-consultas` — ver el
 * JSDoc de `ComprasListView` para el detalle completo.
 */
import { ComprasListView } from "@/features/compras/components/compras-list-view";

export default function ComprasPage() {
  return <ComprasListView />;
}
