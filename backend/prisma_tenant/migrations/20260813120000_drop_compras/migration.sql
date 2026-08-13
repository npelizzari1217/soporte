-- Demolición total del módulo de Compras legacy
-- (sdd/redisenio-modulo-compras, PR-1). El dominio se reconstruye desde
-- cero sobre un modelo nuevo (`Compra`/`ItemCompra`/`OperacionCompra`,
-- ver sdd/redisenio-modulo-compras/design) a partir de PR-2. Orden de DROP
-- impuesto por el grafo de FKs (hijas antes que padres).

DROP TABLE "archivos_presupuesto";
DROP TABLE "presupuestos";
DROP TABLE "items_compra";
DROP TABLE "ticket_compra";
