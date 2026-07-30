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
 * Ref design: §3.3, §10. Ref spec: Requirement 3. Tarea: 4.2-4.4 (PR4).
 */
import { Result } from '../../../shared/domain/result';
import { maskIfSecret } from '../../domain/mask-secret';
import { ConfigScope } from '../../domain/events/configuracion-cambiada.event';
import { IConfiguracionRepository } from '../../domain/ports/i-configuracion-repository';
import { InfraConfigError } from '../../domain/errors/config.errors';

export interface LeerConfigDto {
  readonly scope: ConfigScope;
  /** Filtro opcional — si se omite, lista TODAS las categorías del scope. */
  readonly categoria?: string;
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

export class LeerConfigUseCase {
  constructor(private readonly repo: IConfiguracionRepository) {}

  async execute(dto: LeerConfigDto): Promise<Result<ConfigLecturaRow[], InfraConfigError>> {
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
