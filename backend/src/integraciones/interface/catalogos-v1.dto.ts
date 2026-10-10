/**
 * Contrato publico `v1` de catalogos (api-publica, T5c). Son los ids que exige el alta de tickets
 * (`tipoId`, `prioridadId`) y los que devuelven los tickets (`estadoId`). DTOs PROPIOS de la API:
 * no exponen color, SLA, modulo ni datos de auditoria del catalogo interno. Son clases solo para que
 * OpenAPI los describa: el presentador arma literales.
 */
import { ApiProperty } from '@nestjs/swagger';

/** Tipo de ticket usable en el alta. `codigo` es estable; `nombre` lo edita el cliente. */
export class TipoTicketV1 {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Código estable del tipo.' })
  codigo!: string;

  @ApiProperty({ description: 'Nombre visible; lo edita el cliente.' })
  nombre!: string;
}

/** Prioridad usable en el alta. `orden` crece hacia la mas urgente segun el catalogo del cliente. */
export class PrioridadV1 {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Código estable de la prioridad.' })
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ type: 'integer', description: 'Crece hacia la prioridad más urgente.' })
  orden!: number;
}

/** Estado del ciclo de vida. `codigo` es el mismo que `TicketV1.estado` (`NUEVO`, `CERRADO`, ...). */
export class EstadoV1 {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Código del estado, el mismo que `TicketV1.estado`.' })
  codigo!: string;

  @ApiProperty()
  nombre!: string;

  @ApiProperty({ type: 'integer', description: 'Posición en el ciclo de vida.' })
  orden!: number;
}

/** Catalogos de `GET /v1/catalogos`. */
export class CatalogosV1 {
  @ApiProperty({ type: [TipoTicketV1], description: 'Tipos activos del módulo de tickets.' })
  tipos!: TipoTicketV1[];

  @ApiProperty({ type: [PrioridadV1], description: 'Prioridades activas, ordenadas por `orden`.' })
  prioridades!: PrioridadV1[];

  @ApiProperty({ type: [EstadoV1] })
  estados!: EstadoV1[];
}
