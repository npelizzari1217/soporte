/**
 * ActualizarConfigUseCase — crea o actualiza una fila `ConfiguracionRuntime`
 * (categoría `smtp` únicamente — R8), cifrando el valor si `esSecreto` y
 * publicando `ConfiguracionCambiada` para el audit async (R5).
 *
 * Orden de validaciones (design §3.2, ambas ANTES de cualquier efecto
 * secundario — ningún cifrado/persistencia/evento ocurre si fallan):
 *   1. R8 — `categoria !== 'smtp'` ⇒ `CategoriaNoSoportadaError`.
 *   2. F2 (resolución autoritativa, menor privilegio) — `scope='global'` sin
 *      `actorEsGlobalAdmin` ⇒ `ScopeGlobalNoAutorizadoError`. El use case NO
 *      consulta DB para esto: el caller (controller, PR5) resuelve el claim
 *      `is_global_admin` del JWT y lo pasa explícito (auth-access skill:
 *      "Pass UserIdentity to use cases as a parameter", nunca confiar en el
 *      token dentro de application/). DESVIACIÓN documentada respecto al DTO
 *      literal de `design.md` §3.2 (que no incluye este campo) — necesaria
 *      porque PR4 no cablea el controller (eso es PR5) y el use case debe
 *      poder enforcar F2 de forma autónoma y testeable.
 *
 * Flujo (design §3.2):
 *   1. Lee la fila actual (`valorAnterior`) — si `esSecreto`, NUNCA se
 *      descifra: se usa el placeholder enmascarado (`maskIfSecret`).
 *   2. Si `esSecreto` ⇒ `ISecretCipher.encrypt(valor)` — el repo SOLO recibe
 *      ciphertext, nunca el plaintext.
 *   3. `repo.upsert()` en la DB del scope.
 *   4. Publica `ConfiguracionCambiada` con `valorAnterior`/`valorNuevo` YA
 *      enmascarados si `esSecreto` (Dz7 — REQUISITO DURO, STATE.md "Judgment
 *      Day — PR1 — fixes Ronda 2" fix #6, obligación forward de PR3): el
 *      cleartext del secreto NUNCA entra al evento — se enmascara en el
 *      ORIGEN, acá, ANTES de construir `ConfiguracionCambiada`.
 *   5. `publisher.publish()` es post-commit (la fila YA está persistida) —
 *      un throw ahí NUNCA debe tumbar una respuesta que ya debería ser
 *      éxito. Mismo patrón log-and-swallow que
 *      `TransicionarEstadoUseCase`/`CrearObservacionUseCase`.
 *
 * Ref design: §3.2, §5, §14 F2. Ref spec: Requirement 5, Requirement 8.
 * Tarea: 4.5-4.9 (PR4).
 */
import { Result } from '../../../shared/domain/result';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  CategoriaNoSoportadaError,
  InfraConfigError,
  ScopeGlobalNoAutorizadoError,
} from '../../domain/errors/config.errors';
import {
  ConfigScope,
  ConfiguracionCambiada,
} from '../../domain/events/configuracion-cambiada.event';
import { maskIfSecret } from '../../domain/mask-secret';
import { IConfiguracionRepository } from '../../domain/ports/i-configuracion-repository';
import { ConfigLecturaRow } from './leer-config.use-case';

/** Única categoría cableada en este change (R8, whitelist nivel B). */
const CATEGORIA_SMTP = 'smtp';

export interface ActualizarConfigDto {
  readonly scope: ConfigScope;
  readonly categoria: string;
  readonly clave: string;
  /** Plaintext si `esSecreto` (se cifra ANTES de persistir); valor real si no. */
  readonly valor: string;
  readonly esSecreto: boolean;
  readonly tipo: string;
  readonly actorId: string;
  /**
   * `is_global_admin` del JWT del actor (F2). Ver nota de la clase — el use
   * case no lo resuelve por sí mismo, lo recibe ya resuelto del caller.
   */
  readonly actorEsGlobalAdmin: boolean;
}

export type ActualizarConfigError =
  | CategoriaNoSoportadaError
  | ScopeGlobalNoAutorizadoError
  | CifradoError
  | InfraConfigError;

