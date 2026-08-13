import { Module } from '@nestjs/common';

/**
 * ComprasModule — placeholder tras la demolición del módulo legacy
 * (sdd/redisenio-modulo-compras, PR-1).
 *
 * El dominio anterior (`ticket_compra`/`items_compra`/`presupuestos`) fue
 * borrado por completo: modelo de datos, entidades, use cases, repos y
 * controller. Este módulo queda vacío a propósito para que `AppModule`
 * (que sigue importándolo, ver `app.module.ts`) siga compilando mientras
 * se reconstruye el dominio desde cero (PR-2 en adelante) con el modelo
 * `Compra`/`ItemCompra`/`OperacionCompra` definido en
 * `sdd/redisenio-modulo-compras/design`.
 */
@Module({})
export class ComprasModule {}
