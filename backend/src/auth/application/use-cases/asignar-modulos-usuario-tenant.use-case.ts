import { Result } from '../../../shared/domain/result';
import { MODULOS } from '../../../shared/domain/modulos';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IUsuarioClienteModuloRepository } from '../../domain/ports/i-usuario-cliente-modulo.repository';
import { MembresiaNoEncontradaError, ModuloInvalidoError } from '../../domain/errors/auth.errors';

/**
 * Input de `AsignarModulosUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y
 * SIEMPRE lo deriva el controller de `actor.cliente_id` (JWT del
 * ADMINISTRADOR) — mecanismo de aislamiento estricto (spec §5): los módulos se
 * asignan SIEMPRE dentro del cliente del token, nunca en otro tenant.
 */
export interface AsignarModulosUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
  modulos: string[];
}

export type AsignarModulosUsuarioTenantError = ModuloInvalidoError | MembresiaNoEncontradaError;

/**
 * AsignarModulosUsuarioTenantUseCase — `PATCH /usuarios/:id/modulos` (feature
 * 5.2 CAPA 4). Permiso `usuario:gestionar` + `rol:asignar` (ADMINISTRADOR),
 * enforced por el controller.
 *
 * Flujo (mismo criterio fail-fast que `CambiarRolUsuarioTenantUseCase`):
 * 1. Valida que TODOS los módulos del set ∈ `MODULOS` — `ModuloInvalidoError`
 *    (422) si alguno no existe (defensa en profundidad detrás del `@IsIn` del
 *    DTO).
 * 2. Valida que exista una membresía ACTIVA del usuario en `clienteId`
 *    (`findActivaByUsuarioYCliente`) — `MembresiaNoEncontradaError` (404) si
 *    no: un ADMINISTRADOR nunca distingue "usuario inexistente" de "existe en
 *    otro tenant" (aislamiento estricto).
 * 3. Reemplaza el set de módulos (`modulosRepo.setModulos`, idempotente).
 *
 * Nota: ROOT/ADMINISTRADOR ven TODOS los módulos por su flag/rol (no dependen
 * de la tabla `usuario_cliente_modulos`); asignar módulos a esos usuarios no
 * tiene efecto sobre lo que "ven", pero el use case no lo bloquea — el gating
 * de UI lo comunica.
 */
export class AsignarModulosUsuarioTenantUseCase {
  constructor(
    private readonly modulosRepo: Pick<IUsuarioClienteModuloRepository, 'setModulos'>,
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
  ) {}

  async execute(
    input: AsignarModulosUsuarioTenantInput,
  ): Promise<Result<string[], AsignarModulosUsuarioTenantError>> {
    const modulosValidos: readonly string[] = MODULOS;
    const invalidos = input.modulos.filter((modulo) => !modulosValidos.includes(modulo));
    if (invalidos.length > 0) {
      return Result.fail(new ModuloInvalidoError(invalidos));
    }

    const membresia = await this.membresiaRepo.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    await this.modulosRepo.setModulos(input.usuarioId, input.clienteId, input.modulos);

    return Result.ok(input.modulos);
  }
}
