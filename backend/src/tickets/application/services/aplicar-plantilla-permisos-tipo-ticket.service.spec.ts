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

function armar(iniciales: ConstructorParameters<typeof PermisosTipoTicketEnMemoria>[1] = []) {
  const repo = new PermisosTipoTicketEnMemoria(TIPOS, iniciales);
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
    ]);

    const escribio = await servicio.ejecutar({
      usuarioId: USUARIO,
      celdas: PRESETS_ROL['TECNICO'],
      sobrescribir: true,
    });

    expect(escribio).toBe(true);
    expect(repo.filasDe(USUARIO)).toEqual(FILAS_TECNICO);
    expect(repo.filasDe(OTRO)).toEqual(['soporte:LECTURA']);
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
});
