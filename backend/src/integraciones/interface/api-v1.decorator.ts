import { applyDecorators, Controller, SetMetadata, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiSecurity,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AccionesGuard } from '../../auth/infrastructure/guards/acciones.guard';
import { ACCIONES_KEY } from '../../auth/infrastructure/guards/decorators';
import { PermisoApi } from '../domain/api-clave';
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
 * y `AccionesGuard`, que evalua `@RequierePermisoApi` contra los permisos de la clave. El orden
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

/**
 * Declara los permisos de clave que exige una ruta de la API publica `v1`. `AccionesGuard` los
 * evalua igual que a `@RequiereAcciones` (AND, mismo 403), contra los permisos del actor sintetico
 * de la clave.
 *
 * Existe aparte de `@RequiereAcciones` porque la clave conserva su vocabulario `TICKETS:*`
 * (`PERMISOS_API`, odd/permisos-por-tipo-ticket L50.3), mientras que el modulo TICKETS salio del
 * catalogo de la matriz de usuarios (T9b): un permiso fuera de `PERMISOS_API` no compila.
 *
 * @param permisos Permisos de clave requeridos.
 * @returns El decorador de metadatos que lee `AccionesGuard`.
 */
export const RequierePermisoApi = (...permisos: PermisoApi[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ACCIONES_KEY, permisos);
