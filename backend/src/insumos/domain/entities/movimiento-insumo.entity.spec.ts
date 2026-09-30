import { describe, expect, it } from 'vitest';
import { MotivoAjusteRequeridoError } from '../errors/insumos.errors';
import {
  CrearMovimientoInsumoProps,
  MovimientoInsumoEntity,
  MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES,
  MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
  MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
  normalizarMotivoMovimiento,
} from './movimiento-insumo.entity';
import {
  CONDICION_STOCK_POR_DEFECTO,
  esAjuste,
  TIPOS_AJUSTE_INSUMO,
  TIPOS_MOVIMIENTO_INSUMO,
} from './tipo-movimiento-insumo';

/**
 * Los tipos que NO exigen motivo, derivados del catálogo con el mismo type
 * guard que usa la entidad. Enumerarlos a mano sería fijar el catálogo de hoy:
 * así, un tipo nuevo entra a los casos hermanos invertidos por su cuenta.
 */
const TIPOS_SIN_MOTIVO_OBLIGATORIO = TIPOS_MOVIMIENTO_INSUMO.filter((tipo) => !esAjuste(tipo));

/** Props válidas mínimas; cada test pisa solo el campo que está ejercitando. */
function propsBase(
  parciales: Partial<CrearMovimientoInsumoProps> = {},
): CrearMovimientoInsumoProps {
  return {
    insumoId: 'id-insumo',
    tipo: 'ENTRADA',
    cantidad: 10,
    usuarioId: 'id-usuario',
    ...parciales,
  };
}

/** Construye la entidad y extrae el valor; falla ruidosamente si el caso era un `Result.fail`. */
function crear(parciales: Partial<CrearMovimientoInsumoProps> = {}): MovimientoInsumoEntity {
  return MovimientoInsumoEntity.create(propsBase(parciales)).getValue();
}

/**
 * Los mensajes de tope se arman DESDE la constante, nunca con el número
 * escrito a mano: si el tope cambia, el test tiene que seguir midiendo la
 * conducta y no el literal viejo.
 */
function mensajeDelTechoDeCantidad(): RegExp {
  return new RegExp(`cantidad excede el techo de negocio de ${MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA}`);
}

function mensajeDeLaEscala(): RegExp {
  return new RegExp(
    `cantidad admite como máximo ${MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES} decimales`,
  );
}

function mensajeDelTopeDeMotivo(): RegExp {
  return new RegExp(`motivo excede ${MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH} caracteres`);
}

