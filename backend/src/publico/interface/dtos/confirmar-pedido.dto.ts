/**
 * DTO de `POST publico/c/:slug/pedido/confirmar` (sdd/formulario-publico-qr, WU-15).
 *
 * Solo `token`: con `whitelist: true` un `clienteId` u otro campo inyectado se descarta en
 * silencio, y el tenant sale siempre del slug resuelto (ADR-4). `class` para que el
 * `ValidationPipe` global valide.
 *
 * Ref design: ADR-4, ADR-9. Tarea: 15.2.
 */
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Largo máximo del token crudo (el real mide 43 caracteres). */
export const TOKEN_CONFIRMACION_MAX = 128;

export class ConfirmarPedidoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TOKEN_CONFIRMACION_MAX)
  token!: string;
}
