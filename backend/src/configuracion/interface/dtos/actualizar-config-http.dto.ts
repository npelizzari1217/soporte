/**
 * ActualizarConfigHttpDto — body de `PUT /configuracion`.
 *
 * `scope` solo lleva el `kind` (`'tenant'|'global'`) — el `clienteId` del
 * scope tenant se resuelve EXCLUSIVAMENTE del JWT verificado
 * (`user.cliente_id`, vía `@CurrentUser()`), NUNCA del body. Por eso este
 * DTO NO tiene un campo `clienteId`: aceptarlo del body permitiría que un
 * actor reclame el tenant de otro cliente (obligación dura, ver
 * `configuracion/domain/actor-context.ts` + STATE.md "Judgment Day — PR4 —
 * fixes Ronda 1").
 *
 * Validado por el `ValidationPipe` global (`whitelist: true, transform:
 * true`, `app.module.ts`) — campos desconocidos se descartan, tipos se
 * castean. La validación de NEGOCIO (F2, R8, placeholder enmascarado, etc.)
 * vive en `ActualizarConfigUseCase` (domain/application) — este DTO solo
 * valida la FORMA de la request (api-design skill: "transport validation
 * happens in presentation").
 *
 * Ref design: §10 (firma del controller). Ref spec: R3, R4, R5, R8.
 * Tarea: 5.1 (PR5).
 */
import { IsBoolean, IsIn, IsNotEmpty, IsString } from 'class-validator';

export class ActualizarConfigHttpDto {
  @IsIn(['tenant', 'global'])
  scope!: 'tenant' | 'global';

  @IsString()
  @IsNotEmpty()
  categoria!: string;

  @IsString()
  @IsNotEmpty()
  clave!: string;

  /**
   * Plaintext si `esSecreto` (se cifra ANTES de persistir, dentro del use
   * case); valor real si no. Puede ser un string vacío (ej. limpiar un
   * campo no-secreto) — por eso NO lleva `@IsNotEmpty()`.
   */
  @IsString()
  valor!: string;

  @IsBoolean()
  esSecreto!: boolean;

  @IsString()
  @IsNotEmpty()
  tipo!: string;
}
