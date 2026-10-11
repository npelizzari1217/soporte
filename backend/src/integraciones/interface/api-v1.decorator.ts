import { applyDecorators, Controller, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiSecurity,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { ApiClaveGuard } from '../infrastructure/api-clave.guard';
import { ApiV1ThrottlerGuard } from '../infrastructure/api-v1-throttler.guard';
import { ErrorV1 } from './error-v1.dto';

/** Nombre del esquema de seguridad OpenAPI de la clave `X-Api-Key` (api-publica, T6). */
export const API_V1_ESQUEMA_CLAVE = 'clave-api';

/**
 * Marca un controller como parte de la API publica `v1` (sdd/api-publica).
 *
 * Sirve la ruta bajo `v1/<ruta>` (con el prefijo global, `/api/v1/<ruta>`) y aplica, en este
 * orden: `ApiClaveGuard` (autentica, bindea el tenant y arma `request.user`), el limite por clave
 * y `AccionesGuard`, que evalua `@RequiereAcciones` contra los permisos de la clave. El orden
 * importa: sin clave valida el pedido es 401 y no cuenta contra ningun cupo.
 * El controller tiene que declararse en `ApiV1Module` (o en un modulo que lo importe y provea
 * las dependencias de `ApiClaveGuard`). El actor llega con `@CurrentUser()`.
 *
 * Tambien documenta en OpenAPI (T6) lo que esos guards agregan a toda operacion: la clave
 * obligatoria y las respuestas 401, 403 y 429.
 */
export const ApiV1 = (ruta = ''): ClassDecorator =>
  applyDecorators(
    Controller(ruta ? `v1/${ruta}` : 'v1'),
    UseGuards(ApiClaveGuard, ApiV1ThrottlerGuard, AccionesGuard),
    ApiSecurity(API_V1_ESQUEMA_CLAVE),
    ApiUnauthorizedResponse({
      type: ErrorV1,
      description:
        'Clave ausente, inexistente o revocada, cliente inactivo o API deshabilitada. Siempre el mismo 401.',
    }),
    ApiForbiddenResponse({
      type: ErrorV1,
      description: 'La clave no tiene el permiso que pide la operación.',
    }),
    ApiTooManyRequestsResponse({
      type: ErrorV1,
      description: 'Se superó el límite de pedidos por clave (60 por minuto por defecto).',
    }),
  );
