/**
 * cliente-link-soporte.controller.spec.ts — unit: traducción HTTP ↔ use case y el caso de
 * sesión sin cliente. Los guards reales tienen su propia cobertura.
 */
import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ClienteLinkSoporteController } from './cliente-link-soporte.controller';
import { VerLinkSoporteClienteUseCase } from '../../application/use-cases/ver-link-soporte-cliente.use-case';
import { JwtPayload } from '../../../auth/domain/ports/i-token.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { GlobalAdminGuard } from '../../../auth/infrastructure/guards/global-admin.guard';

function usuarioDe(clienteId: string | null, isGlobalAdmin = false): JwtPayload {
  return {
    v: 2,
    sub: 'user-1',
    cliente_id: clienteId,
    rol: isGlobalAdmin ? null : 'USUARIO',
    permisos: [],
    is_global_admin: isGlobalAdmin,
    cliente_nombre: null,
    membresias: [],
    modulos: [],
    nombre: 'Test',
    apellido: 'User',
    cliente_logo_v: null,
  };
}

function build() {
  const execute = vi.fn();
  // Subclase mínima del use case real: sin cast, el tipo del mock sigue atado a la clase.
  class UseCaseFalso extends VerLinkSoporteClienteUseCase {
    override execute = execute;
  }
  const useCase = { execute };
  const controller = new ClienteLinkSoporteController(
    new UseCaseFalso({ findById: vi.fn() }, 'https://x.test'),
  );
  return { controller, useCase };
}

describe('ClienteLinkSoporteController.ver', () => {
  it('consulta el link del cliente del JWT y devuelve su respuesta', async () => {
    const { controller, useCase } = build();
    useCase.execute.mockResolvedValue({ url: 'https://x.test/c/acme/pedido' });

    const body = await controller.ver(usuarioDe('c-1'));

    expect(useCase.execute).toHaveBeenCalledWith('c-1');
    expect(body).toEqual({ url: 'https://x.test/c/acme/pedido' });
  });

  it('propaga url null cuando no hay link vigente', async () => {
    const { controller, useCase } = build();
    useCase.execute.mockResolvedValue({ url: null });

    expect(await controller.ver(usuarioDe('c-1'))).toEqual({ url: null });
  });

  it('una sesión sin cliente (ROOT fuera de un cliente) recibe null sin tocar el use case', async () => {
    const { controller, useCase } = build();

    expect(await controller.ver(usuarioDe(null, true))).toEqual({ url: null });
    expect(useCase.execute).not.toHaveBeenCalled();
  });

  it('exige JwtAuthGuard y NO GlobalAdminGuard (lo ve cualquier usuario del cliente)', () => {
    const guards: unknown[] =
      Reflect.getMetadata(GUARDS_METADATA, ClienteLinkSoporteController.prototype.ver) ?? [];
    expect(guards).toContain(JwtAuthGuard);
    expect(guards).not.toContain(GlobalAdminGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, ClienteLinkSoporteController) ?? []).toEqual([]);
  });
});
