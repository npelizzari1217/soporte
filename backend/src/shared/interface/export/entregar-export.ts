import { StreamableFile } from '@nestjs/common';
import { ArchivoExport, CONTENT_TYPE_EXPORT, FormatoExport } from '../../application/armar-export';

/** Lo único que la entrega necesita de la respuesta HTTP: escribir headers. */
export interface RespuestaConHeaders {
  setHeader(nombre: string, valor: string): void;
}

/**
 * Setea los headers de descarga y devuelve el cuerpo en la forma que Nest
 * serializa bien: el CSV como `string`, el xlsx como `StreamableFile`.
 *
 * Nunca devolver el `Buffer` desnudo con `@Res({ passthrough: true })`: Nest
 * lo pasaría por `res.json` y entregaría `{"type":"Buffer",...}` (ver el
 * comentario largo de `ClienteLogoController.ver`). Los headers se escriben
 * ANTES del return; Nest solo completa los que falten.
 */
export function entregarExport(
  res: RespuestaConHeaders,
  formato: FormatoExport,
  archivo: ArchivoExport,
): string | StreamableFile {
  res.setHeader('Content-Type', CONTENT_TYPE_EXPORT[formato]);
  res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombreArchivo}"`);
  // El navegador no puede leer un header que no esté expuesto por CORS, y
  // sin esto el frontend no tiene de dónde sacar el nombre del archivo.
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

  return typeof archivo.contenido === 'string'
    ? archivo.contenido
    : new StreamableFile(archivo.contenido);
}
