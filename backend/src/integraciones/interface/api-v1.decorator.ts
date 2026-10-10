import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { ApiClaveGuard } from '../infrastructure/api-clave.guard';
import { ApiV1ThrottlerGuard } from '../infrastructure/api-v1-throttler.guard';

/**
 * Marca un controller como parte de la API publica `v1` (sdd/api-publica).
 *
 * Sirve la ruta bajo `v1/<ruta>` (con el prefijo global, `/api/v1/<ruta>`) y aplica, en este
 * orden: `ApiClaveGuard` (autentica, bindea el tenant y arma `request.user`), el limite por clave
 * y `AccionesGuard`, que evalua `@RequiereAcciones` contra los permisos de la clave. El orden
 * importa: sin clave valida el pedido es 401 y no cuenta contra ningun cupo.
 * El controller tiene que declararse en `ApiV1Module` (o en un modulo que lo importe y provea
 * las dependencias de `ApiClaveGuard`). El actor llega con `@CurrentUser()`.
 */
export const ApiV1 = (ruta = ''): ClassDecorator =>
  applyDecorators(
    Controller(ruta ? `v1/${ruta}` : 'v1'),
    UseGuards(ApiClaveGuard, ApiV1ThrottlerGuard, AccionesGuard),
  );
