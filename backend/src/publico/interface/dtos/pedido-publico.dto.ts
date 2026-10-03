/**
 * DTO de `POST publico/c/:slug/pedido/solicitud` (sdd/formulario-publico-qr, WU-13).
 *
 * `class` (no `interface`): con `interface` el `ValidationPipe` global no valida. NO declara
 * `tipoId`, `prioridadId`, `estadoId`, `solicitanteId` ni `clienteId`: con `whitelist: true` se
 * descartan en silencio (ADR-4). Sin multipart (D9). Los límites espejan a `PedidoPendienteEntity`,
 * que es la última línea de defensa.
 *
 * Ref design: ADR-4, ADR-9. Tarea: 13.2.
 */
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  PEDIDO_DESCRIPCION_MAX,
  PEDIDO_EMAIL_MAX,
  PEDIDO_NOMBRE_MAX,
  PEDIDO_TELEFONO_MAX,
  PEDIDO_TITULO_MAX,
  PEDIDO_TITULO_MIN,
} from '../../domain/entities/pedido-pendiente.entity';

const recortar = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Largo máximo del token del QR (el real mide 22 caracteres). */
export const EQUIPO_TOKEN_MAX = 64;

export class PedidoPublicoDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PEDIDO_NOMBRE_MAX)
  nombre!: string;

  @Transform(recortar)
  @IsEmail()
  @MaxLength(PEDIDO_EMAIL_MAX)
  email!: string;

  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(PEDIDO_TELEFONO_MAX)
  telefono?: string;

  @Transform(recortar)
  @IsString()
  @MinLength(PEDIDO_TITULO_MIN)
  @MaxLength(PEDIDO_TITULO_MAX)
  titulo!: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(PEDIDO_DESCRIPCION_MAX)
  descripcion!: string;

  /** Token crudo del QR del equipo (`?e=`); opcional. Un token inválido abre sin equipo (ADR-5). */
  @IsOptional()
  @IsString()
  @MaxLength(EQUIPO_TOKEN_MAX)
  equipoToken?: string;
}
