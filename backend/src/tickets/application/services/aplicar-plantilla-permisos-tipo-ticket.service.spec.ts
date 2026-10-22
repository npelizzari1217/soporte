import { describe, expect, it } from 'vitest';
import { PRESETS_ROL } from '../../../auth/domain/presets-rol';
import { PermisosTipoTicketEnMemoria } from '../../test-helpers/permisos-tipo-ticket-en-memoria';
import { AplicarPlantillaPermisosTipoTicket } from './aplicar-plantilla-permisos-tipo-ticket.service';

const USUARIO = 'usuario-1';
const OTRO = 'usuario-2';
const TIPOS = [
  { id: 'soporte', modulo: 'TICKETS' },
  { id: 'mantenimiento', modulo: 'EDILICIA' },
];

/**
 * Filas esperadas de un TECNICO: sus celdas de TICKETS y EDILICIA traducidas por L11. El tipo de
 * EDILICIA suma la traducción de TICKETS (L35).
 */
const FILAS_TECNICO = [
  'soporte:LECTURA',
  'soporte:VER_TODOS',
  'soporte:ALTAS',
  'soporte:MODIFICACION',
  'soporte:TRANSICIONAR',
  'soporte:ASIGNAR',
  'soporte:COMENTAR',
  'soporte:OBSERVAR',
  'soporte:IMPRESION',
  'mantenimiento:LECTURA',
  'mantenimiento:VER_TODOS',
  'mantenimiento:ALTAS',
  'mantenimiento:MODIFICACION',
  'mantenimiento:TRANSICIONAR',
  'mantenimiento:ASIGNAR',
  'mantenimiento:COMENTAR',
  'mantenimiento:OBSERVAR',
  'mantenimiento:IMPRESION',
].sort();

function armar(
  iniciales: ConstructorParameters<typeof PermisosTipoTicketEnMemoria>[1] = [],
  tipos: ConstructorParameters<typeof PermisosTipoTicketEnMemoria>[0] = TIPOS,
) {
  const repo = new PermisosTipoTicketEnMemoria(tipos, iniciales);
  return { repo, servicio: new AplicarPlantillaPermisosTipoTicket(repo) };
}

