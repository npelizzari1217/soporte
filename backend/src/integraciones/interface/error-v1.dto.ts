import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Cuerpo de error de la API publica `v1` (api-publica, T6). Solo documenta la forma que ya devuelve
 * Nest en cualquier `HttpException`; no se instancia en ningun lado.
 */
export class ErrorV1 {
  @ApiProperty({ type: 'integer', example: 401 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    description: 'Motivo legible. Un error de validación trae la lista de campos inválidos.',
    example: 'No autorizado',
  })
  message!: string | string[];

  @ApiPropertyOptional({ example: 'Unauthorized' })
  error?: string;
}
