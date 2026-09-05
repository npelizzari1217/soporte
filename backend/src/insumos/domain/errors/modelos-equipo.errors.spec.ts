import { describe, expect, it } from 'vitest';
import { ModeloEquipoNoEncontradoError, ModeloEquipoDuplicadoError } from './modelos-equipo.errors';

describe('Errores de dominio de modelos de equipo', () => {
  it('ModeloEquipoNoEncontradoError expone code MODELO_EQUIPO_NO_ENCONTRADO', () => {
    const error = new ModeloEquipoNoEncontradoError('id-x');
    expect(error.code).toBe('MODELO_EQUIPO_NO_ENCONTRADO');
    expect(error.message).toContain('id-x');
  });

  /**
   * La identidad de este catálogo es el PAR `marca` + `modelo`, no un código
   * suelto: `modelos_equipo` tiene `UNIQUE (marca, modelo)`. Un mensaje que
   * nombrara solo una de las dos mitades mandaría al administrador a buscar
   * una "HP" duplicada cuando lo que choca es "HP LaserJet Pro M404".
   */
  it('ModeloEquipoDuplicadoError nombra el par completo marca + modelo', () => {
    const error = new ModeloEquipoDuplicadoError('HP', 'LaserJet Pro M404');
    expect(error.code).toBe('MODELO_EQUIPO_DUPLICADO');
    expect(error.message).toContain('HP');
    expect(error.message).toContain('LaserJet Pro M404');
  });

  /**
   * El par queda tomado por la fila existente esté habilitada o no, y en este
   * catálogo nada se elimina. Un mensaje que hable de "dado de baja" manda al
   * administrador a buscar una eliminación que nunca ocurrió.
   */
  it('ModeloEquipoDuplicadoError describe el duplicado como activo o inactivo, sin hablar de baja', () => {
    const error = new ModeloEquipoDuplicadoError('HP', 'LaserJet Pro M404');
    expect(error.message).toContain('(activo o inactivo)');
    expect(error.message).not.toContain('dado de baja');
  });
});
