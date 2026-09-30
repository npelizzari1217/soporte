import { describe, expect, it } from 'vitest';
import {
  ESTADOS_UNIDAD_INSUMO,
  normalizarSerial,
  OPERACIONES_UNIDAD,
  OperacionUnidad,
  TRANSICIONES_UNIDAD,
  UNIDAD_SERIAL_MAX_LENGTH,
  UnidadInsumoEntity,
  EstadoUnidadInsumo,
} from './unidad-insumo.entity';
import { SerialRequeridoError, UnidadNoDisponibleError } from '../errors/unidades-insumo.errors';
import { CondicionStock } from './tipo-movimiento-insumo';

describe('normalizarSerial', () => {
  it('pasa a mayúsculas', () => {
    expect(normalizarSerial('abc123')).toBe('ABC123');
  });

  it('quita los espacios de los bordes y los internos, de cualquier tipo', () => {
    expect(normalizarSerial('  ab c\t12\n3  ')).toBe('ABC123');
  });

  it('dos cargas que solo difieren en capitalización y espacios coinciden', () => {
    expect(normalizarSerial('sn 001')).toBe(normalizarSerial(' SN001 '));
  });

  it.each(['', '   ', '\t\n'])('un serial vacío o solo de espacios (%j) queda vacío', (serial) => {
    expect(normalizarSerial(serial)).toBe('');
  });

  it('ß pasa a SS, como toUpperCase de JS (la base no normaliza)', () => {
    expect(normalizarSerial('straße')).toBe('STRASSE');
  });

  it('conserva guiones y otros símbolos', () => {
    expect(normalizarSerial('ab-12/x')).toBe('AB-12/X');
  });
});

/** Unidad en el estado pedido, construida por la vía pública cuando se puede. */
function unidad(
  estado: EstadoUnidadInsumo,
  opciones: { pendiente?: boolean; condicion?: CondicionStock } = {},
): UnidadInsumoEntity {
  const pendiente = opciones.pendiente ?? false;
  return UnidadInsumoEntity.reconstitute(
    {
      insumoId: 'insumo-1',
      numeroSerie: pendiente ? null : 'sn 001',
      numeroSerieNormalizado: pendiente ? null : 'SN001',
      condicion: opciones.condicion ?? 'NUEVO',
      estado,
      equipoId: estado === 'INSTALADA' ? 'equipo-1' : null,
    },
    'unidad-1',
    new Date('2026-01-01T10:00:00.000Z'),
    new Date('2026-01-01T10:00:00.000Z'),
  );
}

/** Aplica una operación por su método público, para recorrer la tabla. */
function aplicar(u: UnidadInsumoEntity, operacion: OperacionUnidad) {
  switch (operacion) {
    case 'ENTREGAR':
      return u.entregar();
    case 'INSTALAR':
      return u.instalar('equipo-2');
    case 'DESCARTAR_DE_DEPOSITO':
      return u.descartarDeDeposito();
    case 'DEVOLVER_ENTREGA':
      return u.devolverEntrega('NUEVO');
    case 'DEVOLVER_AL_DEPOSITO':
      return u.devolverAlDeposito();
    case 'DESCARTAR_INSTALADA':
      return u.descartarInstalada();
    case 'REINSTALAR':
      return u.reinstalar('equipo-2');
    case 'RECUPERAR':
      return u.recuperar('USADO');
  }
}

describe('normalizarSerial (forma normalizada vs largo)', () => {
  it('ß pasa a SS: la forma normalizada puede ser más larga que la cargada', () => {
    expect(normalizarSerial('ß')).toBe('SS');
  });
});

