/**
 * [UNIT] `ObtenerPermisosPorTipoUseCase` (odd/permisos-por-tipo-ticket, S6, T6): el resumen que
 * el frontend usa para ocultar botones. Por tipo, las acciones de la tabla del tenant; por módulo,
 * la unión de las acciones de sus tipos, dados de baja incluidos.
 */
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { ObtenerPermisosPorTipoUseCase } from './obtener-permisos-por-tipo.use-case';

const TIPOS = [
  { id: 'tipo-soporte', modulo: 'TICKETS' },
  { id: 'tipo-redes', modulo: 'TICKETS' },
  { id: 'tipo-mantenimiento', modulo: 'EDILICIA' },
  // Dado de baja: `listarTipos` lo trae igual (L24).
  { id: 'tipo-viejo', modulo: 'EQUIPOS' },
];

function armar() {
  const repo = new PermisosTipoTicketEnMemoria(TIPOS, [
    { usuarioId: 'tecnico-1', tipoId: 'tipo-soporte', accion: 'MODIFICACION' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-soporte', accion: 'LECTURA' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-redes', accion: 'LECTURA' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-redes', accion: 'ALTAS' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-mantenimiento', accion: 'LECTURA' },
    { usuarioId: 'tecnico-1', tipoId: 'tipo-viejo', accion: 'LECTURA' },
  ]);
  const listarTipos = vi.spyOn(repo, 'listarTipos');
  return { repo, listarTipos, useCase: new ObtenerPermisosPorTipoUseCase(repo) };
}

describe('ObtenerPermisosPorTipoUseCase', () => {
  it('devuelve las acciones por tipo en el orden del catálogo y la unión por módulo', async () => {
    const { repo, useCase } = armar();

    const resumen = await useCase.execute({
      permisosPorTipo: await repo.listarPorUsuario('tecnico-1'),
    });

    expect(resumen).toEqual({
      sinRestriccion: false,
      porTipo: {
        'tipo-soporte': ['LECTURA', 'MODIFICACION'],
        'tipo-redes': ['LECTURA', 'ALTAS'],
        'tipo-mantenimiento': ['LECTURA'],
        'tipo-viejo': ['LECTURA'],
      },
      porModulo: {
        TICKETS: ['LECTURA', 'ALTAS', 'MODIFICACION'],
        EDILICIA: ['LECTURA'],
        EQUIPOS: ['LECTURA'],
      },
    });
  });

  it('un módulo sin filas en ninguno de sus tipos no aparece en porModulo', async () => {
    const { useCase } = armar();

    const resumen = await useCase.execute({
      permisosPorTipo: new Map([['tipo-mantenimiento', new Set(['ALTAS'] as const)]]),
    });

    expect(resumen.porModulo).toEqual({ EDILICIA: ['ALTAS'] });
    expect(resumen.porModulo).not.toHaveProperty('TICKETS');
  });

  it('ROOT y ADMINISTRADOR (permisosPorTipo null) quedan sin restricción y no leen los tipos', async () => {
    const { useCase, listarTipos } = armar();

    const resumen = await useCase.execute({ permisosPorTipo: null });

    expect(resumen).toEqual({ sinRestriccion: true, porTipo: {}, porModulo: {} });
    expect(listarTipos).not.toHaveBeenCalled();
  });

  it('un usuario sin filas no tiene restricción levantada: queda todo vacío', async () => {
    const { useCase, listarTipos } = armar();

    const resumen = await useCase.execute({ permisosPorTipo: new Map() });

    expect(resumen).toEqual({ sinRestriccion: false, porTipo: {}, porModulo: {} });
    expect(listarTipos).not.toHaveBeenCalled();
  });
});
