import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiV1Module } from '../api-v1.module';
import { API_V1_ESQUEMA_CLAVE } from './api-v1.decorator';

/** Ruta del documento, relativa al prefijo global (`/api/v1/openapi.json`). */
export const RUTA_OPENAPI_V1 = 'v1/openapi.json';

/**
 * Arma el documento OpenAPI de la API publica `v1` (api-publica, T6, CA7). Solo escanea los
 * controllers declarados en `ApiV1Module`: `include` sin `deepScanRoutes` deja afuera los de los
 * modulos que importa (por ejemplo `IntegracionesModule`, con las rutas internas de claves), y
 * cualquier otra ruta de la aplicacion.
 */
export function crearDocumentoOpenApiV1(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Soporte — API pública')
    .setDescription(
      'API pública v1 de Soporte para integrar sistemas propios con los tickets del cliente. ' +
        'Cada pedido se autentica con una clave en el header `X-Api-Key`, que crea el administrador ' +
        'del cliente en la pantalla "Integraciones". La clave solo ve los datos de su cliente y ' +
        'puede hacer lo que permiten sus permisos (lectura, alta, comentario).',
    )
    .setVersion('1')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Api-Key',
        description: 'Clave de la API (`sop_...`).',
      },
      API_V1_ESQUEMA_CLAVE,
    )
    .build();
  return SwaggerModule.createDocument(app, config, { include: [ApiV1Module] });
}

/**
 * Publica el documento como JSON en `GET /api/v1/openapi.json`, sin interfaz grafica. La ruta la
 * registra Swagger directo en el adaptador HTTP, por fuera de los controllers: no pasa por
 * `@ApiV1` (ni clave ni limite), porque describe el contrato y no expone datos. Se llama despues
 * de `setGlobalPrefix` y antes de `listen`.
 */
export function configurarOpenApiV1(app: INestApplication): void {
  const documento = crearDocumentoOpenApiV1(app);
  SwaggerModule.setup(RUTA_OPENAPI_V1, app, documento, {
    useGlobalPrefix: true,
    ui: false,
    raw: ['json'],
    jsonDocumentUrl: RUTA_OPENAPI_V1,
  });
}