describe('UnidadInsumoEntity — creación', () => {
  it('crearEnDeposito con serial guarda la forma recortada y la normalizada', () => {
    const u = UnidadInsumoEntity.crearEnDeposito({
      insumoId: 'insumo-1',
      condicion: 'NUEVO',
      numeroSerie: '  sn 001 ',
    }).getValue();

    expect(u.numeroSerie).toBe('sn 001');
    expect(u.numeroSerieNormalizado).toBe('SN001');
    expect(u.estado).toBe('EN_DEPOSITO');
    expect(u.equipoId).toBeNull();
    expect(u.esPendiente).toBe(false);
  });

  it('crearEnDeposito sin serial crea una serie pendiente (serial y normalizado nulos)', () => {
    const u = UnidadInsumoEntity.crearEnDeposito({
      insumoId: 'insumo-1',
      condicion: 'USADO',
      numeroSerie: null,
    }).getValue();

    expect(u.esPendiente).toBe(true);
    expect(u.numeroSerie).toBeNull();
    expect(u.numeroSerieNormalizado).toBeNull();
    expect(u.condicion).toBe('USADO');
  });

  it('un serial que queda vacío al normalizarlo se rechaza, no se vuelve pendiente', () => {
    const r = UnidadInsumoEntity.crearEnDeposito({
      insumoId: 'insumo-1',
      condicion: 'NUEVO',
      numeroSerie: '  \t ',
    });

    expect(r.isFail()).toBe(true);
    expect(r.getError()).toBeInstanceOf(SerialRequeridoError);
  });

  it('crearInstalada exige serial y deja la unidad INSTALADA con su equipo', () => {
    const u = UnidadInsumoEntity.crearInstalada({
      insumoId: 'insumo-1',
      condicion: 'NUEVO',
      numeroSerie: 'abc',
      equipoId: 'equipo-1',
    }).getValue();

    expect(u.estado).toBe('INSTALADA');
    expect(u.equipoId).toBe('equipo-1');
    expect(u.numeroSerieNormalizado).toBe('ABC');
  });

  it('crearInstalada sin serial con contenido falla: una INSTALADA siempre tiene serial', () => {
    const r = UnidadInsumoEntity.crearInstalada({
      insumoId: 'insumo-1',
      condicion: 'NUEVO',
      numeroSerie: '   ',
      equipoId: 'equipo-1',
    });

    expect(r.getError()).toBeInstanceOf(SerialRequeridoError);
  });

  it('acepta un serial de exactamente el largo máximo', () => {
    const r = UnidadInsumoEntity.crearEnDeposito({
      insumoId: 'insumo-1',
      condicion: 'NUEVO',
      numeroSerie: 'A'.repeat(UNIDAD_SERIAL_MAX_LENGTH),
    });

    expect(r.isOk()).toBe(true);
  });

  it('rechaza un serial cuya forma recortada excede el largo máximo', () => {
    expect(() =>
      UnidadInsumoEntity.crearEnDeposito({
        insumoId: 'insumo-1',
        condicion: 'NUEVO',
        numeroSerie: 'A'.repeat(UNIDAD_SERIAL_MAX_LENGTH + 1),
      }),
    ).toThrow(/excede 255/);
  });

  /**
   * `ß` mide 1 cargada y 2 normalizada (`SS`): 128 × `ß` son 128 caracteres
   * cargados pero 256 normalizados, que la columna `numero_serie_normalizado
   * VARCHAR(255)` no guarda. El tope se mide sobre la forma normalizada.
   */
  it('rechaza un serial que cabe cargado pero excede el largo máximo al normalizarlo (ß)', () => {
    const serial = 'ß'.repeat(128);
    expect(serial.length).toBeLessThanOrEqual(UNIDAD_SERIAL_MAX_LENGTH);
    expect(normalizarSerial(serial).length).toBeGreaterThan(UNIDAD_SERIAL_MAX_LENGTH);

    expect(() =>
      UnidadInsumoEntity.crearEnDeposito({
        insumoId: 'insumo-1',
        condicion: 'NUEVO',
        numeroSerie: serial,
      }),
    ).toThrow(/excede 255/);
  });

  it('acepta el mayor serial de ß que entra normalizado (127 × ß = 254)', () => {
    const r = UnidadInsumoEntity.crearEnDeposito({
      insumoId: 'insumo-1',
      condicion: 'NUEVO',
      numeroSerie: 'ß'.repeat(127),
    });

    expect(r.isOk()).toBe(true);
  });

  it('reconstitute no valida ni muta: una fila histórica se lee tal cual', () => {
    const u = unidad('ENTREGADA');

    expect(u.estado).toBe('ENTREGADA');
    expect(u.createdAt).toEqual(new Date('2026-01-01T10:00:00.000Z'));
  });
});