describe('MovimientoInsumoEntity', () => {
  describe('create — campos y trazabilidad', () => {
    it('conserva los campos del movimiento y le da un id y un createdAt propios', () => {
      const movimiento = crear({
        tipo: 'SALIDA',
        cantidad: 3.5,
        motivo: 'Reposición de impresora',
      });

      expect(movimiento.insumoId).toBe('id-insumo');
      expect(movimiento.tipo).toBe('SALIDA');
      expect(movimiento.cantidad).toBe(3.5);
      expect(movimiento.usuarioId).toBe('id-usuario');
      expect(movimiento.motivo).toBe('Reposición de impresora');
      expect(movimiento.id).not.toBe('');
      expect(movimiento.createdAt).toBeInstanceOf(Date);
    });

    // Escenario "Movimiento sin condición explícita": cae en NUEVO.
    it('aplica la condición por defecto NUEVO cuando no se declara ninguna', () => {
      expect(crear().condicion).toBe(CONDICION_STOCK_POR_DEFECTO);
      expect(crear().condicion).toBe('NUEVO');
    });

    it('conserva la condición explícita', () => {
      expect(crear({ condicion: 'USADO' }).condicion).toBe('USADO');
    });

    it('genera un id distinto por movimiento cuando el caller no provee uno', () => {
      expect(crear().id).not.toBe(crear().id);
    });

    it('respeta el id explícito que le pasa el caller', () => {
      const movimiento = MovimientoInsumoEntity.create(propsBase(), 'id-fijo').getValue();

      expect(movimiento.id).toBe('id-fijo');
    });

    /**
     * `equipoId` y `sectorId` son las dos columnas nullables de trazabilidad.
     * Ausentes significan "sin destino registrado", y la entidad las resuelve
     * a `null` para que la fila no distinga entre el campo ausente y el campo
     * nulo — la columna admite un solo vacío.
     */
    it('resuelve la trazabilidad ausente a null, sin dejar undefined', () => {
      const movimiento = crear();

      expect(movimiento.equipoId).toBeNull();
      expect(movimiento.sectorId).toBeNull();
    });

    it('conserva la trazabilidad cuando viene', () => {
      const movimiento = crear({
        tipo: 'SALIDA',
        equipoId: 'id-equipo',
        sectorId: 'id-sector',
      });

      expect(movimiento.equipoId).toBe('id-equipo');
      expect(movimiento.sectorId).toBe('id-sector');
    });

    /**
     * `itemCompraId` es el ORIGEN del asiento, no su destino: dice de qué ítem
     * de compra vino lo que entró. Sin él, "¿de qué compra salió esta entrada?"
     * no tiene respuesta, y la bitácora solo puede decir que alguien cargó una
     * cantidad a mano.
     */
    it('conserva el itemCompraId del ítem de compra que originó el movimiento', () => {
      const movimiento = crear({ tipo: 'ENTRADA', itemCompraId: 'id-item-compra' });

      expect(movimiento.itemCompraId).toBe('id-item-compra');
    });

    /**
     * Caso hermano invertido del de arriba, con el mismo criterio que
     * `equipoId` y `sectorId`: la columna admite un solo vacío, así que el
     * campo ausente y el nulo tienen que colapsar en `null`. Un `undefined`
     * haría mentir a la firma `string | null` y viajaría al INSERT como "no
     * tocar la columna" en vez de como "sin origen".
     */
    it('resuelve el origen ausente a null, sin dejar undefined', () => {
      expect(crear().itemCompraId).toBeNull();
      expect(crear({ itemCompraId: null }).itemCompraId).toBeNull();
    });

    /**
     * El origen no está restringido a la ENTRADA. La devolución al proveedor
     * sería una SALIDA nacida del mismo ítem de compra, y la migración declara
     * la columna nullable para todos los tipos, sin ningún `CHECK` que la ate
     * al tipo: el dominio no inventa una restricción que el diseño descartó a
     * propósito.
     */
    it('acepta origen en cualquier tipo del catálogo, porque la columna no lo ata al tipo', () => {
      for (const tipo of TIPOS_MOVIMIENTO_INSUMO) {
        const movimiento = crear({
          tipo,
          motivo: 'Conteo físico del depósito',
          itemCompraId: 'id-item-compra',
        });

        expect(movimiento.itemCompraId).toBe('id-item-compra');
      }
    });

    /**
     * La trazabilidad NO está restringida al tipo `SALIDA`: una `ENTRADA`
     * puede ser la devolución de un tóner que un sector no usó, y el dato de
     * dónde volvió es justo lo que hace útil la bitácora. La migración las
     * declara nullables para todos los tipos sin ningún `CHECK` que las ate al
     * tipo, y el dominio no inventa una restricción que el diseño no tomó.
     */
    it('acepta trazabilidad también en una ENTRADA, que es la devolución de un sector', () => {
      const movimiento = crear({ tipo: 'ENTRADA', sectorId: 'id-sector' });

      expect(movimiento.tipo).toBe('ENTRADA');
      expect(movimiento.sectorId).toBe('id-sector');
    });

    /**
     * El catálogo se recorre DESDE `TIPOS_MOVIMIENTO_INSUMO` y no con los tres
     * literales escritos a mano: si mañana entra un tipo nuevo, este test lo
     * ejercita solo en vez de quedar mudo sobre él.
     */
    it('acepta todos los tipos del catálogo cerrado', () => {
      for (const tipo of TIPOS_MOVIMIENTO_INSUMO) {
        const movimiento = crear({ tipo, motivo: 'Conteo físico del depósito' });

        expect(movimiento.tipo).toBe(tipo);
      }
    });
  });

  describe('create — precondiciones de la cantidad', () => {
    /**
     * Espeja el `CHECK (cantidad > 0)` de la migración. El dominio es la
     * autoridad y el CHECK el backstop: si el dominio fuera más laxo, el
     * usuario se comería un 500 crudo de Postgres en vez de un mensaje que
     * nombra el campo. Va como `throw` y no como `Result` porque un primitivo
     * fuera de rango llegando a la entidad es una violación de contrato del
     * caller —el borde ya lo rechaza con un 400—, mismo criterio que
     * `InsumoEntity.stockMinimo`.
     */
    it('rechaza la cantidad cero, que no mueve nada y solo ensucia la bitácora', () => {
      expect(() => crear({ cantidad: 0 })).toThrow(/cantidad debe ser mayor a cero/);
    });

    it('rechaza la cantidad negativa: el signo lo da el tipo, no el número', () => {
      expect(() => crear({ cantidad: -5 })).toThrow(/cantidad debe ser mayor a cero/);
    });

    it('acepta la cantidad positiva más chica que la columna representa', () => {
      expect(crear({ cantidad: 0.01 }).cantidad).toBe(0.01);
    });

    /**
     * `NaN` e `Infinity` necesitan su propio guard porque NO caen en las
     * comparaciones de rango —`NaN > 0` es `false` y `NaN > techo` también—, y
     * llegarían a la base como un literal que el driver no sabe escribir.
     * Decirle "debe ser mayor a cero" a un `NaN` describiría mal lo que pasó.
     */
    it('rechaza NaN por no ser un número finito', () => {
      expect(() => crear({ cantidad: Number.NaN })).toThrow(/cantidad debe ser un número finito/);
    });

    it('rechaza Infinity por no ser un número finito', () => {
      expect(() => crear({ cantidad: Number.POSITIVE_INFINITY })).toThrow(
        /cantidad debe ser un número finito/,
      );
    });

    /**
     * El guard que la base NO puede dar: Postgres no falla ante un `0.005` en
     * una columna `DECIMAL(10,2)`, lo REDONDEA en silencio a `0.01`. El
     * usuario guardaría una cosa y le quedaría otra sin ningún error de por
     * medio, y en una bitácora de existencias ese redondeo se acumula
     * movimiento a movimiento sobre el stock.
     */
    it('rechaza más de dos decimales, nombrando la escala', () => {
      expect(() => crear({ cantidad: 0.005 })).toThrow(mensajeDeLaEscala());
    });

    it('acepta exactamente dos decimales (caso hermano del rechazo por escala)', () => {
      expect(crear({ cantidad: 12.34 }).cantidad).toBe(12.34);
    });

    it('rechaza la cantidad que supera el techo de negocio', () => {
      expect(() => crear({ cantidad: MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA + 1 })).toThrow(
        mensajeDelTechoDeCantidad(),
      );
    });

    it('acepta exactamente el techo de negocio (caso hermano del rechazo por techo)', () => {
      expect(crear({ cantidad: MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA }).cantidad).toBe(
        MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
      );
    });
  });

  describe('normalizarMotivoMovimiento', () => {
    it('recorta los espacios de borde y conserva mayúsculas y minúsculas', () => {
      expect(normalizarMotivoMovimiento('  Conteo Físico  ')).toBe('Conteo Físico');
    });

    /**
     * El colapso a `null` es lo que impide que `''` y `NULL` convivan como dos
     * formas de decir "sin motivo": la columna admite las dos, así que sin
     * esta regla el mismo movimiento se leería distinto según por qué camino
     * se cargó. Y es lo que hace que el guard del ajuste exija CONTENIDO y no
     * solo presencia.
     */
    it('colapsa a null el motivo que es solo espacios', () => {
      expect(normalizarMotivoMovimiento('   ')).toBeNull();
    });

    it('colapsa a null el motivo vacío, el nulo y el ausente', () => {
      expect(normalizarMotivoMovimiento('')).toBeNull();
      expect(normalizarMotivoMovimiento(null)).toBeNull();
      expect(normalizarMotivoMovimiento(undefined)).toBeNull();
    });
  });

  describe('create — motivo', () => {
    it('guarda el motivo ya normalizado', () => {
      expect(crear({ motivo: '  Devolución del sector  ' }).motivo).toBe('Devolución del sector');
    });

    it('guarda null cuando el motivo es solo espacios', () => {
      expect(crear({ tipo: 'ENTRADA', motivo: '   ' }).motivo).toBeNull();
    });

    /**
     * La columna es `TEXT`, así que el tope es de NEGOCIO y no de la base: sin
     * él, un campo sin cota deja pegar un documento entero dentro de una
     * bitácora de auditoría que después se muestra fila por fila. El número
     * vive en el dominio para que el DTO del borde lo importe y las dos capas
     * no puedan divergir.
     */
    it('rechaza el motivo que supera el tope de largo', () => {
      expect(() => crear({ motivo: 'x'.repeat(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH + 1) })).toThrow(
        mensajeDelTopeDeMotivo(),
      );
    });

    it('acepta exactamente el tope de largo (caso hermano del rechazo por largo)', () => {
      const motivo = 'x'.repeat(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH);

      expect(crear({ motivo }).motivo).toBe(motivo);
    });

    /**
     * El tope se mide sobre el motivo YA normalizado, no sobre el crudo: el
     * recorte corre antes, así que un motivo que solo se pasa por sus espacios
     * de borde es válido. Medirlo antes de normalizar rechazaría un texto que
     * la columna guarda sin problema.
     */
    it('mide el tope después de normalizar, no sobre el texto crudo', () => {
      const motivo = `    ${'x'.repeat(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH)}    `;

      expect(crear({ motivo }).motivo).toHaveLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH);
    });
  });

  describe('create — los DOS ajustes exigen motivo con contenido', () => {
    /**
     * La regla que la base NO puede sostener. Un `CHECK` condicional sería un
     * segundo dueño de una regla que ya vive acá, y además `NOT NULL` no puede
     * exigir CONTENIDO: un motivo de un solo espacio lo conformaría igual.
     *
     * Va como `Result.fail` y no como `throw` porque el borde no puede
     * rechazarlo con un decorador simple —la obligatoriedad depende del `tipo`
     * que venga en el mismo body—, así que es una desviación de negocio que el
     * usuario tiene que ver. Precedente: `ItemCompraEntity.cerrarConFaltante`.
     *
     * Los casos se recorren DESDE `TIPOS_AJUSTE_INSUMO` y no con los dos
     * literales escritos a mano: el ajuste está partido en dos direcciones
     * justamente porque son la MISMA operación de negocio, así que un guard
     * que cubriera una sola sería el defecto más probable de todo el archivo.
     */
    it.each(TIPOS_AJUSTE_INSUMO)(
      'falla con MotivoAjusteRequeridoError si %s no trae motivo',
      (tipo) => {
        const resultado = MovimientoInsumoEntity.create(propsBase({ tipo }));

        expect(resultado.isFail()).toBe(true);
        expect(resultado.getError()).toBeInstanceOf(MotivoAjusteRequeridoError);
        expect(resultado.getError().code).toBe('MOTIVO_AJUSTE_REQUERIDO');
      },
    );

    it.each(TIPOS_AJUSTE_INSUMO)(
      'falla con MotivoAjusteRequeridoError si el motivo de %s es solo espacios',
      (tipo) => {
        const resultado = MovimientoInsumoEntity.create(propsBase({ tipo, motivo: '   ' }));

        expect(resultado.isFail()).toBe(true);
        expect(resultado.getError()).toBeInstanceOf(MotivoAjusteRequeridoError);
        expect(resultado.getError().code).toBe('MOTIVO_AJUSTE_REQUERIDO');
      },
    );

    /** El error nombra el tipo exacto, así que el usuario ve en qué dirección lo entendió el sistema. */
    it.each(TIPOS_AJUSTE_INSUMO)('el error de %s nombra ese tipo y no el otro', (tipo) => {
      const resultado = MovimientoInsumoEntity.create(propsBase({ tipo }));

      expect(resultado.getError().message).toContain(tipo);
      for (const ajeno of TIPOS_AJUSTE_INSUMO.filter((candidato) => candidato !== tipo)) {
        expect(resultado.getError().message).not.toContain(ajeno);
      }
    });

    it.each(TIPOS_AJUSTE_INSUMO)('acepta %s con motivo real y lo guarda normalizado', (tipo) => {
      const resultado = MovimientoInsumoEntity.create(
        propsBase({ tipo, motivo: '  Conteo físico del 06/09  ' }),
      );

      expect(resultado.isOk()).toBe(true);
      expect(resultado.getValue().motivo).toBe('Conteo físico del 06/09');
    });

    /**
     * Los casos hermanos invertidos, derivados del catálogo: el motivo es
     * OPCIONAL en todo lo que no sea un ajuste. Sin ellos, un guard que
     * exigiera motivo para los cuatro tipos pasaría los casos de arriba y
     * rompería el uso diario del técnico, que registra salidas todos los días.
     */
    it.each(TIPOS_SIN_MOTIVO_OBLIGATORIO)('acepta %s sin motivo', (tipo) => {
      const resultado = MovimientoInsumoEntity.create(propsBase({ tipo }));

      expect(resultado.isOk()).toBe(true);
      expect(resultado.getValue().motivo).toBeNull();
    });

    /**
     * Assert de cobertura, no de contenido: fija que los dos grupos de arriba
     * SUMAN el catálogo entero. Sin él, un tipo nuevo que no fuera ajuste
     * quedaría sin ejercitar en ninguno de los dos lados y los `it.each`
     * seguirían en verde.
     */
    it('los dos grupos de casos cubren el catálogo completo, sin solaparse', () => {
      expect([...TIPOS_AJUSTE_INSUMO, ...TIPOS_SIN_MOTIVO_OBLIGATORIO].sort()).toEqual(
        [...TIPOS_MOVIMIENTO_INSUMO].sort(),
      );
    });
  });

  describe('reconstitute', () => {
    const props = {
      insumoId: 'id-insumo',
      tipo: 'SALIDA' as const,
      condicion: 'NUEVO' as const,
      cantidad: 7,
      usuarioId: 'id-usuario',
      motivo: null,
      equipoId: null,
      sectorId: null,
      itemCompraId: null,
    };

    it('preserva el id y el createdAt persistidos', () => {
      const createdAt = new Date('2026-01-15T10:30:00.000Z');
      const movimiento = MovimientoInsumoEntity.reconstitute(props, 'id-persistido', createdAt);

      expect(movimiento.id).toBe('id-persistido');
      expect(movimiento.createdAt).toEqual(createdAt);
    });

    /**
     * La lectura tiene que devolver el origen que la fila guarda. Si
     * `reconstitute` lo perdiera, la trazabilidad existiría en la base y no en
     * el modelo: la columna diría de qué compra vino la entrada y ninguna
     * pantalla podría mostrarlo. El caso hermano con `null` cubre el asiento
     * sin origen, que es la mayoría de la tabla.
     */
    it('preserva el itemCompraId persistido, y el null del asiento sin origen', () => {
      const createdAt = new Date('2026-01-15T10:30:00.000Z');

      expect(
        MovimientoInsumoEntity.reconstitute(
          { ...props, itemCompraId: 'id-item-compra' },
          'id-persistido',
          createdAt,
        ).itemCompraId,
      ).toBe('id-item-compra');
      expect(
        MovimientoInsumoEntity.reconstitute(props, 'id-persistido', createdAt).itemCompraId,
      ).toBeNull();
    });

    /**
     * La tabla es APPEND-ONLY: no tiene `updated_at` ni `deleted_at`. La
     * entidad no puede inventar esos dos datos, así que `updatedAt` se espeja
     * de `createdAt` y `deletedAt` queda en `null` — mismo criterio que
     * `ComentarioReparacionEntity.reconstitute`. Si `updatedAt` arrancara en
     * `new Date()`, una lectura mostraría un movimiento "modificado hoy" que
     * nadie tocó nunca.
     */
    it('preserva la condición persistida', () => {
      const createdAt = new Date('2026-01-15T10:30:00.000Z');

      expect(
        MovimientoInsumoEntity.reconstitute({ ...props, condicion: 'USADO' }, 'id-p', createdAt)
          .condicion,
      ).toBe('USADO');
    });

    it('espeja updatedAt de createdAt y deja deletedAt en null, porque la tabla no tiene esas columnas', () => {
      const createdAt = new Date('2026-01-15T10:30:00.000Z');
      const movimiento = MovimientoInsumoEntity.reconstitute(props, 'id-persistido', createdAt);

      expect(movimiento.updatedAt).toEqual(createdAt);
      expect(movimiento.deletedAt).toBeNull();
    });

    /**
     * NO revalida a propósito: la fila ya existe en la base, y hacer explotar
     * una LECTURA por un dato histórico —una cantidad cargada antes de que
     * existiera el techo— convertiría un valor legado en una caída de sistema.
     */
    it('no revalida: lee una fila histórica con una cantidad que create rechazaría', () => {
      const cantidadFueraDeRango = MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA + 1;

      expect(() => crear({ cantidad: cantidadFueraDeRango })).toThrow(mensajeDelTechoDeCantidad());
      expect(
        MovimientoInsumoEntity.reconstitute(
          { ...props, cantidad: cantidadFueraDeRango },
          'id-persistido',
          new Date(),
        ).cantidad,
      ).toBe(cantidadFueraDeRango);
    });

    /**
     * Un ajuste histórico sin motivo tampoco puede tumbar la lectura: la
     * regla del motivo nació con esta entrega y las filas anteriores a ella —o
     * las escritas por un script— siguen siendo datos que hay que poder
     * mostrar.
     */
    it.each(TIPOS_AJUSTE_INSUMO)(
      'no revalida: lee un %s histórico sin motivo, que create rechazaría',
      (tipo) => {
        expect(MovimientoInsumoEntity.create(propsBase({ tipo })).isFail()).toBe(true);

        const movimiento = MovimientoInsumoEntity.reconstitute(
          { ...props, tipo, motivo: null },
          'id-persistido',
          new Date(),
        );

        expect(movimiento.tipo).toBe(tipo);
        expect(movimiento.motivo).toBeNull();
      },
    );
  });
});
