import { BadRequestException, PipeTransform } from '@nestjs/common';
import { FORMATOS_EXPORT, FormatoExport } from '../../application/armar-export';

/**
 * Parsea `?formato=` de las rutas `/export`: ausente → `csv` (los llamadores
 * previos no se rompen), `csv` o `xlsx` → ese formato, cualquier otro valor
 * → 400. Un parámetro que se ignora en silencio entregaría un archivo
 * distinto del pedido.
 *
 * Se usa como `@Query('formato', ParseFormatoExportPipe)` y no como campo de
 * cada DTO de query: el `ValidationPipe` global (`whitelist: true`) descarta
 * las claves no declaradas, y reparaciones no tiene DTO de query.
 */
export class ParseFormatoExportPipe implements PipeTransform<unknown, FormatoExport> {
  transform(valor: unknown): FormatoExport {
    if (valor === undefined) {
      return 'csv';
    }
    const formato = FORMATOS_EXPORT.find((candidato) => candidato === valor);
    if (formato === undefined) {
      throw new BadRequestException(`formato debe ser uno de: ${FORMATOS_EXPORT.join(', ')}.`);
    }
    return formato;
  }
}