describe('AplicarPlantillaPermisosTipoTicket (T4c, S7)', () => {
  it('la plantilla de TECNICO escribe sus acciones en cada tipo de TICKETS y EDILICIA', async () => {
    const { repo, servicio } = armar();

    const escribio = await servicio.ejecutar({
      usuarioId: USUARIO,
      celdas: PRESETS_ROL['TECNICO'],
      sobrescribir: false,
    });

    expect(escribio).toBe(true);
    expect(repo.filasDe(USUARIO)).toEqual(FILAS_TECNICO);
  });

  it('la plantilla de USUARIO da ver, crear y comentar sin ver todos en TICKETS y EDILICIA', async () => {
    const { repo, servicio } = armar();

    await servicio.ejecutar({
      usuarioId: USUARIO,
      celdas: PRESETS_ROL['USUARIO'],
      sobrescribir: true,
    });

    expect(repo.filasDe(USUARIO)).toEqual(
      [
        'soporte:LECTURA',
        'soporte:ALTAS',
        'soporte:COMENTAR',
        'soporte:IMPRESION',
        'mantenimiento:LECTURA',
        'mantenimiento:ALTAS',
        'mantenimiento:COMENTAR',
        'mantenimiento:IMPRESION',
      ].sort(),
    );
  });

  it('con sobrescribir=true reemplaza las filas existentes del usuario y no toca a otros', async () => {
    const { repo, servicio } = armar([
      { usuarioId: USUARIO, tipoId: 'soporte', accion: 'BORRADO' },
      { usuarioId: OTRO, tipoId: 'soporte', accion: 'LECTURA' },
      { usuarioId: OTRO, tipoId: 'mantenimiento', accion: 'LECTURA' },
    ]);

    const escribio = await servicio.ejecutar({
      usuarioId: USUARIO,
      celdas: PRESETS_ROL['TECNICO'],
      sobrescribir: true,
    });

    expect(escribio).toBe(true);
    expect(repo.filasDe(USUARIO)).toEqual(FILAS_TECNICO);
    expect(repo.filasDe(OTRO)).toEqual(['mantenimiento:LECTURA', 'soporte:LECTURA']);
  });

  it('con sobrescribir=false y filas existentes no escribe nada (no fusiona)', async () => {
    const { repo, servicio } = armar([
      { usuarioId: USUARIO, tipoId: 'soporte', accion: 'LECTURA' },
    ]);

    const escribio = await servicio.ejecutar({
      usuarioId: USUARIO,
      celdas: PRESETS_ROL['TECNICO'],
      sobrescribir: false,
    });

    expect(escribio).toBe(false);
    expect(repo.filasDe(USUARIO)).toEqual(['soporte:LECTURA']);
  });

  it('la plantilla de ADMINISTRADOR no escribe filas, y con sobrescribir=true borra las previas', async () => {
    const { repo, servicio } = armar([
      { usuarioId: USUARIO, tipoId: 'soporte', accion: 'LECTURA' },
    ]);

    await servicio.ejecutar({
      usuarioId: USUARIO,
      celdas: PRESETS_ROL['ADMINISTRADOR'],
      sobrescribir: true,
    });

    expect(repo.filasDe(USUARIO)).toEqual([]);
  });

  /**
   * W3 (judgment-day de la etapa 1): un tipo nace cerrado (S4) y la plantilla del rol no lo abre.
   * Un tipo está abierto para las plantillas si algún usuario tiene Ver sobre él; si nadie tiene
   * Ver en ningún tipo, el tenant todavía no usa el modelo por tipo y la plantilla vale para todos.
   */
  describe('tipos cerrados (W3, S4)', () => {
    const CON_NUEVO = [...TIPOS, { id: 'nuevo', modulo: 'TICKETS' }];
    /** OTRO ve los dos tipos de siempre; nadie tiene filas sobre `nuevo`. */
    const ABIERTOS_POR_OTRO = [
      { usuarioId: OTRO, tipoId: 'soporte', accion: 'LECTURA' },
      { usuarioId: OTRO, tipoId: 'mantenimiento', accion: 'LECTURA' },
    ] as const;

    it('la plantilla de un usuario nuevo no crea filas sobre un tipo cerrado', async () => {
      const { repo, servicio } = armar([...ABIERTOS_POR_OTRO], CON_NUEVO);

      await servicio.ejecutar({
        usuarioId: USUARIO,
        celdas: PRESETS_ROL['TECNICO'],
        sobrescribir: false,
      });

      expect(repo.filasDe(USUARIO)).toEqual(FILAS_TECNICO);
    });

    it('reaplicar la plantilla (sobrescribir=true) tampoco abre un tipo cerrado', async () => {
      const { repo, servicio } = armar(
        [...ABIERTOS_POR_OTRO, { usuarioId: USUARIO, tipoId: 'soporte', accion: 'LECTURA' }],
        CON_NUEVO,
      );

      await servicio.ejecutar({
        usuarioId: USUARIO,
        celdas: PRESETS_ROL['TECNICO'],
        sobrescribir: true,
      });

      expect(repo.filasDe(USUARIO)).toEqual(FILAS_TECNICO);
    });

    it('sí escribe sobre un tipo que alguien abrió con Ver (por copia o a mano)', async () => {
      const { repo, servicio } = armar(
        [...ABIERTOS_POR_OTRO, { usuarioId: OTRO, tipoId: 'nuevo', accion: 'LECTURA' }],
        CON_NUEVO,
      );

      await servicio.ejecutar({
        usuarioId: USUARIO,
        celdas: PRESETS_ROL['USUARIO'],
        sobrescribir: false,
      });

      expect(repo.filasDe(USUARIO)).toContain('nuevo:LECTURA');
      expect(repo.filasDe(USUARIO)).toContain('nuevo:ALTAS');
    });

    it('un tipo con filas pero sin Ver de nadie sigue cerrado (S3: sin Ver no hay nada)', async () => {
      const { repo, servicio } = armar(
        [...ABIERTOS_POR_OTRO, { usuarioId: OTRO, tipoId: 'nuevo', accion: 'COMENTAR' }],
        CON_NUEVO,
      );

      await servicio.ejecutar({
        usuarioId: USUARIO,
        celdas: PRESETS_ROL['TECNICO'],
        sobrescribir: false,
      });

      expect(repo.filasDe(USUARIO)).toEqual(FILAS_TECNICO);
    });

    it('si nadie tiene Ver en ningún tipo (tenant sin modelo por tipo todavía), escribe en todos', async () => {
      const { repo, servicio } = armar([], CON_NUEVO);

      await servicio.ejecutar({
        usuarioId: USUARIO,
        celdas: PRESETS_ROL['USUARIO'],
        sobrescribir: false,
      });

      expect(repo.filasDe(USUARIO).filter((fila) => fila.startsWith('nuevo:'))).toEqual(
        ['nuevo:LECTURA', 'nuevo:ALTAS', 'nuevo:COMENTAR', 'nuevo:IMPRESION'].sort(),
      );
    });

    it('ADMINISTRADOR no cambia: no escribe filas y con sobrescribir=true borra las previas', async () => {
      const { repo, servicio } = armar(
        [...ABIERTOS_POR_OTRO, { usuarioId: USUARIO, tipoId: 'soporte', accion: 'LECTURA' }],
        CON_NUEVO,
      );

      await servicio.ejecutar({
        usuarioId: USUARIO,
        celdas: PRESETS_ROL['ADMINISTRADOR'],
        sobrescribir: true,
      });

      expect(repo.filasDe(USUARIO)).toEqual([]);
    });
  });
});
