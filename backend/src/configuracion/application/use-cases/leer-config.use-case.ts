/**
 * LeerConfigUseCase — lee filas de `ConfiguracionRuntime` para un scope dado,
 * enmascarando SIEMPRE los valores `esSecreto` (R3 — NUNCA descifra para
 * leer, ni siquiera en memoria para la respuesta).
 *
 * Garantía estructural (tarea 4.3): este archivo NO importa `ISecretCipher`
 * en absoluto — la ausencia del import es, en sí misma, la prueba de que
 * `decrypt()` jamás puede invocarse desde este flujo (verificado también por
 * auditoría de imports en `leer-config.use-case.spec.ts`, mismo criterio que
 * R7 "adapter no importa cipher/prisma").
 *
 * Orden de validación (Judgment Day PR4 Ronda 1, arreglo 1 + arreglo 2 —
 * patrón authenticate→authorize→business del auth-access skill):
 *   1. `scope.kind` válido (`esScopeKindValido`) ⇒ si no, `InvalidScopeError`
 *      — fail-CLOSED, nunca cae en global por default (arreglo 2).
 *   2. Autorización de scope — `global` requiere `actor.esGlobalAdmin`;
 *      `tenant` requiere `actor.esGlobalAdmin` O ser dueño del tenant
 *      (`scope.clienteId === actor.clienteId`) — arreglo 1, vale para LEER
 *      igual que para escribir. Antes de esta ronda, el use case delegaba
 *      TODO el límite de tenant a un controller (PR5) que todavía no existe
 *      — cualquier actor podía leer la config de CUALQUIER tenant.
 *
 * Ref design: §3.3, §10. Ref spec: Requirement 3. Tarea: 4.2-4.4 (PR4).
 * Ref: STATE.md "Judgment Day — PR4 — fixes Ronda 1".
 */
import { Result } from '../../../shared/domain/result';
import { maskIfSecret } from '../../domain/mask-secret';
import { ActorContext } from '../../domain/actor-context';
import { autorizarScope, esScopeKindValido } from '../../domain/validar-scope';
import { ConfigScope } from '../../domain/events/configuracion-cambiada.event';
import { IConfiguracionRepository } from '../../domain/ports/i-configuracion-repository';
import {
  InfraConfigError,
  InvalidScopeError,
  ScopeGlobalNoAutorizadoError,
  ScopeTenantNoAutorizadoError,
} from '../../domain/errors/config.errors';

export interface LeerConfigDto {
  readonly scope: ConfigScope;
  /** Filtro opcional — si se omite, lista TODAS las categorías del scope. */
  readonly categoria?: string;
  /**
   * Identidad de autorización del actor (F2 + ownership de tenant — arreglo
   * 1, Judgment Day PR4 Ronda 1). PR5 DEBE resolverla EXCLUSIVAMENTE del
   * JWT verificado — ver docblock de `ActorContext`.
   */
  readonly actor: ActorContext;
}

/**
 * Vista de lectura de una fila — sin `id`/`iv`/`authTag`/timestamps (detalle
 * de persistencia que la API no expone, design §10).
 */
export interface ConfigLecturaRow {
  readonly categoria: string;
  readonly clave: string;
  /** Enmascarado (`SECRET_MASK`) si `esSecreto` — NUNCA el valor real ni descifrado. */
  readonly valor: string;
  readonly tipo: string;
  readonly esSecreto: boolean;
}

export type LeerConfigError =
  | InvalidScopeError
  | ScopeGlobalNoAutorizadoError
  | ScopeTenantNoAutorizadoError
  | InfraConfigError;

export class LeerConfigUseCase {
  constructor(private readonly repo: IConfiguracionRepository) {}

  async execute(dto: LeerConfigDto): Promise<Result<ConfigLecturaRow[], LeerConfigError>> {
    // 1. Validar scope.kind — fail-closed ante cualquier valor malformado,
    //    ANTES de autorizar o tocar el repositorio (arreglo 2).
    if (!esScopeKindValido(dto.scope.kind)) {
      return Result.fail(new InvalidScopeError(dto.scope.kind));
    }

    // 2. Autorizar — ownership de tenant + privilegio global (arreglo 1),
    //    centralizado en `autorizarScope` (dominio, Judgment Day PR4 Ronda 2
    //    arreglo 1 CRITICAL + authz-duplicada MEDIUM) — fail-closed, `null`
    //    NUNCA satisface ownership. Sin este gate, un actor de tenant podía
    //    leer la config de CUALQUIER OTRO tenant (o la global) con solo
    //    cambiar `scope`.
    const autorizacion = autorizarScope(dto.actor, dto.scope);
    if (autorizacion.isFail()) {
      return Result.fail(autorizacion.getError());
    }

    const result = await this.repo.findAll(dto.scope, dto.categoria);
    if (result.isFail()) {
      return Result.fail(result.getError());
    }

    const rows: ConfigLecturaRow[] = result.getValue().map((row) => ({
      categoria: row.categoria,
      clave: row.clave,
      // `maskIfSecret` solo retorna `null` cuando su input es `null` —
      // `row.valor` de una fila persistida siempre es `string`, así que el
      // fallback `?? row.valor` nunca se ejecuta en la práctica (evita un
      // cast `as string`, prohibido en la práctica de este proyecto salvo
      // que sea estrictamente necesario).
      valor: maskIfSecret(row.valor, row.esSecreto) ?? row.valor,
      tipo: row.tipo,
      esSecreto: row.esSecreto,
    }));

    return Result.ok(rows);
  }
}
