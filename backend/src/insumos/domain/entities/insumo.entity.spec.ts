import { describe, expect, it } from 'vitest';
import { SeguimientoNoModificableError } from '../errors/unidades-insumo.errors';
import { CompatibilidadModelo, crearCompatibilidadModelo } from './compatibilidad-modelo';
import {
  InsumoCodigoAlternativoEntity,
  InsumoCodigoAlternativoProps,
} from './insumo-codigo-alternativo.entity';
import {
  InsumoEntity,
  CrearInsumoProps,
  INSUMO_CODIGOS_ALTERNATIVOS_MAX,
  INSUMO_COMPATIBILIDAD_MAX,
  INSUMO_CODIGO_MAX_LENGTH,
  INSUMO_NOMBRE_MAX_LENGTH,
  INSUMO_STOCK_MINIMO_MAXIMO,
  normalizarCodigoInsumo,
  normalizarNombreInsumo,
} from './insumo.entity';

/** Props válidas mínimas; cada test pisa solo el campo que está ejercitando. */
function propsBase(parciales: Partial<CrearInsumoProps> = {}): CrearInsumoProps {
  return {
    codigo: 'TON-001',
    nombre: 'Tóner negro',
    familiaId: 'id-familia',
    unidadMedidaId: 'id-unidad',
    stockMinimo: null,
    activo: true,
    codigosAlternativos: [],
    compatibilidad: [],
    ...parciales,
  };
}

function compatibilidadModelo(
  props: { modeloEquipoId?: string; rol?: string | null } = {},
): CompatibilidadModelo {
  return crearCompatibilidadModelo({
    modeloEquipoId: 'id-modelo',
    rol: 'NEGRO',
    ...props,
  });
}

function codigoAlternativo(
  props: Partial<InsumoCodigoAlternativoProps> = {},
): InsumoCodigoAlternativoEntity {
  return InsumoCodigoAlternativoEntity.create({
    codigo: 'CE285A',
    fabricante: 'HP',
    ...props,
  });
}

/**
 * `readonly` es una promesa del compilador, no del runtime: un array marcado
 * así se puede mutar igual desde JavaScript. Este helper entra por esa puerta
 * —con chequeo de tipo, sin cast a ciegas— para probar que la defensa de la
 * entidad es una copia real y no solo una anotación de tipos.
 */
function mutarPorLaViaDinamica(lista: readonly unknown[]): void {
  if (!Array.isArray(lista)) {
    throw new Error('mutarPorLaViaDinamica: se esperaba un array.');
  }
  lista.push('intruso');
  lista.shift();
}

describe('normalizarCodigoInsumo()', () => {
  it('recorta espacios y pasa a mayúscula', () => {
    expect(normalizarCodigoInsumo('  ton-001  ')).toBe('TON-001');
  });

  /**
   * `toUpperCase()` puede AGRANDAR el string: el tope de la columna se mide
   * DESPUÉS de normalizar, nunca sobre lo que tipeó el usuario.
   */
  it('puede agrandar el string — la ß se expande a dos caracteres', () => {
    expect(normalizarCodigoInsumo('ß')).toHaveLength(2);
  });
});

/**
 * El `nombre` NO se grita: es la descripción que lee una persona en el
 * listado, y "TÓNER NEGRO HP 85A" no es como nadie lo escribe ni lo busca.
 */
describe('normalizarNombreInsumo()', () => {
  it('recorta los espacios de borde SIN tocar mayúsculas y minúsculas', () => {
    expect(normalizarNombreInsumo('  Tóner negro HP 85A  ')).toBe('Tóner negro HP 85A');
  });

  /**
   * Un nombre de solo espacios queda en cadena vacía, que es lo que el
   * `@MinLength(1)` del borde sabe rechazar. Si el recorte corriera DESPUÉS
   * del mínimo, `'   '` pasaría la validación y se persistiría un insumo sin
   * nombre visible.
   */
  it('deja en cadena vacía un nombre de solo espacios', () => {
    expect(normalizarNombreInsumo('   ')).toBe('');
  });
});

