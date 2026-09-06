import { describe, expect, it } from 'vitest';
import { TIPOS_AJUSTE_INSUMO } from '../entities/tipo-movimiento-insumo';
import { DomainError } from '../../../shared/domain/result';
import {
  CodigoAlternativoDuplicadoError,
  CompatibilidadDuplicadaError,
  FamiliaInsumoDeshabilitadaError,
  FamiliaInsumoInexistenteError,
  InsumoCodigoDuplicadoError,
  InsumoNoEncontradoError,
  MotivoAjusteRequeridoError,
  ModeloEquipoDeshabilitadoError,
  ModeloEquipoInexistenteError,
  UnidadMedidaDeshabilitadaError,
  UnidadMedidaInexistenteError,
} from './insumos.errors';

describe('Errores de dominio de insumos', () => {
  it('InsumoNoEncontradoError expone code INSUMO_NO_ENCONTRADO y nombra el id', () => {
    const error = new InsumoNoEncontradoError('id-x');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INSUMO_NO_ENCONTRADO');
    expect(error.message).toContain('id-x');
  });

  /**
   * El índice `insumos_codigo_key` NO es parcial: no filtra por `activo` ni
   * por `deleted_at`. Un código ocupado sigue tomado aunque el insumo esté
   * deshabilitado o dado de baja, y el mensaje tiene que decirlo — si no, el
   * administrador busca el código en el listado, no lo ve (porque el insumo
   * está deshabilitado) y concluye que el sistema miente.
   */
  it('InsumoCodigoDuplicadoError expone code INSUMO_CODIGO_DUPLICADO y nombra el código', () => {
    const error = new InsumoCodigoDuplicadoError('TON-001');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INSUMO_CODIGO_DUPLICADO');
    expect(error.message).toContain('TON-001');
  });

  it('InsumoCodigoDuplicadoError avisa que el código sigue tomado aunque el insumo no esté vigente', () => {
    const error = new InsumoCodigoDuplicadoError('TON-001');
    expect(error.message).toContain('activo o inactivo');
    expect(error.message).toContain('baja');
  });

  it('FamiliaInsumoInexistenteError expone code FAMILIA_INSUMO_INEXISTENTE y nombra el id', () => {
    const error = new FamiliaInsumoInexistenteError('id-familia');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('FAMILIA_INSUMO_INEXISTENTE');
    expect(error.message).toContain('id-familia');
  });

  /**
   * Existir y ser elegible son dos cosas distintas: la FK no atrapa a la
   * familia deshabilitada —la fila existe— así que el error tiene que ser
   * otro, o el administrador recibe "no existe" sobre algo que ve en el
   * listado.
   */
  it('FamiliaInsumoDeshabilitadaError expone un code distinto del de la familia inexistente', () => {
    const deshabilitada = new FamiliaInsumoDeshabilitadaError('id-familia');
    const inexistente = new FamiliaInsumoInexistenteError('id-familia');

    expect(deshabilitada).toBeInstanceOf(DomainError);
    expect(deshabilitada.code).toBe('FAMILIA_INSUMO_DESHABILITADA');
    expect(deshabilitada.code).not.toBe(inexistente.code);
    expect(deshabilitada.message).toContain('id-familia');
  });

  it('UnidadMedidaInexistenteError expone code UNIDAD_MEDIDA_INEXISTENTE y nombra el id', () => {
    const error = new UnidadMedidaInexistenteError('id-unidad');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('UNIDAD_MEDIDA_INEXISTENTE');
    expect(error.message).toContain('id-unidad');
  });

  it('UnidadMedidaDeshabilitadaError expone un code distinto del de la unidad inexistente', () => {
    const deshabilitada = new UnidadMedidaDeshabilitadaError('id-unidad');
    const inexistente = new UnidadMedidaInexistenteError('id-unidad');

    expect(deshabilitada).toBeInstanceOf(DomainError);
    expect(deshabilitada.code).toBe('UNIDAD_MEDIDA_DESHABILITADA');
    expect(deshabilitada.code).not.toBe(inexistente.code);
    expect(deshabilitada.message).toContain('id-unidad');
  });

  /**
   * `ModeloEquipoInexistenteError` y `ModeloEquipoDeshabilitadoError` comparten
   * nombre y `code` con los de `src/equipos/domain/errors/equipos.errors.ts`.
   * Es DELIBERADO: es la misma condición de negocio, y el código que ve el
   * cliente tiene que ser el mismo lo reporte el alta de un equipo o el alta de
   * un insumo. Los `code` se fijan como literales y NO se importan de
   * `equipos`: el import inverso cerraría un ciclo entre los dos módulos,
   * porque `equipos` ya importa el puerto del catálogo desde `insumos`.
   */
  it('ModeloEquipoInexistenteError expone code MODELO_EQUIPO_INEXISTENTE y nombra el id', () => {
    const error = new ModeloEquipoInexistenteError('id-modelo');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('MODELO_EQUIPO_INEXISTENTE');
    expect(error.message).toContain('id-modelo');
  });

  /**
   * Existir y ser elegible son dos cosas distintas: la FK no atrapa al modelo
   * deshabilitado —la fila existe—, así que la base acepta el vínculo sin
   * chistar y el insumo queda declarado compatible con un modelo que el
   * administrador ya sacó de circulación.
   */
  it('ModeloEquipoDeshabilitadoError expone un code distinto del del modelo inexistente', () => {
    const deshabilitado = new ModeloEquipoDeshabilitadoError('id-modelo');
    const inexistente = new ModeloEquipoInexistenteError('id-modelo');

    expect(deshabilitado).toBeInstanceOf(DomainError);
    expect(deshabilitado.code).toBe('MODELO_EQUIPO_DESHABILITADO');
    expect(deshabilitado.code).not.toBe(inexistente.code);
    expect(deshabilitado.message).toContain('id-modelo');
  });

  /**
   * El duplicado es SIEMPRE dentro del payload: la PK de
   * `insumos_modelos_equipo` es el par `(insumo, modelo)`, así que dos insumos
   * distintos SÍ pueden declarar el mismo modelo — eso es justo lo que la
   * relación N:N significa. No hay choque "global" que reportar.
   */
  it('CompatibilidadDuplicadaError expone code COMPATIBILIDAD_DUPLICADA y nombra el modelo repetido', () => {
    const error = new CompatibilidadDuplicadaError('id-modelo');
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('COMPATIBILIDAD_DUPLICADA');
    expect(error.message).toContain('id-modelo');
  });

  describe('CodigoAlternativoDuplicadoError', () => {
    it('expone code CODIGO_ALTERNATIVO_DUPLICADO y nombra el par completo', () => {
      const error = new CodigoAlternativoDuplicadoError('CE285A', 'HP');

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
      expect(error.message).toContain('CE285A');
      expect(error.message).toContain('HP');
    });

    /**
     * Con `fabricante` en `null` el par es el código GENÉRICO. Interpolar el
     * `null` produciría `del fabricante "null"`, que manda al administrador a
     * buscar un fabricante llamado "null" que no existe.
     */
    it('describe el código sin fabricante como genérico, sin imprimir "null"', () => {
      const error = new CodigoAlternativoDuplicadoError('CE285A', null);

      expect(error.code).toBe('CODIGO_ALTERNATIVO_DUPLICADO');
      expect(error.message).toContain('CE285A');
      expect(error.message).toContain('sin fabricante');
      expect(error.message).not.toContain('null');
    });
  });

  describe('MotivoAjusteRequeridoError', () => {
    /**
     * Un ajuste sin motivo es un faltante sin explicación. La base NO puede
     * exigirlo —un `CHECK` condicional sería un segundo dueño de la regla, y
     * además un espacio en blanco lo conformaría igual—, así que el error es
     * la única señal que recibe quien carga.
     */
    it('expone code MOTIVO_AJUSTE_REQUERIDO y nombra el insumo', () => {
      const error = new MotivoAjusteRequeridoError('id-insumo', 'AJUSTE_NEGATIVO');

      expect(error).toBeInstanceOf(DomainError);
      expect(error.code).toBe('MOTIVO_AJUSTE_REQUERIDO');
      expect(error.message).toContain('id-insumo');
    });

    /**
     * El mensaje nombra el tipo EXACTO, no la palabra genérica "ajuste": los
     * dos ajustes son la misma operación con distinto signo, y quien acaba de
     * asentar un faltante necesita ver en el error que el sistema entendió
     * `AJUSTE_NEGATIVO` y no el positivo. El caso se recorre DESDE
     * `TIPOS_AJUSTE_INSUMO`, así que un tercer ajuste quedaría cubierto solo.
     *
     * El motivo además es OPCIONAL en la entrada y en la salida: sin el tipo
     * en el mensaje, quien registra una salida leería "el motivo es
     * obligatorio", lo generalizaría y cargaría relleno en toda la bitácora.
     */
    it('nombra el tipo de ajuste exacto, y no el otro', () => {
      for (const tipo of TIPOS_AJUSTE_INSUMO) {
        const error = new MotivoAjusteRequeridoError('id-insumo', tipo);
        const elOtro = TIPOS_AJUSTE_INSUMO.filter((candidato) => candidato !== tipo);

        expect(error.message).toContain(tipo);
        for (const ajeno of elOtro) {
          expect(error.message).not.toContain(ajeno);
        }
      }
    });
  });
});
