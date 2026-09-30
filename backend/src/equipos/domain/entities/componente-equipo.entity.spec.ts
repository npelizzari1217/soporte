import { describe, it, expect } from 'vitest';
import {
  COMPONENTE_MOTIVO_RETIRO_MAX_LENGTH,
  ComponenteEquipoEntity,
  ComponenteEquipoProps,
  DESTINOS_RETIRO_COMPONENTE,
} from './componente-equipo.entity';
import {
  InsumoRepuestoInexistenteError,
  MotivoRetiroRequeridoError,
} from '../errors/equipos.errors';

/**
 * ComponenteEquipoEntity — sdd/catalogo-unico-componentes: sin tipo propio
 * (se deriva de la familia del insumo) e `insumoId` obligatorio: `create()`
 * → Result.fail(InsumoRepuestoInexistenteError) si falta.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q2 (Result normalizado, ADR-9).
 */
describe('ComponenteEquipoEntity', () => {
  it('create() falla con InsumoRepuestoInexistenteError si insumoId está vacío', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: '',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    });
    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(InsumoRepuestoInexistenteError);
  });

  it('create() acepta un componente válido vinculado a un repuesto', () => {
    const result = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: 'Kingston 16GB',
      numeroSerie: null,
      capacidad: '16GB',
    });
    expect(result.isOk()).toBe(true);
    const componente = result.getValue();
    expect(componente.equipoId).toBe('equipo-1');
    expect(componente.capacidad).toBe('16GB');
    expect(componente.insumoId).toBe('insumo-1');
  });

  /**
   * Fix defecto "límites de equipos" (sdd/limites-db): la base impone topes
   * (`VarChar`) que el dominio no hacía respetar.
   */
  describe('límites de largo', () => {
    function baseProps(): ComponenteEquipoProps {
      return {
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      };
    }

    it.each([
      ['descripcion', { descripcion: 'A'.repeat(256) }, /descripcion excede/],
      ['numeroSerie', { numeroSerie: 'A'.repeat(256) }, /numeroSerie excede/],
      ['capacidad', { capacidad: 'A'.repeat(101) }, /capacidad excede/],
    ] as const)('create() rechaza %s fuera de rango', (_campo, override, mensaje) => {
      expect(() => ComponenteEquipoEntity.create({ ...baseProps(), ...override })).toThrow(mensaje);
    });

    it.each([
      ['descripcion', { descripcion: 'A'.repeat(255) }],
      ['numeroSerie', { numeroSerie: 'A'.repeat(255) }],
      ['capacidad', { capacidad: 'A'.repeat(100) }],
    ] as const)('create() acepta %s en el límite exacto', (_campo, override) => {
      expect(() => ComponenteEquipoEntity.create({ ...baseProps(), ...override })).not.toThrow();
    });

    it('actualizar() re-valida el mismo tope de descripcion', () => {
      const componente = ComponenteEquipoEntity.create(baseProps()).getValue();
      expect(() => componente.actualizar({ descripcion: 'A'.repeat(256) })).toThrow(
        /descripcion excede/,
      );
      expect(componente.descripcion).toBeNull(); // no mutó (falló antes de aplicar)
    });
  });

  /**
   * Hermano invertido de los tests de rechazo de `create()`: `reconstitute()`
   * NO valida largos (JSDoc de `validarLargos`) porque la fila ya existe en
   * la base — hacer explotar una lectura por un valor histórico convertiría
   * un dato viejo en una caída de sistema.
   */
  it('reconstitute() NO valida largos (permite un valor histórico que excede el tope actual)', () => {
    expect(() =>
      ComponenteEquipoEntity.reconstitute(
        {
          equipoId: 'equipo-1',
          insumoId: 'insumo-1',
          descripcion: 'A'.repeat(300),
          numeroSerie: null,
          capacidad: null,
        },
        'componente-historico',
        new Date('2020-01-01'),
        new Date('2020-01-01'),
        null,
      ),
    ).not.toThrow();
  });

  it('reconstitute() restaura un componente EXISTENTE desde persistencia', () => {
    const componente = ComponenteEquipoEntity.reconstitute(
      {
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      },
      'componente-1',
      new Date(),
      new Date(),
      null,
    );
    expect(componente.id).toBe('componente-1');
    expect(componente.insumoId).toBe('insumo-1');
  });

  it('activo es true recién creado y false luego de softDelete()', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    expect(componente.activo).toBe(true);

    componente.softDelete();
    expect(componente.activo).toBe(false);
    expect(componente.deletedAt).not.toBeNull();
  });

  it('actualizar() aplica PATCH semántico: undefined no toca, null limpia', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: 'Original',
      numeroSerie: 'SN-1',
      capacidad: '8GB',
    }).getValue();

    componente.actualizar({ descripcion: null, capacidad: '16GB' });

    expect(componente.descripcion).toBeNull();
    expect(componente.capacidad).toBe('16GB');
    expect(componente.numeroSerie).toBe('SN-1'); // no tocado (undefined)
    expect(componente.insumoId).toBe('insumo-1'); // el repuesto no se edita
  });

  it('reactivar() limpia deletedAt de un componente dado de baja', () => {
    const componente = ComponenteEquipoEntity.create({
      equipoId: 'equipo-1',
      insumoId: 'insumo-1',
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    componente.softDelete();
    expect(componente.activo).toBe(false);

    componente.reactivar();

    expect(componente.activo).toBe(true);
    expect(componente.deletedAt).toBeNull();
  });

  /**
   * Registro del retiro (sdd/stock-usado-componentes, ADR-4/ADR-5).
   */
  describe('retiro', () => {
    function nuevo(instalacionMovimientoId?: string): ComponenteEquipoEntity {
      const componente = ComponenteEquipoEntity.create({
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue();
      if (instalacionMovimientoId) componente.vincularInstalacion(instalacionMovimientoId);
      return componente;
    }

    it('DESTINOS_RETIRO_COMPONENTE es el catálogo cerrado de dos destinos', () => {
      expect([...DESTINOS_RETIRO_COMPONENTE]).toEqual(['STOCK_USADO', 'DESCARTE']);
    });

    it('un componente recién creado no tiene registro de retiro', () => {
      const componente = nuevo();
      expect(componente.instalacionMovimientoId).toBeNull();
      expect(componente.bajaDestino).toBeNull();
      expect(componente.bajaMotivo).toBeNull();
      expect(componente.bajaMovimientoId).toBeNull();
      expect(componente.bajaUsuarioId).toBeNull();
      expect(componente.bajaSinSalidaPrevia).toBe(false);
    });

    it('vincularInstalacion() guarda la SALIDA', () => {
      const componente = nuevo();
      componente.vincularInstalacion('mov-salida');
      expect(componente.instalacionMovimientoId).toBe('mov-salida');
    });

    describe('validarRetiro()', () => {
      it('DESCARTE sin motivo o con motivo en blanco → MotivoRetiroRequeridoError', () => {
        for (const motivo of [undefined, null, '', '   ']) {
          const result = nuevo('mov-salida').validarRetiro('DESCARTE', motivo);
          expect(result.isFail()).toBe(true);
          expect(result.getError()).toBeInstanceOf(MotivoRetiroRequeridoError);
        }
      });

      it('STOCK_USADO sin SALIDA vinculada y sin motivo → MotivoRetiroRequeridoError', () => {
        const result = nuevo().validarRetiro('STOCK_USADO', '  ');
        expect(result.isFail()).toBe(true);
        expect(result.getError()).toBeInstanceOf(MotivoRetiroRequeridoError);
      });

      it('STOCK_USADO CON SALIDA vinculada acepta el retiro sin motivo (null)', () => {
        const result = nuevo('mov-salida').validarRetiro('STOCK_USADO', undefined);
        expect(result.isOk()).toBe(true);
        expect(result.getValue()).toBeNull();
      });

      it('normaliza el motivo (recorte de bordes) en las combinaciones que lo aceptan', () => {
        expect(nuevo().validarRetiro('DESCARTE', '  Placa quemada  ').getValue()).toBe(
          'Placa quemada',
        );
        expect(nuevo().validarRetiro('STOCK_USADO', ' Pieza sana ').getValue()).toBe('Pieza sana');
        expect(nuevo('mov-salida').validarRetiro('STOCK_USADO', ' Se cambió ').getValue()).toBe(
          'Se cambió',
        );
      });

      it('el tope de 500 se mide sobre el motivo normalizado: 500 pasa, 501 lanza', () => {
        const tope = COMPONENTE_MOTIVO_RETIRO_MAX_LENGTH;
        expect(tope).toBe(500);
        expect(
          nuevo()
            .validarRetiro('DESCARTE', ` ${'a'.repeat(tope)} `)
            .isOk(),
        ).toBe(true);
        expect(() => nuevo().validarRetiro('DESCARTE', 'a'.repeat(tope + 1))).toThrow(
          /motivo excede 500/,
        );
      });
    });

    describe('retirar()', () => {
      it('DESCARTE: da de baja y registra destino, motivo y usuario, sin movimiento', () => {
        const componente = nuevo();
        componente.retirar({
          destino: 'DESCARTE',
          motivo: 'Placa quemada',
          usuarioId: 'user-1',
          bajaMovimientoId: null,
        });
        expect(componente.activo).toBe(false);
        expect(componente.bajaDestino).toBe('DESCARTE');
        expect(componente.bajaMotivo).toBe('Placa quemada');
        expect(componente.bajaUsuarioId).toBe('user-1');
        expect(componente.bajaMovimientoId).toBeNull();
        expect(componente.bajaSinSalidaPrevia).toBe(false);
      });

      it('STOCK_USADO con SALIDA vinculada: registra la ENTRADA y NO marca sin salida previa', () => {
        const componente = nuevo('mov-salida');
        componente.retirar({
          destino: 'STOCK_USADO',
          motivo: null,
          usuarioId: 'user-1',
          bajaMovimientoId: 'mov-entrada',
        });
        expect(componente.activo).toBe(false);
        expect(componente.bajaMovimientoId).toBe('mov-entrada');
        expect(componente.bajaSinSalidaPrevia).toBe(false);
      });

      it('bajaSinSalidaPrevia se DERIVA: STOCK_USADO sin SALIDA vinculada es true; DESCARTE es false', () => {
        const devuelto = nuevo();
        devuelto.retirar({
          destino: 'STOCK_USADO',
          motivo: 'Vino con el equipo',
          usuarioId: 'user-1',
          bajaMovimientoId: 'mov-entrada',
        });
        expect(devuelto.bajaSinSalidaPrevia).toBe(true);

        const descartado = nuevo();
        descartado.retirar({
          destino: 'DESCARTE',
          motivo: 'Roto',
          usuarioId: 'user-1',
          bajaMovimientoId: null,
        });
        expect(descartado.bajaSinSalidaPrevia).toBe(false);
      });

      it('lanza ante violaciones de contrato: ya retirado, STOCK_USADO sin ENTRADA, DESCARTE con ENTRADA', () => {
        const retirado = nuevo();
        retirado.retirar({
          destino: 'DESCARTE',
          motivo: 'x',
          usuarioId: 'u',
          bajaMovimientoId: null,
        });
        expect(() =>
          retirado.retirar({
            destino: 'DESCARTE',
            motivo: 'x',
            usuarioId: 'u',
            bajaMovimientoId: null,
          }),
        ).toThrow(/ya está dado de baja/);
        expect(() =>
          nuevo().retirar({
            destino: 'STOCK_USADO',
            motivo: 'x',
            usuarioId: 'u',
            bajaMovimientoId: null,
          }),
        ).toThrow(/exige la ENTRADA/);
        expect(() =>
          nuevo().retirar({
            destino: 'DESCARTE',
            motivo: 'x',
            usuarioId: 'u',
            bajaMovimientoId: 'm',
          }),
        ).toThrow(/no lleva movimiento/);
      });
    });

    describe('reactivar()', () => {
      it('limpia deletedAt Y las cuatro columnas de retiro, y conserva la instalación', () => {
        const componente = nuevo('mov-salida');
        componente.retirar({
          destino: 'DESCARTE',
          motivo: 'Roto',
          usuarioId: 'user-1',
          bajaMovimientoId: null,
        });

        componente.reactivar();

        expect(componente.activo).toBe(true);
        expect(componente.bajaDestino).toBeNull();
        expect(componente.bajaMotivo).toBeNull();
        expect(componente.bajaMovimientoId).toBeNull();
        expect(componente.bajaUsuarioId).toBeNull();
        expect(componente.instalacionMovimientoId).toBe('mov-salida');
      });
    });
  });
});