/**
 * El dominio es la AUTORIDAD del largo del `codigo`; el `VarChar(50)` de
 * `insumos` es backstop. Se mide SOLO en `create()`: desde el issue #166
 * `actualizar()` ni siquiera acepta un `codigo` en su tipo, así que no hay
 * segundo guard que sincronizar con este.
 */
describe('InsumoEntity create() — precondición de largo de codigo', () => {
  it('lanza si codigo excede el tope de la columna', () => {
    expect(() =>
      InsumoEntity.create(propsBase({ codigo: 'A'.repeat(INSUMO_CODIGO_MAX_LENGTH + 1) })),
    ).toThrow(/codigo excede/);
  });

  it('acepta codigo en el tope exacto (límite inclusive)', () => {
    expect(() =>
      InsumoEntity.create(propsBase({ codigo: 'A'.repeat(INSUMO_CODIGO_MAX_LENGTH) })),
    ).not.toThrow();
  });
});

/**
 * El guard de largo del `nombre` sí corre en los dos: `create()` Y
 * `actualizar()` lo aceptan, y sin el par, borrar uno solo no pone nada en
 * rojo.
 */
describe.each([
  ['create()', (nombre: string) => (): unknown => InsumoEntity.create(propsBase({ nombre }))],
  [
    'actualizar()',
    (nombre: string) => (): unknown => InsumoEntity.create(propsBase()).actualizar({ nombre }),
  ],
])('InsumoEntity %s — precondición de largo de nombre', (_caso, construir) => {
  it('lanza si nombre excede el tope de la columna', () => {
    expect(construir('N'.repeat(INSUMO_NOMBRE_MAX_LENGTH + 1))).toThrow(/nombre excede/);
  });

  it('acepta nombre en el tope exacto (límite inclusive)', () => {
    expect(construir('N'.repeat(INSUMO_NOMBRE_MAX_LENGTH))).not.toThrow();
  });
});

/**
 * `stock_minimo` es `DECIMAL(10,2) NULL` con `CHECK (>= 0)`. El guard del
 * dominio es más rico que ese CHECK a propósito, y cada rechazo se verifica
 * por SU mensaje: con un `toThrow()` pelado, un guard equivocado dejaría el
 * test verde y el otro guard podría no existir.
 *
 * Se recorren `create()` y `actualizar()` porque el guard está invocado en
 * los dos.
 */
describe.each([
  [
    'create()',
    (stockMinimo: number) => (): unknown => InsumoEntity.create(propsBase({ stockMinimo })),
  ],
  [
    'actualizar()',
    (stockMinimo: number) => (): unknown =>
      InsumoEntity.create(propsBase()).actualizar({ stockMinimo }),
  ],
])('InsumoEntity %s — precondición de stockMinimo', (_caso, construir) => {
  it('rechaza un stock mínimo negativo, nombrando el signo', () => {
    expect(construir(-0.01)).toThrow(/stockMinimo no puede ser negativo/);
  });

  it('acepta cero — un insumo sin punto de reposición definido en cero es válido', () => {
    expect(construir(0)).not.toThrow();
  });

  it('rechaza por encima del techo de negocio, nombrando el techo', () => {
    expect(construir(INSUMO_STOCK_MINIMO_MAXIMO + 1)).toThrow(/excede el techo de negocio/);
  });

  it('acepta el techo de negocio exacto (límite inclusive)', () => {
    expect(construir(INSUMO_STOCK_MINIMO_MAXIMO)).not.toThrow();
  });

  /**
   * El caso que la base NO atrapa: Postgres no falla ante `0.005` en un
   * `DECIMAL(10,2)`, lo REDONDEA en silencio. El usuario guarda una cosa y le
   * queda otra. El dominio es el único lugar donde eso se puede frenar.
   */
  it('rechaza más de dos decimales, nombrando la escala', () => {
    expect(construir(0.005)).toThrow(/stockMinimo admite como máximo 2 decimales/);
  });

  it('acepta exactamente dos decimales (caso hermano del rechazo por escala)', () => {
    expect(construir(10.25)).not.toThrow();
  });

  /**
   * `NaN` e `Infinity` no caen en ninguno de los guards de rango —`NaN < 0`
   * es `false`— así que necesitan el suyo, y con su propio mensaje: decirle
   * "excede el techo" a un `NaN` describe mal lo que pasó.
   */
  it('rechaza NaN por no ser un número finito', () => {
    expect(construir(Number.NaN)).toThrow(/stockMinimo debe ser un número finito/);
  });

  it('rechaza Infinity por no ser un número finito', () => {
    expect(construir(Number.POSITIVE_INFINITY)).toThrow(/stockMinimo debe ser un número finito/);
  });
});