describe('UnidadInsumoEntity — máquina de estados (ADR-1)', () => {
  it('la tabla tiene una fila por operación y solo usa estados del catálogo', () => {
    expect(Object.keys(TRANSICIONES_UNIDAD).sort()).toEqual([...OPERACIONES_UNIDAD].sort());
    for (const { desde, hacia } of Object.values(TRANSICIONES_UNIDAD)) {
      expect(ESTADOS_UNIDAD_INSUMO).toContain(desde);
      expect(ESTADOS_UNIDAD_INSUMO).toContain(hacia);
    }
  });

  it('ningún estado es terminal: todos tienen al menos una transición de salida', () => {
    for (const estado of ESTADOS_UNIDAD_INSUMO) {
      expect(Object.values(TRANSICIONES_UNIDAD).some((t) => t.desde === estado)).toBe(true);
    }
  });

  describe.each(OPERACIONES_UNIDAD)('%s', (operacion) => {
    const { desde, hacia, requiereSerial } = TRANSICIONES_UNIDAD[operacion];

    it(`pasa de ${desde} a ${hacia}`, () => {
      const u = unidad(desde);

      const r = aplicar(u, operacion);

      expect(r.isOk()).toBe(true);
      expect(u.estado).toBe(hacia);
    });

    it.each(ESTADOS_UNIDAD_INSUMO.filter((e) => e !== desde))(
      'desde %s falla con UnidadNoDisponibleError y no muta la unidad',
      (origen) => {
        const u = unidad(origen);

        const r = aplicar(u, operacion);

        expect(r.isFail()).toBe(true);
        expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
        expect(u.estado).toBe(origen);
      },
    );

    it(
      requiereSerial
        ? 'sobre una serie pendiente falla y no muta'
        : 'admite una serie pendiente (no exige serial)',
      () => {
        const u = unidad(desde, { pendiente: true });

        const r = aplicar(u, operacion);

        if (requiereSerial) {
          expect(r.isFail()).toBe(true);
          expect(u.estado).toBe(desde);
        } else {
          expect(r.isOk()).toBe(true);
          expect(u.estado).toBe(hacia);
        }
      },
    );
  });

  it('una pendiente EN_DEPOSITO solo sale del depósito por descarte (ajuste negativo)', () => {
    for (const operacion of ['ENTREGAR', 'INSTALAR'] as const) {
      const u = unidad('EN_DEPOSITO', { pendiente: true });
      expect(aplicar(u, operacion).isFail()).toBe(true);
      expect(u.estado).toBe('EN_DEPOSITO');
    }
    const u = unidad('EN_DEPOSITO', { pendiente: true });
    expect(u.descartarDeDeposito().isOk()).toBe(true);
    expect(u.estado).toBe('DESCARTADA');
    expect(u.esPendiente).toBe(true);
  });

  it('una pendiente descartada no se reinstala, pero se recupera pendiente (G1)', () => {
    const u = unidad('DESCARTADA', { pendiente: true });

    expect(u.reinstalar('equipo-2').isFail()).toBe(true);
    expect(u.recuperar('NUEVO').isOk()).toBe(true);
    expect(u.estado).toBe('EN_DEPOSITO');
    expect(u.esPendiente).toBe(true);
  });

  it.each<CondicionStock>(['NUEVO', 'USADO'])(
    'ENTREGADA vuelve a EN_DEPOSITO en la condición elegida (%s)',
    (condicion) => {
      const u = unidad('ENTREGADA', { condicion: condicion === 'NUEVO' ? 'USADO' : 'NUEVO' });

      expect(u.devolverEntrega(condicion).isOk()).toBe(true);
      expect(u.condicion).toBe(condicion);
    },
  );

  it.each<CondicionStock>(['NUEVO', 'USADO'])(
    'DESCARTADA se recupera a EN_DEPOSITO en la condición elegida (%s)',
    (condicion) => {
      const u = unidad('DESCARTADA');

      expect(u.recuperar(condicion).isOk()).toBe(true);
      expect(u.condicion).toBe(condicion);
    },
  );

  it('devolverAlDeposito deja la unidad USADO aunque hubiera entrado NUEVO', () => {
    const u = unidad('INSTALADA', { condicion: 'NUEVO' });

    u.devolverAlDeposito();

    expect(u.condicion).toBe('USADO');
  });

  it('instalar fija el equipo y salir de INSTALADA lo borra (espeja el CHECK estado/equipo)', () => {
    const u = unidad('EN_DEPOSITO');

    u.instalar('equipo-9');
    expect(u.equipoId).toBe('equipo-9');

    u.descartarInstalada();
    expect(u.equipoId).toBeNull();

    u.reinstalar('equipo-7');
    expect(u.equipoId).toBe('equipo-7');

    u.descartarInstalada();
    u.recuperar('NUEVO');
    expect(u.equipoId).toBeNull();
    expect(u.estado).toBe('EN_DEPOSITO');
  });

  it('una transición válida actualiza updatedAt y una inválida no', () => {
    const u = unidad('EN_DEPOSITO');
    const antes = u.updatedAt;

    u.devolverEntrega('NUEVO');
    expect(u.updatedAt).toEqual(antes);

    u.entregar();
    expect(u.updatedAt.getTime()).toBeGreaterThan(antes.getTime());
  });
});

