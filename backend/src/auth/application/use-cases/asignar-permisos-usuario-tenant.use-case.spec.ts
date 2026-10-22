import { describe, it, expect, vi } from 'vitest';
import { AsignarPermisosUsuarioTenantUseCase } from './asignar-permisos-usuario-tenant.use-case';
import {
  CeldaPermisoInvalidaError,
  MembresiaNoEncontradaError,
} from '../../domain/errors/auth.errors';
import type {
  IMembresiaRepository,
  MembresiaResuelta,
} from '../../domain/ports/i-membresia.repository';
import type { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';

function buildMembresiaResuelta(): MembresiaResuelta {
  return {
    clienteId: 'cliente-token',
    clienteNombre: 'Cliente Token',
    rolCodigo: 'TECNICO',
    clienteRequiere2fa: false,
  };
}

describe('AsignarPermisosUsuarioTenantUseCase (ABM de la matriz, sdd/matriz-permisos-por-usuario WU-7.4)', () => {
  /** Matriz en memoria de un usuario: se afirma sobre el estado final, no sobre las llamadas. */
  function matrizEnMemoria(iniciales: string[] = []): {
    repo: Pick<IMatrizPermisosRepository, 'setPermisos' | 'findByUsuarioYCliente'>;
    celdas: () => string[];
  } {
    let guardadas = [...iniciales];
    return {
      repo: {
        setPermisos: vi.fn(async (_u: string, _c: string, celdas: readonly string[]) => {
          guardadas = [...celdas];
        }),
        findByUsuarioYCliente: vi.fn(async () => [...guardadas]),
      },
      celdas: () => [...guardadas].sort(),
    };
  }

  function membresiaActiva(): Pick<IMembresiaRepository, 'findActivaByUsuarioYCliente'> {
    return {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(buildMembresiaResuelta()),
    };
  }

  it('reemplaza el set completo de celdas y lo retorna', async () => {
    const matriz = matrizEnMemoria(['COMPRAS:LECTURA', 'KB:LECTURA']);
    const useCase = new AsignarPermisosUsuarioTenantUseCase(matriz.repo, membresiaActiva());

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      celdas: ['COMPRAS:ALTAS', 'EDILICIA:BORRADO'],
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual(['COMPRAS:ALTAS', 'EDILICIA:BORRADO']);
    expect(matriz.celdas()).toEqual(['COMPRAS:ALTAS', 'EDILICIA:BORRADO']);
  });

  describe('celdas reemplazadas por los permisos por tipo (odd/permisos-por-tipo-ticket, T7, D5 d)', () => {
    it('conserva las celdas TICKETS:* y EDILICIA:LECTURA|ALTAS|MODIFICACION guardadas aunque el pedido no las traiga', async () => {
      const matriz = matrizEnMemoria([
        'TICKETS:LECTURA',
        'TICKETS:VER_TODOS',
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'EDILICIA:BORRADO',
        'COMPRAS:LECTURA',
      ]);
      const useCase = new AsignarPermisosUsuarioTenantUseCase(matriz.repo, membresiaActiva());

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        celdas: ['KB:LECTURA'],
      });

      const esperadas = [
        'EDILICIA:LECTURA',
        'EDILICIA:MODIFICACION',
        'KB:LECTURA',
        'TICKETS:LECTURA',
        'TICKETS:VER_TODOS',
      ];
      expect(matriz.celdas()).toEqual(esperadas);
      expect([...result.getValue()].sort()).toEqual(esperadas);
    });

    it('ignora las celdas reemplazadas que el pedido agrega: no concede TICKETS:* ni EDILICIA:ALTAS nuevas', async () => {
      const matriz = matrizEnMemoria(['COMPRAS:LECTURA']);
      const useCase = new AsignarPermisosUsuarioTenantUseCase(matriz.repo, membresiaActiva());

      const result = await useCase.execute({
        clienteId: 'cliente-token',
        usuarioId: 'usuario-1',
        celdas: ['TICKETS:LECTURA', 'TICKETS:ASIGNAR', 'EDILICIA:ALTAS', 'COMPRAS:LECTURA'],
      });

      expect(result.isOk()).toBe(true);
      expect(matriz.celdas()).toEqual(['COMPRAS:LECTURA']);
      expect(result.getValue()).toEqual(['COMPRAS:LECTURA']);
    });

    it('EDILICIA:BORRADO (desvincular compra, L21) sigue editándose: se quita si el pedido no la trae', async () => {
      const matriz = matrizEnMemoria(['EDILICIA:BORRADO', 'EDILICIA:LECTURA']);
      const useCase = new AsignarPermisosUsuarioTenantUseCase(matriz.repo, membresiaActiva());

      await useCase.execute({ clienteId: 'cliente-token', usuarioId: 'usuario-1', celdas: [] });

      expect(matriz.celdas()).toEqual(['EDILICIA:LECTURA']);
    });
  });

  it('DEFENSA EN PROFUNDIDAD: falla con CeldaPermisoInvalidaError si algún código no está en PARES_VALIDOS', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(buildMembresiaResuelta()),
    };
    const permisosRepo = {
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>(),
      findByUsuarioYCliente: vi.fn<IMatrizPermisosRepository['findByUsuarioYCliente']>(),
    };
    const useCase = new AsignarPermisosUsuarioTenantUseCase(permisosRepo, membresiaRepo);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-1',
      celdas: ['DASHBOARD:APROBACION'],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(CeldaPermisoInvalidaError);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
    expect(membresiaRepo.findActivaByUsuarioYCliente).not.toHaveBeenCalled();
  });

  it('AISLAMIENTO: falla con MembresiaNoEncontradaError si no hay membresía activa en este cliente', async () => {
    const membresiaRepo = {
      findActivaByUsuarioYCliente: vi
        .fn<IMembresiaRepository['findActivaByUsuarioYCliente']>()
        .mockResolvedValue(null),
    };
    const permisosRepo = {
      setPermisos: vi.fn<IMatrizPermisosRepository['setPermisos']>(),
      findByUsuarioYCliente: vi.fn<IMatrizPermisosRepository['findByUsuarioYCliente']>(),
    };
    const useCase = new AsignarPermisosUsuarioTenantUseCase(permisosRepo, membresiaRepo);

    const result = await useCase.execute({
      clienteId: 'cliente-token',
      usuarioId: 'usuario-de-otro-cliente',
      celdas: ['TICKETS:LECTURA'],
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(MembresiaNoEncontradaError);
    expect(permisosRepo.setPermisos).not.toHaveBeenCalled();
  });
});
