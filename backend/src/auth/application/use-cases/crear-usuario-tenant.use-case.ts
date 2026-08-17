import { Result } from '../../../shared/domain/result';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import {
  MembresiaYaActivaError,
  PresetRolNoDefinidoError,
  RolNoEncontradoError,
} from '../../domain/errors/auth.errors';
import { AplicarPresetPermisosUseCase } from './aplicar-preset-permisos.use-case';

/**
 * Input de `CrearUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y SIEMPRE
 * lo deriva el controller de `actor.cliente_id` (JWT del ADMINISTRADOR que
 * invoca) — NUNCA viaja en el body de la request (aislamiento estricto,
 * sdd/beta-frontend/spec §5: "NUNCA permite crear membresías en otro cliente
 * que no sea el del token").
 */
export interface CrearUsuarioTenantInput {
  clienteId: string;
  email: string;
  nombre: string;
  apellido: string;
  password: string;
  rolCodigo: string;
}

export interface CrearUsuarioTenantOutput {
  usuario: UsuarioEntity;
  membresia: MembresiaEntity;
  rolCodigo: string;
}

export type CrearUsuarioTenantError =
  RolNoEncontradoError | MembresiaYaActivaError | PresetRolNoDefinidoError;

/**
 * CrearUsuarioTenantUseCase — alta de usuario del tenant (gestión mínima de
 * usuarios, sdd/beta-frontend/spec §5). Permiso `usuario:gestionar` +
 * `rol:asignar` (ADMINISTRADOR), enforced por el controller.
 *
 * Flujo:
 * 1. Resuelve `rolCodigo` contra el catálogo RBAC — falla rápido con
 *    `RolNoEncontradoError` si no existe (ANTES de tocar `usuarios`).
 * 2. Busca el usuario GLOBAL por email:
 *    - Si NO existe: lo crea (hash argon2id vía `IHashProvider`).
 *    - Si YA existe: lo reutiliza tal cual — `nombre`/`apellido`/`password`
 *      del DTO se IGNORAN para un usuario existente (es identidad global,
 *      compartida entre tenants; este endpoint no la edita).
 * 3. Si el usuario YA tiene una membresía ACTIVA en `clienteId`, falla con
 *    `MembresiaYaActivaError` (evita duplicar acceso — el modelo de dominio
 *    permite múltiples roles por cliente, pero este flujo simplificado de
 *    alta no expone esa granularidad; usar `PATCH /usuarios/:id/rol` para
 *    cambiar el rol de una membresía existente).
 * 4. Crea la membresía ACTIVA en `clienteId` con el rol resuelto.
 * 5. Siembra el preset de la matriz para esa membresía (fix post-verify W4,
 *    sdd/matriz-permisos-por-usuario) — INVOCA `AplicarPresetPermisosUseCase`
 *    (inyectado, aislamiento de R6/ADR-P9, mismo criterio que
 *    `CambiarRolUsuarioTenantUseCase`). Sin esto, la ASIGNACIÓN INICIAL de
 *    rol dejaba al usuario con 0 celdas en la matriz — invisible como
 *    asignable, 403 en todo, EN SILENCIO (documentado como workaround
 *    manual en `prisma_master/seeds/demo-seed.ts` hasta este fix). La
 *    decisión #2210 punto 2 ("los presets se copian a la matriz UNA sola vez
 *    al asignarlos") cubría el *cambio* de rol (R6) pero no la *asignación
 *    inicial* — este fix cierra ese caso.
 *    Si `aplicarPresetPermisosUseCase` falla (`PresetRolNoDefinidoError`, rol
 *    sin preset en el catálogo), la membresía YA quedó creada y persistida —
 *    deliberado, mismo criterio que `CambiarRolUsuarioTenantUseCase`: el
 *    ADMINISTRADOR puede reintentar solo `POST /usuarios/:id/permisos/aplicar-preset`.
 *
 * Límite conocido (documentado, no resuelto — mismo criterio que
 * `CrearClienteUseCase`): si `usuarioRepo.create` tiene éxito pero
 * `membresiaRepo.create` falla, el usuario nuevo queda sin membresía
 * (huérfano) — no hay rollback transaccional cross-repo en este flujo.
 *
 * Ref spec: sdd/beta-frontend/spec §5. Ref: sdd/matriz-permisos-por-usuario
 * fix post-verify W4.
 */
export class CrearUsuarioTenantUseCase {
  constructor(
    private readonly usuarioRepo: Pick<IUsuarioRepository, 'findByEmail' | 'create'>,
    private readonly membresiaRepo: Pick<
      IMembresiaRepository,
      'findActivaByUsuarioYCliente' | 'create'
    >,
    private readonly roleRepo: Pick<IRoleRepository, 'findByCodigo'>,
    private readonly hashProvider: Pick<IHashProvider, 'hash'>,
    private readonly aplicarPresetPermisosUseCase: Pick<AplicarPresetPermisosUseCase, 'execute'>,
  ) {}

  async execute(
    input: CrearUsuarioTenantInput,
  ): Promise<Result<CrearUsuarioTenantOutput, CrearUsuarioTenantError>> {
    const rol = await this.roleRepo.findByCodigo(input.rolCodigo);
    if (!rol) {
      return Result.fail(new RolNoEncontradoError(input.rolCodigo));
    }

    let usuario = await this.usuarioRepo.findByEmail(input.email);
    if (usuario) {
      const membresiaActiva = await this.membresiaRepo.findActivaByUsuarioYCliente(
        usuario.id,
        input.clienteId,
      );
      if (membresiaActiva) {
        return Result.fail(new MembresiaYaActivaError());
      }
    } else {
      usuario = UsuarioEntity.create({
        email: input.email,
        nombre: input.nombre,
        apellido: input.apellido,
        passwordHash: await this.hashProvider.hash(input.password),
        activo: true,
        isGlobalAdmin: false,
      });
      await this.usuarioRepo.create(usuario);
    }

    const membresia = MembresiaEntity.create({
      usuarioId: usuario.id,
      clienteId: input.clienteId,
      rolId: rol.id,
      activo: true,
    });
    await this.membresiaRepo.create(membresia);

    // `sobrescribir: false` (fix W11): este mismo camino cubre el alta de
    // alguien que nunca existió y el RE-alta de alguien dado de baja, cuya
    // matriz la baja conservó a propósito. Pisarla acá sería el efecto
    // sorpresa que R6 prohibió, entrando por la puerta del re-alta.
    const presetResult = await this.aplicarPresetPermisosUseCase.execute({
      clienteId: input.clienteId,
      usuarioId: usuario.id,
      rolCodigo: rol.codigo,
      sobrescribir: false,
    });
    if (presetResult.isFail()) {
      return Result.fail(presetResult.getError());
    }

    return Result.ok({ usuario, membresia, rolCodigo: rol.codigo });
  }
}