describe('InsumoEntity', () => {
  describe('create()', () => {
    it('expone los campos recibidos', () => {
      const insumo = InsumoEntity.create(
        propsBase({ nombre: 'Tóner negro HP 85A', stockMinimo: 5 }),
      );

      expect(insumo.codigo).toBe('TON-001');
      expect(insumo.nombre).toBe('Tóner negro HP 85A');
      expect(insumo.familiaId).toBe('id-familia');
      expect(insumo.unidadMedidaId).toBe('id-unidad');
      expect(insumo.stockMinimo).toBe(5);
      expect(insumo.activo).toBe(true);
      expect(insumo.isDeleted()).toBe(false);
    });

    it('acepta stockMinimo null — el punto de reposición es opcional', () => {
      expect(InsumoEntity.create(propsBase({ stockMinimo: null })).stockMinimo).toBeNull();
    });

    it('usa el id explícito cuando se lo pasan', () => {
      expect(InsumoEntity.create(propsBase(), 'id-fijo').id).toBe('id-fijo');
    });
  });

  describe('reconstitute()', () => {
    it('reconstituye desde persistencia preservando id y timestamps', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const insumo = InsumoEntity.reconstitute(
        propsBase({ activo: false }),
        'id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(insumo.id).toBe('id-fijo');
      expect(insumo.createdAt).toEqual(createdAt);
      expect(insumo.updatedAt).toEqual(updatedAt);
      expect(insumo.activo).toBe(false);
      expect(insumo.deletedAt).toBeNull();
    });

    /**
     * Una fila histórica fuera del rango actual se LEE, no explota: hacer caer
     * una lectura por un dato viejo convierte un valor legado en una caída de
     * sistema. El valor elegido es uno que `create()` rechaza por escala.
     */
    it('no aplica las precondiciones sobre una fila ya persistida', () => {
      const fueraDeRango = propsBase({
        codigo: 'A'.repeat(INSUMO_CODIGO_MAX_LENGTH + 10),
        stockMinimo: 0.005,
      });

      expect(() => InsumoEntity.create(fueraDeRango)).toThrow();
      expect(() =>
        InsumoEntity.reconstitute(fueraDeRango, 'id-legado', new Date(), new Date(), null),
      ).not.toThrow();
    });
  });

  describe('actualizar() — PATCH semántico', () => {
    it('actualiza solo los campos provistos, deja el resto intacto', () => {
      const insumo = InsumoEntity.create(propsBase({ stockMinimo: 5 }));

      insumo.actualizar({ nombre: 'Tóner negro reemplazo' });

      expect(insumo.nombre).toBe('Tóner negro reemplazo');
      expect(insumo.codigo).toBe('TON-001');
      expect(insumo.familiaId).toBe('id-familia');
      expect(insumo.unidadMedidaId).toBe('id-unidad');
      expect(insumo.stockMinimo).toBe(5);
    });

    /**
     * Issue #166: el `codigo` no está en el TIPO de `actualizar()`, así que
     * ningún caller tipado puede pasarlo. Este test cubre al que no lo está
     * —un script, un `any` colado— con un cast defensivo: aunque alguien
     * fuerce un `codigo` por fuera del tipo, el método no lo lee ni lo
     * persiste, porque su cuerpo ya no tiene ninguna rama que toque
     * `this.props.codigo`.
     */
    it('ignora un codigo colado por fuera del tipo — el codigo no es editable ni forzando el cast', () => {
      const insumo = InsumoEntity.create(propsBase());

      (insumo.actualizar as (datos: { codigo?: string; nombre?: string }) => void)({
        codigo: 'HACKEADO',
        nombre: 'Nombre nuevo',
      });

      expect(insumo.codigo).toBe('TON-001');
      expect(insumo.nombre).toBe('Nombre nuevo');
    });

    it('reasigna familia y unidad de medida cuando se proveen', () => {
      const insumo = InsumoEntity.create(propsBase());

      insumo.actualizar({ familiaId: 'otra-familia', unidadMedidaId: 'otra-unidad' });

      expect(insumo.familiaId).toBe('otra-familia');
      expect(insumo.unidadMedidaId).toBe('otra-unidad');
    });

    /**
     * El par que distingue "sin cambio" de "poné vacío". `undefined` es el
     * campo ausente del PATCH y NO toca el dato; `null` es la orden explícita
     * de borrar el punto de reposición. Confundirlos es pérdida de datos: un
     * insumo que tenía stock mínimo 5 lo perdería en cada edición del nombre.
     */
    it('deja el stockMinimo intacto cuando llega undefined', () => {
      const insumo = InsumoEntity.create(propsBase({ stockMinimo: 5 }));

      insumo.actualizar({ stockMinimo: undefined });

      expect(insumo.stockMinimo).toBe(5);
    });

    it('borra el stockMinimo cuando llega null explícito', () => {
      const insumo = InsumoEntity.create(propsBase({ stockMinimo: 5 }));

      insumo.actualizar({ stockMinimo: null });

      expect(insumo.stockMinimo).toBeNull();
    });

    it('carga un stockMinimo donde no había ninguno', () => {
      const insumo = InsumoEntity.create(propsBase({ stockMinimo: null }));

      insumo.actualizar({ stockMinimo: 2.5 });

      expect(insumo.stockMinimo).toBe(2.5);
    });
  });

  describe('codigosAlternativos', () => {
    it('expone los códigos alternativos recibidos', () => {
      const insumo = InsumoEntity.create(propsBase({ codigosAlternativos: [codigoAlternativo()] }));

      expect(insumo.codigosAlternativos).toHaveLength(1);
      expect(insumo.codigosAlternativos[0].codigo).toBe('CE285A');
    });

    /**
     * Copia defensiva: sin ella, quien lea la lista puede agregarle o sacarle
     * elementos y la próxima escritura del agregado persistiría esa mutación
     * que nadie pidió.
     */
    it('devuelve una copia — mutar lo devuelto no cambia la entidad', () => {
      const insumo = InsumoEntity.create(propsBase({ codigosAlternativos: [codigoAlternativo()] }));

      mutarPorLaViaDinamica(insumo.codigosAlternativos);

      expect(insumo.codigosAlternativos).toHaveLength(1);
      expect(insumo.codigosAlternativos[0].codigo).toBe('CE285A');
    });
  });

  describe('reemplazarCodigosAlternativos()', () => {
    /**
     * La lista que llega en el PATCH REEMPLAZA a la guardada: el borde manda
     * siempre la lista completa, así que un código que no viene es un código
     * que el usuario sacó.
     */
    it('reemplaza la lista completa, no la fusiona', () => {
      const insumo = InsumoEntity.create(
        propsBase({ codigosAlternativos: [codigoAlternativo({ codigo: 'VIEJO' })] }),
      );

      insumo.reemplazarCodigosAlternativos([codigoAlternativo({ codigo: 'NUEVO' })]);

      expect(insumo.codigosAlternativos).toHaveLength(1);
      expect(insumo.codigosAlternativos[0].codigo).toBe('NUEVO');
    });

    it('acepta la lista vacía — sacar todos los códigos alternativos es válido', () => {
      const insumo = InsumoEntity.create(propsBase({ codigosAlternativos: [codigoAlternativo()] }));

      insumo.reemplazarCodigosAlternativos([]);

      expect(insumo.codigosAlternativos).toHaveLength(0);
    });

    it('copia el array recibido — mutarlo después no cambia la entidad', () => {
      const insumo = InsumoEntity.create(propsBase());
      const entrantes = [codigoAlternativo()];

      insumo.reemplazarCodigosAlternativos(entrantes);
      entrantes.push(codigoAlternativo({ codigo: 'INTRUSO' }));

      expect(insumo.codigosAlternativos).toHaveLength(1);
    });
  });

  /**
   * El techo no lo pide ninguna columna: lo pide el costo de guardar. El
   * agregado se persiste con una escritura anidada por código dentro de una
   * sola transacción, así que una lista sin techo la sostiene abierta sobre la
   * base del inquilino tantas idas y vueltas como códigos hayan entrado.
   *
   * El guard vive acá además de en el DTO porque el borde no es el único
   * camino: un script de importación o una semilla construyen la entidad
   * directo.
   */
  describe('techo de códigos alternativos', () => {
    /**
     * El mensaje se arma desde la constante, no con el número escrito a mano:
     * si el techo cambia, el test tiene que seguir midiendo la CONDUCTA
     * —rechazar por encima del límite— y no ponerse rojo por el texto.
     */
    function mensajeDelTecho(): RegExp {
      return new RegExp(`máximo ${INSUMO_CODIGOS_ALTERNATIVOS_MAX} códigos alternativos`);
    }

    function listaDe(cantidad: number): InsumoCodigoAlternativoEntity[] {
      return Array.from({ length: cantidad }, (_valor, indice) =>
        codigoAlternativo({ codigo: `ALT-${indice}` }),
      );
    }

    it('create() rechaza por encima del techo, nombrando el límite', () => {
      expect(() =>
        InsumoEntity.create(
          propsBase({ codigosAlternativos: listaDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1) }),
        ),
      ).toThrow(mensajeDelTecho());
    });

    it('create() acepta el techo exacto (límite inclusive)', () => {
      expect(() =>
        InsumoEntity.create(
          propsBase({ codigosAlternativos: listaDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX) }),
        ),
      ).not.toThrow();
    });

    /**
     * El hermano de `create()`: sin este caso, el techo se podría poner solo
     * en el alta y la edición seguiría abriendo la transacción larga, que es
     * el camino más probable — a un insumo se le agregan códigos con el
     * tiempo.
     */
    it('reemplazarCodigosAlternativos() rechaza por encima del techo', () => {
      const insumo = InsumoEntity.create(propsBase());

      expect(() =>
        insumo.reemplazarCodigosAlternativos(listaDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1)),
      ).toThrow(mensajeDelTecho());
    });

    it('reemplazarCodigosAlternativos() acepta el techo exacto', () => {
      const insumo = InsumoEntity.create(propsBase());

      expect(() =>
        insumo.reemplazarCodigosAlternativos(listaDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX)),
      ).not.toThrow();
      expect(insumo.codigosAlternativos).toHaveLength(INSUMO_CODIGOS_ALTERNATIVOS_MAX);
    });

    it('reconstitute() no aplica el techo — una fila histórica se lee, no explota', () => {
      expect(() =>
        InsumoEntity.reconstitute(
          propsBase({ codigosAlternativos: listaDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1) }),
          'id-legado',
          new Date(),
          new Date(),
          null,
        ),
      ).not.toThrow();
    });
  });

  /**
   * La compatibilidad viaja DENTRO del agregado, igual que los códigos
   * alternativos: la fila de `insumos_modelos_equipo` no tiene identidad propia
   * —su clave primaria es el par— ni endpoints propios, y el alta y la edición
   * mandan siempre la lista completa.
   */
  describe('compatibilidad', () => {
    it('expone la compatibilidad recibida', () => {
      const insumo = InsumoEntity.create(propsBase({ compatibilidad: [compatibilidadModelo()] }));

      expect(insumo.compatibilidad).toHaveLength(1);
      expect(insumo.compatibilidad[0].modeloEquipoId).toBe('id-modelo');
      expect(insumo.compatibilidad[0].rol).toBe('NEGRO');
    });

    /**
     * Copia defensiva, mismo motivo que en los códigos alternativos: sin ella,
     * quien lea la lista puede agregarle o sacarle elementos y la próxima
     * escritura del agregado persistiría esa mutación que nadie pidió.
     */
    it('devuelve una copia — mutar lo devuelto no cambia la entidad', () => {
      const insumo = InsumoEntity.create(propsBase({ compatibilidad: [compatibilidadModelo()] }));

      mutarPorLaViaDinamica(insumo.compatibilidad);

      expect(insumo.compatibilidad).toHaveLength(1);
      expect(insumo.compatibilidad[0].modeloEquipoId).toBe('id-modelo');
    });
  });

  describe('reemplazarCompatibilidad()', () => {
    /**
     * La lista que llega en el PATCH REEMPLAZA a la guardada: el borde manda
     * siempre la lista completa, así que un modelo que no viene es un modelo
     * que el usuario sacó. Si fusionara, quitar una compatibilidad sería
     * imposible desde la API.
     */
    it('reemplaza la lista completa, no la fusiona', () => {
      const insumo = InsumoEntity.create(
        propsBase({ compatibilidad: [compatibilidadModelo({ modeloEquipoId: 'modelo-viejo' })] }),
      );

      insumo.reemplazarCompatibilidad([compatibilidadModelo({ modeloEquipoId: 'modelo-nuevo' })]);

      expect(insumo.compatibilidad).toHaveLength(1);
      expect(insumo.compatibilidad[0].modeloEquipoId).toBe('modelo-nuevo');
    });

    it('acepta la lista vacía — sacar todas las compatibilidades es válido', () => {
      const insumo = InsumoEntity.create(propsBase({ compatibilidad: [compatibilidadModelo()] }));

      insumo.reemplazarCompatibilidad([]);

      expect(insumo.compatibilidad).toHaveLength(0);
    });

    it('copia el array recibido — mutarlo después no cambia la entidad', () => {
      const insumo = InsumoEntity.create(propsBase());
      const entrantes = [compatibilidadModelo()];

      insumo.reemplazarCompatibilidad(entrantes);
      entrantes.push(compatibilidadModelo({ modeloEquipoId: 'intruso' }));

      expect(insumo.compatibilidad).toHaveLength(1);
    });
  });

  /**
   * Mismo motivo que el techo de códigos alternativos: no lo pide ninguna
   * columna, lo pide el costo de guardar. El agregado se persiste con una
   * escritura anidada por fila dentro de una sola transacción, así que una
   * lista sin techo la sostiene abierta sobre la base del inquilino tantas idas
   * y vueltas como modelos hayan entrado.
   */
  describe('techo de compatibilidad', () => {
    /**
     * El mensaje se arma desde la constante, no con el número escrito a mano:
     * si el techo cambia, el test tiene que seguir midiendo la CONDUCTA
     * —rechazar por encima del límite— y no ponerse rojo por el texto.
     */
    function mensajeDelTecho(): RegExp {
      return new RegExp(`máximo ${INSUMO_COMPATIBILIDAD_MAX} modelos de equipo compatibles`);
    }

    function listaDe(cantidad: number): CompatibilidadModelo[] {
      return Array.from({ length: cantidad }, (_valor, indice) =>
        compatibilidadModelo({ modeloEquipoId: `modelo-${indice}` }),
      );
    }

    it('create() rechaza por encima del techo, nombrando el límite', () => {
      expect(() =>
        InsumoEntity.create(propsBase({ compatibilidad: listaDe(INSUMO_COMPATIBILIDAD_MAX + 1) })),
      ).toThrow(mensajeDelTecho());
    });

    it('create() acepta el techo exacto (límite inclusive)', () => {
      expect(() =>
        InsumoEntity.create(propsBase({ compatibilidad: listaDe(INSUMO_COMPATIBILIDAD_MAX) })),
      ).not.toThrow();
    });

    /**
     * El hermano de `create()`: sin este caso, el techo se podría poner solo en
     * el alta y la edición quedaría abierta, que es el camino más probable — a
     * un insumo genérico se le van sumando modelos con el tiempo.
     */
    it('reemplazarCompatibilidad() rechaza por encima del techo', () => {
      const insumo = InsumoEntity.create(propsBase());

      expect(() => insumo.reemplazarCompatibilidad(listaDe(INSUMO_COMPATIBILIDAD_MAX + 1))).toThrow(
        mensajeDelTecho(),
      );
    });

    it('reemplazarCompatibilidad() acepta el techo exacto', () => {
      const insumo = InsumoEntity.create(propsBase());

      expect(() =>
        insumo.reemplazarCompatibilidad(listaDe(INSUMO_COMPATIBILIDAD_MAX)),
      ).not.toThrow();
      expect(insumo.compatibilidad).toHaveLength(INSUMO_COMPATIBILIDAD_MAX);
    });

    it('reconstitute() no aplica el techo — una fila histórica se lee, no explota', () => {
      expect(() =>
        InsumoEntity.reconstitute(
          propsBase({ compatibilidad: listaDe(INSUMO_COMPATIBILIDAD_MAX + 1) }),
          'id-legado',
          new Date(),
          new Date(),
          null,
        ),
      ).not.toThrow();
    });
  });

  describe('desactivar() / activar()', () => {
    /**
     * Dar de baja es DESHABILITAR, no eliminar. Si `desactivar()` marcara
     * `deletedAt`, el listado —que filtra por `deletedAt: null`— haría
     * desaparecer la fila de la única pantalla que existe, y `activar()`
     * quedaría inalcanzable: nadie podría conseguir el id para reactivarla.
     * Es la decisión de producto de los catálogos hermanos, no un detalle.
     */
    it('desactivar() apaga activo y NO marca la baja lógica', () => {
      const insumo = InsumoEntity.create(propsBase());

      insumo.desactivar();

      expect(insumo.activo).toBe(false);
      expect(insumo.deletedAt).toBeNull();
      expect(insumo.isDeleted()).toBe(false);
    });

    it('activar() vuelve a encender activo (caso hermano de desactivar)', () => {
      const insumo = InsumoEntity.create(propsBase());
      insumo.desactivar();

      insumo.activar();

      expect(insumo.activo).toBe(true);
      expect(insumo.isDeleted()).toBe(false);
    });
  });
});

