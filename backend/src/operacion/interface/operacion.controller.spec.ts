/**
 * [UNIT] Estado de saturación de la base para el aviso en pantalla de ROOT
 * (odd/saturacion-conexiones, S3).
 */
import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GlobalAdminGuard } from '../../auth/infrastructure/guards/global-admin.guard';
import { JwtAuthGuard } from '../../auth/infrastructure/guards/jwt-auth.guard';
import { MonitorSaturacion } from '../../shared/infrastructure/saturacion/monitor-saturacion';
import { OperacionController } from './operacion.controller';

describe('OperacionController — GET /operacion/saturacion', () => {
  it('devuelve las saturaciones recientes y el último aviso con fechas ISO', () => {
    const monitor = new MonitorSaturacion(
      { error: vi.fn() },
      () => new Date('2026-11-09T15:00:00.000Z'),
    );
    for (let i = 0; i < 5; i++) monitor.registrar('pool');

    expect(new OperacionController(monitor).saturacion()).toEqual({
      eventosRecientes: 5,
      ultimoAviso: {
        avisadoEn: '2026-11-09T15:00:00.000Z',
        eventos: 5,
        desde: '2026-11-09T15:00:00.000Z',
        hasta: '2026-11-09T15:00:00.000Z',
        porOrigen: { servidor: 0, pool: 5, transaccion: 0 },
      },
    });
  });

  it('sin saturaciones, no hay último aviso', () => {
    const monitor = new MonitorSaturacion({ error: vi.fn() });

    expect(new OperacionController(monitor).saturacion()).toEqual({
      eventosRecientes: 0,
      ultimoAviso: null,
    });
  });

  it('solo lo ve un ROOT: el controller exige sesión y GlobalAdminGuard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, OperacionController) ?? []) as unknown[];

    expect(guards).toEqual([JwtAuthGuard, GlobalAdminGuard]);
  });
});