export class ActualizarConfigUseCase {
  constructor(
    private readonly repo: IConfiguracionRepository,
    private readonly secretCipher: ISecretCipher,
    private readonly publisher: IDomainEventPublisher,
    private readonly logger: ILogger,
  ) {}

  async execute(
    dto: ActualizarConfigDto,
  ): Promise<Result<ConfigLecturaRow, ActualizarConfigError>> {
    // 1. R8 — whitelist nivel B, ANTES de cualquier efecto secundario.
    if (dto.categoria !== CATEGORIA_SMTP) {
      return Result.fail(new CategoriaNoSoportadaError(dto.categoria));
    }

    // 2. F2 — menor privilegio, ANTES de tocar el repositorio o cifrar.
    if (dto.scope.kind === 'global' && !dto.actorEsGlobalAdmin) {
      return Result.fail(new ScopeGlobalNoAutorizadoError());
    }

    // 3. Leer fila actual — si esSecreto, NUNCA se descifra (placeholder enmascarado).
    const existingResult = await this.repo.findByClave(dto.scope, dto.categoria, dto.clave);
    if (existingResult.isFail()) {
      return Result.fail(existingResult.getError());
    }
    const existing = existingResult.getValue();
    const valorAnteriorMasked = existing
      ? (maskIfSecret(existing.valor, existing.esSecreto) ?? existing.valor)
      : null;

    // 4. Cifrar si esSecreto — el repo SOLO recibe ciphertext.
    let valorAPersistir = dto.valor;
    let iv: string | null = null;
    let authTag: string | null = null;

    if (dto.esSecreto) {
      const cifradoResult = this.secretCipher.encrypt(dto.valor);
      if (cifradoResult.isFail()) {
        return Result.fail(cifradoResult.getError());
      }
      const cifrado = cifradoResult.getValue();
      valorAPersistir = cifrado.valor;
      iv = cifrado.iv;
      authTag = cifrado.authTag;
    }

    // 5. Persistir.
    const upsertResult = await this.repo.upsert(dto.scope, {
      categoria: dto.categoria,
      clave: dto.clave,
      valor: valorAPersistir,
      tipo: dto.tipo,
      esSecreto: dto.esSecreto,
      iv,
      authTag,
      actualizadoPor: dto.actorId,
    });
    if (upsertResult.isFail()) {
      return Result.fail(upsertResult.getError());
    }
    const persisted = upsertResult.getValue();

    // 6. Publicar el evento — Dz7 / REQUISITO DURO: enmascarado en el ORIGEN.
    //    El cleartext del secreto NUNCA entra a `ConfiguracionCambiada`.
    const valorNuevoMasked = maskIfSecret(dto.valor, dto.esSecreto) ?? dto.valor;

    try {
      this.publisher.publish(
        new ConfiguracionCambiada(
          dto.scope,
          dto.actorId,
          dto.categoria,
          dto.clave,
          valorAnteriorMasked,
          valorNuevoMasked,
          dto.esSecreto,
          new Date(),
        ),
      );
    } catch (err) {
      // Post-commit (mismo criterio que TransicionarEstadoUseCase /
      // CrearObservacionUseCase): la fila YA está persistida — un throw acá
      // NUNCA debe tumbar una respuesta que debería ser éxito. El mensaje NO
      // interpola valores de config (podrían ser sensibles aunque ya estén
      // enmascarados si eran secretos) — mismo criterio que InfraConfigError.
      const motivo = err instanceof Error ? err.message : 'Error desconocido';
      this.logger.error(
        `Fallo POST-commit al publicar ConfiguracionCambiada para "${dto.categoria}.${dto.clave}" ` +
          `(scope ${dto.scope.kind}): ${motivo}. El cambio ya persistido NO se ve afectado.`,
        err instanceof Error ? err.stack : undefined,
      );
    }

    return Result.ok({
      categoria: persisted.categoria,
      clave: persisted.clave,
      valor: maskIfSecret(persisted.valor, persisted.esSecreto) ?? persisted.valor,
      tipo: persisted.tipo,
      esSecreto: persisted.esSecreto,
    });
  }
}