describe('InsumoEntity — seguimiento', () => {
  it('un insumo NINGUNO no cambia: create() sin seguimiento queda NINGUNO', () => {
    const insumo = InsumoEntity.create(propsBase());

    expect(insumo.seguimiento).toBe('NINGUNO');
  });

  it('create() acepta seguimiento SERIE explícito', () => {
    expect(InsumoEntity.create(propsBase({ seguimiento: 'SERIE' })).seguimiento).toBe('SERIE');
  });

  it('reconstitute() conserva el seguimiento y lo lee NINGUNO si falta', () => {
    const fecha = new Date('2026-01-01');
    const serie = InsumoEntity.reconstitute(
      propsBase({ seguimiento: 'SERIE' }),
      'i-1',
      fecha,
      fecha,
      null,
    );
    const sin = InsumoEntity.reconstitute(propsBase(), 'i-2', fecha, fecha, null);

    expect(serie.seguimiento).toBe('SERIE');
    expect(sin.seguimiento).toBe('NINGUNO');
  });

  it('actualizar() no toca el seguimiento: solo lo cambia el caso de uso de activación', () => {
    const insumo = InsumoEntity.create(propsBase({ seguimiento: 'SERIE' }));

    insumo.actualizar({ nombre: 'Otro nombre', unidadMedidaId: 'otra' });

    expect(insumo.seguimiento).toBe('SERIE');
  });
});

