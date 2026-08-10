import { Result } from '../../../shared/domain/result';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository } from '../../domain/ports/i-membresia.repository';
import { MembresiaNoEncontradaError } from '../../domain/errors/auth.errors';

/**
 * Input de `EditarUsuarioTenantUseCase`. `clienteId` es OBLIGATORIO y SIEMPRE
 * lo deriva el controller de `actor.cliente_id` (JWT) — es el mecanismo de
 * aislamiento: la edición solo se permite si el usuario tiene una membresía
 * ACTIVA en ESE cliente, de modo que un ADMINISTRADOR nunca edita usuarios de
 * otro tenant. `nombre`/`apellido` son opcionales (patch parcial): `undefined`
 * = "no tocar" ese campo.
 */
export interface EditarUsuarioTenantInput {
  clienteId: string;
  usuarioId: string;
  nombre?: string;
  apellido?: string;
}

export type EditarUsuarioTenantError = MembresiaNoEncontradaError;

/**
 * EditarUsuarioTenantUseCase — `PATCH /usuarios/:id` (gestión mínima de
 * usuarios, sdd/beta-frontend/spec §5). Permiso `usuario:gestionar`
 * (ADMINISTRADOR; ROOT bypassa el guard), enforced por el controller.
 *
 * Edita SOLO nombre y/o apellido. El `email` NO es editable (identidad de
 * acceso global). IMPORTANTE: nombre/apellido son identidad GLOBAL del usuario
 * (viven en `master.usuarios`, no en la membresía) — el cambio se refleja en
 * TODOS los tenants a los que el usuario pertenece, no solo en `clienteId`.
 *
 * Verifica la membresía ACTIVA por `(usuarioId, clienteId)` ANTES de cargar y
 * mutar al usuario: si no existe, `MembresiaNoEncontradaError` (404). Un
 * ADMINISTRADOR de otro cliente nunca distingue "usuario inexistente" de
 * "usuario existe pero en otro tenant" (aislamiento estricto, spec §5). El
 * mismo error se usa si el usuario global no existe (defensa; no debería pasar
 * si hay membresía).
 *
 * Ref spec: sdd/beta-frontend/spec §5.
 */
export class EditarUsuarioTenantUseCase {
  constructor(
    private readonly usuarioRepo: Pick<IUsuarioRepository, 'findById' | 'save'>,
    private readonly membresiaRepo: Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'>,
  ) {}

  async execute(
    input: EditarUsuarioTenantInput,
  ): Promise<Result<UsuarioEntity, EditarUsuarioTenantError>> {
    const membresia = await this.membresiaRepo.findActivaByUsuarioYCliente(
      input.usuarioId,
      input.clienteId,
    );
    if (!membresia) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    const usuario = await this.usuarioRepo.findById(input.usuarioId);
    if (!usuario) {
      return Result.fail(new MembresiaNoEncontradaError());
    }

    usuario.editar({ nombre: input.nombre, apellido: input.apellido });
    await this.usuarioRepo.save(usuario);

    return Result.ok(usuario);
  }
}
