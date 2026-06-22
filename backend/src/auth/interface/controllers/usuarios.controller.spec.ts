/**
 * 2.D.3 TEST — Unit tests para UsuariosController.
 *
 * Verifica que el controlador:
 * - Delega a los use cases con los DTOs correctos.
 * - Retorna la respuesta esperada en caso de éxito.
 * - Lanza HttpException apropiada en caso de error de dominio.
 *
 * Los use cases son mockeados.
 *
 * Tarea: 2.D.3
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsuariosController } from './usuarios.controller';
import { Result } from '../../../shared/domain/result';
import {
  UsuarioNoEncontradoError,
  RolNoEncontradoError,
  RolYaAsignadoError,
} from '../../domain/errors/auth.errors';

// ─── Mocks ────────────────────────────────────────────────────────────────────

function makeAsignarRolUseCase() {
  return { execute: jest.fn() };
}

function makeBajaUsuarioUseCase() {
  return { execute: jest.fn() };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('UsuariosController', () => {
  let controller: UsuariosController;
  let asignarRolUseCase: ReturnType<typeof makeAsignarRolUseCase>;
  let bajaUsuarioUseCase: ReturnType<typeof makeBajaUsuarioUseCase>;

  beforeEach(() => {
    asignarRolUseCase = makeAsignarRolUseCase();
    bajaUsuarioUseCase = makeBajaUsuarioUseCase();
    controller = new UsuariosController(asignarRolUseCase as any, bajaUsuarioUseCase as any);
  });

  // ─── asignarRol ────────────────────────────────────────────────────────────

  describe('POST /usuarios/:id/roles', () => {
    it('asigna el rol y retorna 201 (void)', async () => {
      asignarRolUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.asignarRol('user-uuid', { rolCodigo: 'ADMIN' });

      expect(result).toBeUndefined();
      expect(asignarRolUseCase.execute).toHaveBeenCalledWith({
        usuarioId: 'user-uuid',
        rolCodigo: 'ADMIN',
      });
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      asignarRolUseCase.execute.mockResolvedValue(
        Result.fail(new UsuarioNoEncontradoError('user-uuid')),
      );

      await expect(controller.asignarRol('user-uuid', { rolCodigo: 'ADMIN' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFoundException cuando el rol no existe', async () => {
      asignarRolUseCase.execute.mockResolvedValue(
        Result.fail(new RolNoEncontradoError('INEXISTENTE')),
      );

      await expect(
        controller.asignarRol('user-uuid', { rolCodigo: 'INEXISTENTE' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza BadRequestException cuando el rol ya está asignado', async () => {
      asignarRolUseCase.execute.mockResolvedValue(Result.fail(new RolYaAsignadoError('ADMIN')));

      await expect(controller.asignarRol('user-uuid', { rolCodigo: 'ADMIN' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── baja ──────────────────────────────────────────────────────────────────

  describe('DELETE /usuarios/:id', () => {
    it('da de baja al usuario y retorna 204 (void)', async () => {
      bajaUsuarioUseCase.execute.mockResolvedValue(Result.ok(undefined));

      const result = await controller.baja('user-uuid');

      expect(result).toBeUndefined();
      expect(bajaUsuarioUseCase.execute).toHaveBeenCalledWith({ usuarioId: 'user-uuid' });
    });

    it('lanza NotFoundException cuando el usuario no existe', async () => {
      bajaUsuarioUseCase.execute.mockResolvedValue(
        Result.fail(new UsuarioNoEncontradoError('user-uuid')),
      );

      await expect(controller.baja('user-uuid')).rejects.toThrow(NotFoundException);
    });
  });
});