describe('UnidadInsumoEntity.cargarSerial', () => {
  it('carga el serial de una pendiente EN_DEPOSITO y la deja disponible', () => {
    const u = unidad('EN_DEPOSITO', { pendiente: true });

    const r = u.cargarSerial('  ab 12 ');

    expect(r.isOk()).toBe(true);
    expect(u.numeroSerie).toBe('ab 12');
    expect(u.numeroSerieNormalizado).toBe('AB12');
    expect(u.esPendiente).toBe(false);
    expect(u.entregar().isOk()).toBe(true);
  });

  it.each<EstadoUnidadInsumo>(['INSTALADA', 'ENTREGADA', 'DESCARTADA'])(
    'solo acepta EN_DEPOSITO: sobre una unidad %s falla y no cambia el serial',
    (estado) => {
      const u = unidad(estado, { pendiente: estado === 'DESCARTADA' });

      const r = u.cargarSerial('NUEVO-SN');

      expect(r.getError()).toBeInstanceOf(UnidadNoDisponibleError);
      expect(u.numeroSerie).toBe(estado === 'DESCARTADA' ? null : 'sn 001');
    },
  );

  it('una pendiente descartada queda sin serial para siempre', () => {
    const u = unidad('EN_DEPOSITO', { pendiente: true });
    u.descartarDeDeposito();

    expect(u.cargarSerial('X1').isFail()).toBe(true);
    expect(u.esPendiente).toBe(true);
  });

  it('sobre una unidad que ya tiene serial falla: se corrige, no se carga', () => {
    const u = unidad('EN_DEPOSITO');

    expect(u.cargarSerial('OTRO').getError()).toBeInstanceOf(UnidadNoDisponibleError);
    expect(u.numeroSerie).toBe('sn 001');
  });

  it('un serial vacío tras normalizar falla con SerialRequeridoError y la deja pendiente', () => {
    const u = unidad('EN_DEPOSITO', { pendiente: true });

    expect(u.cargarSerial('  ').getError()).toBeInstanceOf(SerialRequeridoError);
    expect(u.esPendiente).toBe(true);
  });

  it('rechaza un serial cuya forma normalizada excede el largo máximo (ß)', () => {
    const u = unidad('EN_DEPOSITO', { pendiente: true });

    expect(() => u.cargarSerial('ß'.repeat(128))).toThrow(/excede 255/);
    expect(u.esPendiente).toBe(true);
  });
});

describe('UnidadInsumoEntity.corregirSerial', () => {
  it.each<EstadoUnidadInsumo>(['EN_DEPOSITO', 'INSTALADA', 'ENTREGADA', 'DESCARTADA'])(
    'corrige el serial de una unidad %s y devuelve el anterior',
    (estado) => {
      const u = unidad(estado);

      const r = u.corregirSerial(' nuevo 9 ');

      expect(r.getValue()).toBe('sn 001');
      expect(u.numeroSerie).toBe('nuevo 9');
      expect(u.numeroSerieNormalizado).toBe('NUEVO9');
      expect(u.estado).toBe(estado);
    },
  );

  it('sobre una pendiente falla: el serial se carga, no se corrige', () => {
    const u = unidad('EN_DEPOSITO', { pendiente: true });

    expect(u.corregirSerial('X').getError()).toBeInstanceOf(UnidadNoDisponibleError);
    expect(u.esPendiente).toBe(true);
  });

  it('un serial nuevo vacío falla y deja el serial anterior', () => {
    const u = unidad('EN_DEPOSITO');

    expect(u.corregirSerial('   ').getError()).toBeInstanceOf(SerialRequeridoError);
    expect(u.numeroSerie).toBe('sn 001');
  });
});
