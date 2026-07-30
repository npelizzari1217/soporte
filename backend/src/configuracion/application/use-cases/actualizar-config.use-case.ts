/**
 * ActualizarConfigUseCase — crea o actualiza una fila `ConfiguracionRuntime`
 * (categoría `smtp` únicamente — R8), cifrando el valor si `esSecreto` y
 * publicando `ConfiguracionCambiada` para el audit async (R5).
 *
 * Orden de validaciones (design §3.2 + Judgment Day PR4 Ronda 1, patrón
 * authenticate→authorize→business del auth-access skill — TODAS ANTES de
 * cualquier efecto secundario, ningún cifrado/persistencia/evento ocurre si
 * fallan):
 *   1. `scope.kind` válido (`esScopeKindValido`) ⇒ si no, `InvalidScopeError`
 *      — fail-CLOSED (arreglo 2, Judgment Day PR4 Ronda 1, hallazgo Juez A:
 *      antes de esta ronda, cualquier `kind` no-'tenant' caía en el adapter
 *      por `else` a global/master por DEFAULT — fail-open confirmado).
 *   2. Autorización de scope (arreglo 1, confirmado A+B) — `global` requiere
 *      `actor.esGlobalAdmin`; `tenant` requiere `actor.esGlobalAdmin` O ser
 *      dueño del tenant (`scope.clienteId === actor.clienteId`). El use case
 *      NO consulta DB para esto: el caller (controller, PR5) resuelve
 *      `clienteId`/`is_global_admin` del JWT y los pasa ya resueltos en
 *      `ActorContext` (auth-access skill: "Pass UserIdentity to use cases as
 *      a parameter", nunca confiar en el token dentro de application/).
 *      ANTES de esta ronda, los use cases delegaban TODO el límite de
 *      tenant a un controller (PR5) que todavía no existe — un actor de
 *      tenant podía escribir/leer la config de CUALQUIER OTRO tenant con
 *      solo cambiar `scope.clienteId` en el DTO.
 *   3. R8 — `categoria !== 'smtp'` ⇒ `CategoriaNoSoportadaError`.
 *   4. Guard del placeholder enmascarado (arreglo 3, Judgment Day PR4 Ronda
 *      1, hallazgo Juez A) — `esSecreto && valor === SECRET_MASK` ⇒
 *      `ValorEnmascaradoNoPermitidoError`. Sin este guard, un frontend que
 *      lea (`LeerConfigUseCase` devuelve SIEMPRE `'********'` para
 *      secretos), muestre y reenvíe el formulario sin tocar ese campo
 *      cifraría y persistiría el literal `'********'`, sobrescribiendo
 *      silenciosamente el secreto real con un valor irrecuperable.
 *
 * Flujo (design §3.2, sin cambios de orden interno):
 *   5. Lee la fila actual (`valorAnterior`) — si `esSecreto`, NUNCA se
 *      descifra: se usa el placeholder enmascarado (`maskIfSecret`).
 *   6. Si `esSecreto` ⇒ `ISecretCipher.encrypt(valor)` — el repo SOLO recibe
 *      ciphertext, nunca el plaintext.
 *   7. `repo.upsert()` en la DB del scope. TOCTOU (arreglo 4): una carrera
 *      concurrente sobre la misma `(categoria, clave)` del mismo scope se
 *      reporta como `ConfigConflictoConcurrenteError`, distinguible de un
 *      `InfraConfigError` genérico.
 *   8. Publica `ConfiguracionCambiada` con `valorAnterior`/`valorNuevo` YA
 *      enmascarados si `esSecreto` (Dz7 — REQUISITO DURO, STATE.md "Judgment
 *      Day — PR1 — fixes Ronda 2" fix #6, obligación forward de PR3): el
 *      cleartext del secreto NUNCA entra al evento — se enmascara en el
 *      ORIGEN, acá, ANTES de construir `ConfiguracionCambiada`.
 *   9. `publisher.publish()` es post-commit (la fila YA está persistida) —
 *      un throw ahí NUNCA debe tumbar una respuesta que ya debería ser
 *      éxito. Mismo patrón log-and-swallow que
 *      `TransicionarEstadoUseCase`/`CrearObservacionUseCase`.
 *
 * Ref design: §3.2, §5, §14 F2. Ref spec: Requirement 5, Requirement 8.
 * Tarea: 4.5-4.9 (PR4). Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1".
 */