describe('InsumoEntity.puedeCambiarSeguimiento()', () => {
  const conteos = {
    saldoTotal: 0,
    unidadesEnDeposito: 0,
    unidadesInstaladas: 0,
    unidadMedidaEntera: true,
  };

  describe('NINGUNO → SERIE', () => {
    const insumo = () => InsumoEntity.create(propsBase());

    it('se permite con saldo cero y unidad de medida entera', () => {
      expect(insumo().puedeCambiarSeguimiento('SERIE', conteos).isOk()).toBe(true);
    });

    it('se rechaza con saldo distinto de cero y nombra el saldo', () => {
      const r = insumo().puedeCambiarSeguimiento('SERIE', { ...conteos, saldoTotal: 5 });

      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      expect(r.getError().message).toContain('5');
    });

    it('se rechaza con saldo negativo: no es cero', () => {
      expect(
        insumo()
          .puedeCambiarSeguimiento('SERIE', { ...conteos, saldoTotal: -1 })
          .isFail(),
      ).toBe(true);
    });

    it('se rechaza con unidad de medida no entera', () => {
      const r = insumo().puedeCambiarSeguimiento('SERIE', {
        ...conteos,
        unidadMedidaEntera: false,
      });

      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
      expect(r.getError().message).toContain('entera');
    });

    it('ignora los conteos de unidades: no le aplican a esta dirección', () => {
      const r = insumo().puedeCambiarSeguimiento('SERIE', {
        ...conteos,
        unidadesEnDeposito: 3,
        unidadesInstaladas: 2,
      });

      expect(r.isOk()).toBe(true);
    });
  });

  describe('SERIE → NINGUNO', () => {
    const insumo = () => InsumoEntity.create(propsBase({ seguimiento: 'SERIE' }));

    it('se permite sin unidades EN_DEPOSITO ni INSTALADA (ENTREGADA y DESCARTADA no cuentan)', () => {
      expect(insumo().puedeCambiarSeguimiento('NINGUNO', conteos).isOk()).toBe(true);
    });

    it('se rechaza con unidades EN_DEPOSITO', () => {
      const r = insumo().puedeCambiarSeguimiento('NINGUNO', { ...conteos, unidadesEnDeposito: 2 });

      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
    });

    it('se rechaza con unidades INSTALADA', () => {
      const r = insumo().puedeCambiarSeguimiento('NINGUNO', { ...conteos, unidadesInstaladas: 1 });

      expect(r.getError()).toBeInstanceOf(SeguimientoNoModificableError);
    });

    it('ignora el saldo y la unidad de medida: no le aplican a esta dirección', () => {
      const r = insumo().puedeCambiarSeguimiento('NINGUNO', {
        ...conteos,
        saldoTotal: 9,
        unidadMedidaEntera: false,
      });

      expect(r.isOk()).toBe(true);
    });
  });

  it('pedir el seguimiento que ya tiene es un no-op válido, aun con conteos que lo impedirían', () => {
    const serie = InsumoEntity.create(propsBase({ seguimiento: 'SERIE' }));
    const ninguno = InsumoEntity.create(propsBase());
    const ocupado = {
      saldoTotal: 4,
      unidadesEnDeposito: 4,
      unidadesInstaladas: 1,
      unidadMedidaEntera: false,
    };

    expect(serie.puedeCambiarSeguimiento('SERIE', ocupado).isOk()).toBe(true);
    expect(ninguno.puedeCambiarSeguimiento('NINGUNO', ocupado).isOk()).toBe(true);
  });

  it('es pura: no cambia el seguimiento de la entidad', () => {
    const insumo = InsumoEntity.create(propsBase());

    insumo.puedeCambiarSeguimiento('SERIE', conteos);

    expect(insumo.seguimiento).toBe('NINGUNO');
  });
});
