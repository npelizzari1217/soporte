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

/** Sin uso en los tests del estado: el correo de prueba tiene su propio caso. */
const sinPrueba = { execute: vi.fn() };

describe('OperacionController — GET /operacion/saturacion', () => {
  it('devuelve las saturaciones recientes y el último aviso con fechas ISO', () => {
    const monitor = new MonitorSaturacion(
      { error: vi.fn() },
      () => new Date('2026-11-09T15:00:00.000Z'),
    );
    for (let i = 0; i < 5; i++) monitor.registrar('pool');

    expect(new OperacionController(monitor, sinPrueba).saturacion()).toEqual({
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

    expect(new OperacionController(monitor, sinPrueba).saturacion()).toEqual({
      eventosRecientes: 0,
      ultimoAviso: null,
    });
  });

  it('solo lo ve un ROOT: el controller exige sesión y GlobalAdminGuard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, OperacionController) ?? []) as unknown[];

    expect(guards).toEqual([JwtAuthGuard, GlobalAdminGuard]);
  });
});

describe('OperacionController — POST /operacion/saturacion/correo-prueba', () => {
  it('devuelve el resultado del correo de prueba tal cual', async () => {
    const probar = {
      execute: vi.fn().mockResolvedValue({ ok: true, destinatarios: ['ana@sesitec.net'] }),
    };
    const monitor = new MonitorSaturacion({ error: vi.fn() });

    expect(await new OperacionController(monitor, probar).correoPrueba()).toEqual({
      ok: true,
      destinatarios: ['ana@sesitec.net'],
    });
    expect(probar.execute).toHaveBeenCalledTimes(1);
  });
});
