import { Result } from '../../../shared/domain/result';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { MembresiaEntity } from '../../domain/entities/membresia.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { IRoleRepository } from '../../domain/ports/i-role.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { MembresiaYaActivaError, RolNoEncontradoError } from '../../domain/errors/auth.errors';
import {
  AplicarPresetPermisosError,
  AplicarPresetPermisosUseCase,
} from './aplicar-preset-permisos.use-case';

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
  RolNoEncontradoError | MembresiaYaActivaError | AplicarPresetPermisosError;

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
 * 4. Si la persona tiene membresías DESACTIVADAS en `clienteId`, reactiva una en vez de crear
 *    otra (odd/tasks/defectos-ayuda.md, S1): la del mismo rol si existe, si no la primera, con el
 *    rol nuevo. Crear otra chocaba con la UNIQUE (usuario, cliente, rol) en el mismo rol y dejaba
 *    dos filas con otro. Sin membresías previas, crea una ACTIVA con el rol resuelto.
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
 *    El mismo reintento repara `PermisosPorTipoNoAplicadosError` (no se
 *    escribió ninguna de las dos bases) y `MatrizPermisosNoAplicadaError` (las
 *    filas por tipo del tenant quedaron y falta la matriz de master)
 *    (odd/tasks/permisos-por-tipo-ticket.md, T4c, W1).
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
      'findActivaByUsuarioYCliente' | 'findTodasByUsuarioYCliente' | 'create' | 'save'
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

    const membresia = await this.membresiaParaElAlta(usuario.id, input.clienteId, rol.id);

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

  /**
   * Reactiva una membresía desactivada del usuario en el cliente, o crea una nueva si no tiene.
   * Prefiere la del mismo rol: así la UNIQUE (usuario, cliente, rol) nunca se pisa al cambiarle el
   * rol a otra fila.
   */
  private async membresiaParaElAlta(
    usuarioId: string,
    clienteId: string,
    rolId: string,
  ): Promise<MembresiaEntity> {
    const previas = await this.membresiaRepo.findTodasByUsuarioYCliente(usuarioId, clienteId);
    const aReactivar = previas.find((m) => m.rolId === rolId) ?? previas[0];
    if (aReactivar) {
      if (aReactivar.rolId !== rolId) aReactivar.cambiarRol(rolId);
      aReactivar.activar();
      await this.membresiaRepo.save(aReactivar);
      return aReactivar;
    }
    const membresia = MembresiaEntity.create({ usuarioId, clienteId, rolId, activo: true });
    await this.membresiaRepo.create(membresia);
    return membresia;
  }
}