import { Result } from '../../../shared/domain/result';
import { CifradoError } from '../../../shared/domain/errors/cifrado.errors';
import { ISecretCipher } from '../../../shared/domain/ports/i-secret-cipher';
import { IDomainEventPublisher } from '../../../shared/domain/ports/i-domain-event-publisher';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import {
  CategoriaNoSoportadaError,
  ConfigConflictoConcurrenteError,
  InfraConfigError,
  InvalidScopeError,
  ScopeGlobalNoAutorizadoError,
  ScopeTenantNoAutorizadoError,
  ValorEnmascaradoNoPermitidoError,
} from '../../domain/errors/config.errors';
import {
  ConfigScope,
  ConfiguracionCambiada,
} from '../../domain/events/configuracion-cambiada.event';
import { maskIfSecret, SECRET_MASK } from '../../domain/mask-secret';
import { ActorContext } from '../../domain/actor-context';
import { esScopeKindValido } from '../../domain/validar-scope';
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
  /** Id del usuario que realiza el cambio — se persiste en `actualizadoPor` (audit trail). */
  readonly actorId: string;
  /**
   * Identidad de autorización del actor (F2 + ownership de tenant — arreglo
   * 1, Judgment Day PR4 Ronda 1). Reemplaza el boolean suelto
   * `actorEsGlobalAdmin` que tenía este DTO antes de esta ronda —
   * auth-access skill regla 4 ("Pass UserIdentity to use cases as a
   * parameter", nunca un boolean aislado). Ver docblock de `ActorContext`
   * para el REQUISITO DURO de PR5 (resolver del JWT, nunca del body).
   */
  readonly actor: ActorContext;
}

export type ActualizarConfigError =
  | InvalidScopeError
  | ScopeGlobalNoAutorizadoError
  | ScopeTenantNoAutorizadoError
  | CategoriaNoSoportadaError
  | ValorEnmascaradoNoPermitidoError
  | CifradoError
  | InfraConfigError
  | ConfigConflictoConcurrenteError;

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
    // 1. Validar scope.kind — fail-closed, ANTES de autorizar o tocar el
    //    repositorio/cifrado (arreglo 2).
    if (!esScopeKindValido(dto.scope.kind)) {
      return Result.fail(new InvalidScopeError(dto.scope.kind));
    }

    // 2. Autorizar — ownership de tenant + privilegio global (arreglo 1),
    //    ANTES de la regla de negocio R8 (patrón authenticate→authorize→
    //    business del auth-access skill).
    if (dto.scope.kind === 'global') {
      if (!dto.actor.esGlobalAdmin) {
        return Result.fail(new ScopeGlobalNoAutorizadoError());
      }
    } else {
      const esPropioTenant = dto.scope.clienteId === dto.actor.clienteId;
      if (!dto.actor.esGlobalAdmin && !esPropioTenant) {
        return Result.fail(new ScopeTenantNoAutorizadoError());
      }
    }

    // 3. R8 — whitelist nivel B, ANTES de cualquier efecto secundario.
    if (dto.categoria !== CATEGORIA_SMTP) {
      return Result.fail(new CategoriaNoSoportadaError(dto.categoria));
    }

    // 4. Guard del placeholder enmascarado (arreglo 3) — ANTES de cifrar o
    //    persistir. Un secreto NUNCA puede "actualizarse" al literal que la
    //    propia lectura devuelve para ocultarlo.
    if (dto.esSecreto && dto.valor === SECRET_MASK) {
      return Result.fail(new ValorEnmascaradoNoPermitidoError());
    }

    // 5. Leer fila actual — si esSecreto, NUNCA se descifra (placeholder enmascarado).
    const existingResult = await this.repo.findByClave(dto.scope, dto.categoria, dto.clave);
    if (existingResult.isFail()) {
      return Result.fail(existingResult.getError());
    }
    const existing = existingResult.getValue();
    const valorAnteriorMasked = existing
      ? (maskIfSecret(existing.valor, existing.esSecreto) ?? existing.valor)
      : null;

    // 6. Cifrar si esSecreto — el repo SOLO recibe ciphertext.
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

    // 7. Persistir.
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

    // 8. Publicar el evento — Dz7 / REQUISITO DURO: enmascarado en el ORIGEN.
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
