import { describe, it, expect, vi } from 'vitest';
import { AsignarEquipoUseCase } from './asignar-equipo.use-case';
import { EquipoInformaticoEntity } from '../../domain/entities/equipo-informatico.entity';
import { EquipoNoEncontradoError } from '../../domain/errors/equipos.errors';
import { AsignadoInvalidoError } from '../../../tickets/domain/errors/tickets.errors';

/**
 * T12.3 [U][RED→GREEN] — AsignarEquipoUseCase: valida asignadoAId en master
 * (IUsuarioMasterChecker).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q1.
 */
describe('AsignarEquipoUseCase', () => {
  function makeEquipo() {
    return EquipoInformaticoEntity.create({
      nombre: 'X',
      numeroSerie: null,
      marca: null,
      modelo: null,
      fechaAdquisicion: null,
      ubicacionId: null,
      asignadoAId: null,
    });
  }

  it('falla con EquipoNoEncontradoError si el equipo no existe', async () => {
    const equipoRepo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const usuarioMasterChecker = { estaActivoEnTenant: vi.fn() };
    const useCase = new AsignarEquipoUseCase(equipoRepo as never, usuarioMasterChecker as never);

    const result = await useCase.execute({
      equipoId: 'no-existe',
      asignadoAId: 'usuario-1',
      clienteId: 'cliente-1',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EquipoNoEncontradoError);
  });

  it('falla con AsignadoInvalidoError si el usuario no está activo en el tenant', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo), save: vi.fn() };
    const usuarioMasterChecker = { estaActivoEnTenant: vi.fn().mockResolvedValue(false) };
    const useCase = new AsignarEquipoUseCase(equipoRepo as never, usuarioMasterChecker as never);

    const result = await useCase.execute({
      equipoId: equipo.id,
      asignadoAId: 'usuario-invalido',
      clienteId: 'cliente-1',
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(AsignadoInvalidoError);
    expect(equipoRepo.save).not.toHaveBeenCalled();
  });

  it('asigna el equipo cuando el usuario está activo en el tenant', async () => {
    const equipo = makeEquipo();
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo), save: vi.fn() };
    const usuarioMasterChecker = { estaActivoEnTenant: vi.fn().mockResolvedValue(true) };
    const useCase = new AsignarEquipoUseCase(equipoRepo as never, usuarioMasterChecker as never);

    const result = await useCase.execute({
      equipoId: equipo.id,
      asignadoAId: 'usuario-1',
      clienteId: 'cliente-1',
    });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().asignadoAId).toBe('usuario-1');
    expect(equipoRepo.save).toHaveBeenCalledTimes(1);
  });

  it('desasigna (asignadoAId=null) SIN validar contra master', async () => {
    const equipo = makeEquipo();
    equipo.asignarA('usuario-previo');
    const equipoRepo = { findById: vi.fn().mockResolvedValue(equipo), save: vi.fn() };
    const usuarioMasterChecker = { estaActivoEnTenant: vi.fn() };
    const useCase = new AsignarEquipoUseCase(equipoRepo as never, usuarioMasterChecker as never);

    const result = await useCase.execute({
      equipoId: equipo.id,
      asignadoAId: null,
      clienteId: 'cliente-1',
    });
    expect(result.isOk()).toBe(true);
    expect(result.getValue().asignadoAId).toBeNull();
    expect(usuarioMasterChecker.estaActivoEnTenant).not.toHaveBeenCalled();
  });
});
