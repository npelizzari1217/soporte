import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  ListarMovimientosInsumoQueryDto,
  RegistrarAjusteInsumoHttpDto,
  RegistrarMovimientoInsumoHttpDto,
  toListarMovimientosInsumoResponseDto,
  toMovimientoInsumoResponseDto,
  toStockInsumoResponseDto,
} from './movimientos-insumo.dto';
import {
  MovimientoInsumoEntity,
  MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES,
  MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA,
  MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH,
} from '../../domain/entities/movimiento-insumo.entity';

const INSUMO_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';
const EQUIPO_ID = '33333333-3333-4333-8333-333333333333';
const SECTOR_ID = '44444444-4444-4444-8444-444444444444';
const ITEM_COMPRA_ID = '55555555-5555-4555-8555-555555555555';

/** Body mínimo válido de una entrada o una salida. */
function bodyMovimiento(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { cantidad: 2, ...overrides };
}

/** Body mínimo válido de un ajuste: agrega la dirección al body del movimiento. */
function bodyAjuste(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { cantidad: 2, tipo: 'AJUSTE_NEGATIVO', motivo: 'Conteo físico', ...overrides };
}

/**
 * Recopila las restricciones que fallaron, para poder assertar CUÁL regla
 * rechazó y no solo "hubo algún error": con `@EsNumeroConDecimales`,
 * `@IsPositive` y `@Max` sobre el mismo campo, un `not.toHaveLength(0)` queda
 * verde por la regla equivocada. Mismo helper que `insumos.dto.spec.ts`.
 */
async function restriccionesDe(dto: object): Promise<string[]> {
  const errores = await validate(dto);
  return errores.flatMap((e) => Object.keys(e.constraints ?? {}));
}

/** Texto de largo exacto, para medir el tope del motivo desde sus dos lados. */
function textoDe(largo: number): string {
  return 'a'.repeat(largo);
}

describe('RegistrarMovimientoInsumoHttpDto', () => {
  it('acepta el body mínimo: solo la cantidad', async () => {
    const dto = plainToInstance(RegistrarMovimientoInsumoHttpDto, bodyMovimiento());

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.cantidad).toBe(2);
  });

  describe('cantidad — espeja el rango, la escala y el techo de la entidad', () => {
    /**
     * La entidad lanza (`throw`, no `Result`) ante una cantidad fuera de rango
     * o de escala. Sin estos topes en el borde, ese `throw` sale como 500
     * crudo en vez del 400 que nombra el campo: es la clase 1 de fallo de
     * topes del `AGENTS.md`.
     */
    it('rechaza el cero por isPositive: el signo lo da el tipo, no el número', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: 0 }),
      );

      expect(await restriccionesDe(dto)).toContain('isPositive');
    });

    it('rechaza una cantidad negativa por isPositive', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: -1 }),
      );

      expect(await restriccionesDe(dto)).toContain('isPositive');
    });

    /**
     * Postgres NO falla ante un tercer decimal en un `DECIMAL(10,2)`: lo
     * REDONDEA en silencio. En una bitácora de existencias ese redondeo se
     * acumula movimiento a movimiento sobre el stock, que ES la suma de todas
     * ellas.
     */
    it('rechaza una cantidad con un decimal de más por esNumeroConDecimales', async () => {
      const decimalDeMas = 1 / 10 ** (MOVIMIENTO_INSUMO_CANTIDAD_DECIMALES + 1);
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: 1 + decimalDeMas }),
      );

      expect(await restriccionesDe(dto)).toContain('esNumeroConDecimales');
    });

    it('acepta una cantidad con exactamente los decimales de la columna', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: 1.25 }),
      );

      expect(await validate(dto)).toHaveLength(0);
    });

    // El techo se construye desde la constante del dominio: si el DTO
    // escribiera su propio número, este par de casos se rompería.
    it('acepta el techo de negocio exacto', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA }),
      );

      expect(await validate(dto)).toHaveLength(0);
    });

    it('rechaza una unidad por encima del techo de negocio por max', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: MOVIMIENTO_INSUMO_CANTIDAD_MAXIMA + 1 }),
      );

      expect(await restriccionesDe(dto)).toContain('max');
    });

    it('rechaza una cantidad que no es un número por esNumeroConDecimales', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ cantidad: 'dos' }),
      );

      expect(await restriccionesDe(dto)).toContain('esNumeroConDecimales');
    });

    it('rechaza el body sin cantidad por esNumeroConDecimales', async () => {
      const dto = plainToInstance(RegistrarMovimientoInsumoHttpDto, {});

      expect(await restriccionesDe(dto)).toContain('esNumeroConDecimales');
    });
  });

  describe('motivo — el tope se importa del dominio y se mide sobre el normalizado', () => {
    it('acepta un motivo del largo máximo exacto', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ motivo: textoDe(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH) }),
      );

      expect(await validate(dto)).toHaveLength(0);
    });

    /**
     * Sin este tope en el DTO, el `throw` de precondición de la entidad sale
     * como 500 crudo. El caso se construye desde la constante del dominio: si
     * el DTO escribiera su propio número, acá se ve.
     */
    it('rechaza un carácter por encima del tope por maxLength', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ motivo: textoDe(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH + 1) }),
      );

      expect(await restriccionesDe(dto)).toContain('maxLength');
    });

    /**
     * El recorte corre ANTES de medir. Un motivo que solo pasa el tope por sus
     * espacios de borde es válido, y tiene que llegar recortado a la capa de
     * aplicación: medir el crudo rechazaría un texto que la columna guarda sin
     * problema.
     */
    it('recorta los espacios de borde antes de medir el tope', async () => {
      const conEspacios = `  ${textoDe(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH)}  `;
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ motivo: conEspacios }),
      );

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.motivo).toHaveLength(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH);
    });

    /**
     * El colapso del vacío a `null` es lo que permite que la entidad exija
     * CONTENIDO y no solo presencia en el ajuste. Si el borde dejara pasar
     * `'   '` intacto, un ajuste con tres espacios de motivo llegaría al
     * dominio como un motivo presente.
     */
    it('colapsa un motivo de solo espacios a null', async () => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ motivo: '   ' }),
      );

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.motivo).toBeNull();
    });

    it('acepta el motivo ausente', async () => {
      const dto = plainToInstance(RegistrarMovimientoInsumoHttpDto, bodyMovimiento());

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.motivo).toBeUndefined();
    });

    it('rechaza un motivo que no es texto por isString', async () => {
      const dto = plainToInstance(RegistrarMovimientoInsumoHttpDto, bodyMovimiento({ motivo: 7 }));

      expect(await restriccionesDe(dto)).toContain('isString');
    });
  });

  describe('equipoId y sectorId — trazabilidad, pero igual son ids de base', () => {
    it.each([['equipoId'], ['sectorId']])(
      'acepta %s ausente, nulo o con un UUID válido',
      async (campo) => {
        const ausente = plainToInstance(RegistrarMovimientoInsumoHttpDto, bodyMovimiento());
        const nulo = plainToInstance(
          RegistrarMovimientoInsumoHttpDto,
          bodyMovimiento({ [campo]: null }),
        );
        const conValor = plainToInstance(
          RegistrarMovimientoInsumoHttpDto,
          bodyMovimiento({ [campo]: EQUIPO_ID }),
        );

        expect(await validate(ausente)).toHaveLength(0);
        expect(await validate(nulo)).toHaveLength(0);
        expect(await validate(conValor)).toHaveLength(0);
      },
    );

    /**
     * Viajan en el BODY, así que `ParseUUIDPipe` no los alcanza: sin `@IsUUID`
     * el id crudo llega a Prisma contra una columna `@db.Uuid` y el `22P02` de
     * Postgres sale como 500 en vez de 400.
     */
    it.each([['equipoId'], ['sectorId']])('rechaza %s mal formado por isUuid', async (campo) => {
      const dto = plainToInstance(
        RegistrarMovimientoInsumoHttpDto,
        bodyMovimiento({ [campo]: 'no-es-un-uuid' }),
      );

      expect(await restriccionesDe(dto)).toContain('isUuid');
    });
  });

  /**
   * El `usuarioId` lo estampa el borde desde el JWT y NUNCA el body. El DTO no
   * lo declara, así que el `whitelist` del `ValidationPipe` —que es el mismo
   * flag que se pasa acá— lo descarta antes de que el controller lo vea.
   *
   * El assert es de AUSENCIA sobre un fixture que SÍ trae el campo: sin ese
   * fixture pasaría por construcción. El caso hermano, con la condición
   * invertida, es que `cantidad` —que el DTO sí declara— sobreviva al mismo
   * barrido; si no, el test quedaría verde con un DTO que borra todo.
   */
  it('descarta un usuarioId venido del body y conserva los campos declarados', async () => {
    const dto = plainToInstance(
      RegistrarMovimientoInsumoHttpDto,
      bodyMovimiento({ usuarioId: 'usuario-suplantado', motivo: 'Recepción' }),
    );

    expect(await validate(dto, { whitelist: true })).toHaveLength(0);

    expect(dto).not.toHaveProperty('usuarioId');
    expect(dto.cantidad).toBe(2);
    expect(dto.motivo).toBe('Recepción');
  });
});

describe('RegistrarAjusteInsumoHttpDto', () => {
  it('acepta las dos direcciones del ajuste', async () => {
    const positivo = plainToInstance(
      RegistrarAjusteInsumoHttpDto,
      bodyAjuste({ tipo: 'AJUSTE_POSITIVO' }),
    );
    const negativo = plainToInstance(
      RegistrarAjusteInsumoHttpDto,
      bodyAjuste({ tipo: 'AJUSTE_NEGATIVO' }),
    );

    expect(await validate(positivo)).toHaveLength(0);
    expect(await validate(negativo)).toHaveLength(0);
  });

  /**
   * El endpoint del ajuste está detrás de `INSUMOS:AJUSTAR`. Si su `tipo`
   * admitiera `ENTRADA` o `SALIDA`, quien solo tiene `AJUSTAR` podría registrar
   * la operación cotidiana por la puerta del ajuste — y al revés, el gate de
   * `ALTAS` quedaría esquivable. El catálogo del campo ES el gate.
   */
  it.each([['ENTRADA'], ['SALIDA'], ['AJUSTE'], ['']])(
    'rechaza el tipo %s por isIn: solo las dos direcciones del ajuste',
    async (tipo) => {
      const dto = plainToInstance(RegistrarAjusteInsumoHttpDto, bodyAjuste({ tipo }));

      expect(await restriccionesDe(dto)).toContain('isIn');
    },
  );

  it('rechaza el body sin tipo por isIn', async () => {
    const { tipo: _tipo, ...sinTipo } = bodyAjuste();
    const dto = plainToInstance(RegistrarAjusteInsumoHttpDto, sinTipo);

    expect(await restriccionesDe(dto)).toContain('isIn');
  });

  /**
   * El ajuste hereda las reglas del movimiento: si dejara de extenderlas, su
   * motivo de 501 caracteres volvería a salir como 500 crudo.
   */
  it('hereda el tope del motivo del movimiento', async () => {
    const dto = plainToInstance(
      RegistrarAjusteInsumoHttpDto,
      bodyAjuste({ motivo: textoDe(MOVIMIENTO_INSUMO_MOTIVO_MAX_LENGTH + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('hereda el rango de la cantidad del movimiento', async () => {
    const dto = plainToInstance(RegistrarAjusteInsumoHttpDto, bodyAjuste({ cantidad: 0 }));

    expect(await restriccionesDe(dto)).toContain('isPositive');
  });

  /**
   * El motivo obligatorio del ajuste NO se duplica en el DTO: es una regla de
   * negocio que `MovimientoInsumoEntity.create()` devuelve como
   * `MotivoAjusteRequeridoError`, o sea un 422 que el usuario tiene que ver, no
   * un 400 de forma del body. Un segundo dueño de la misma regla deriva.
   */
  it('NO exige el motivo en el borde: la regla vive en el dominio y sale como 422', async () => {
    const { motivo: _motivo, ...sinMotivo } = bodyAjuste();
    const dto = plainToInstance(RegistrarAjusteInsumoHttpDto, sinMotivo);

    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('toMovimientoInsumoResponseDto', () => {
  function construirMovimiento(): MovimientoInsumoEntity {
    const resultado = MovimientoInsumoEntity.create({
      insumoId: INSUMO_ID,
      tipo: 'AJUSTE_NEGATIVO',
      cantidad: 3.5,
      usuarioId: USUARIO_ID,
      motivo: '  Conteo físico del 06/09  ',
      equipoId: EQUIPO_ID,
      sectorId: SECTOR_ID,
    });
    return resultado.getValue();
  }

  /** Entrada nacida de la recepción de un ítem de compra: con origen y SIN motivo. */
  function construirEntradaDeRecepcion(): MovimientoInsumoEntity {
    const resultado = MovimientoInsumoEntity.create({
      insumoId: INSUMO_ID,
      tipo: 'ENTRADA',
      cantidad: 4,
      usuarioId: USUARIO_ID,
      itemCompraId: ITEM_COMPRA_ID,
    });
    return resultado.getValue();
  }

  it('mapea el asiento completo, con el motivo ya normalizado y la fecha en ISO-8601', () => {
    const movimiento = construirMovimiento();

    const dto = toMovimientoInsumoResponseDto(movimiento);

    expect(dto).toEqual({
      id: movimiento.id,
      insumoId: INSUMO_ID,
      tipo: 'AJUSTE_NEGATIVO',
      cantidad: 3.5,
      usuarioId: USUARIO_ID,
      motivo: 'Conteo físico del 06/09',
      equipoId: EQUIPO_ID,
      sectorId: SECTOR_ID,
      itemCompraId: null,
      createdAt: movimiento.createdAt.toISOString(),
    });
  });

  /**
   * El origen es lo ÚNICO que distingue una entrada nacida de una recepción de
   * una carga manual: la del enganche va deliberadamente SIN `motivo`, así que
   * sin este campo las dos se ven idénticas del lado del consumidor. El fixture
   * SÍ trae el origen —no es un assert de ausencia sobre un fixture vacío— y su
   * hermano invertido es el asiento manual de arriba, que lo trae en `null`.
   */
  it('publica el itemCompraId de la entrada que nació de una recepción de compra', () => {
    const movimiento = construirEntradaDeRecepcion();

    const dto = toMovimientoInsumoResponseDto(movimiento);

    expect(dto.itemCompraId).toBe(ITEM_COMPRA_ID);
    expect(dto.motivo).toBeNull();
  });

  /**
   * `MovimientoInsumoEntity` hereda `updatedAt` de `BaseEntity` y lo espeja de
   * `createdAt`, pero la tabla NO tiene esa columna: publicarlo inventaría un
   * dato. El assert es de ausencia sobre un fixture que SÍ lo trae — la
   * entidad expone `updatedAt`—, así que no puede pasar por construcción.
   */
  it('no publica updatedAt: la bitácora es append-only y la tabla no tiene esa columna', () => {
    const movimiento = construirMovimiento();
    expect(movimiento.updatedAt).toBeInstanceOf(Date);

    expect(toMovimientoInsumoResponseDto(movimiento)).not.toHaveProperty('updatedAt');
  });
});

describe('toStockInsumoResponseDto', () => {
  it('mapea el saldo con su punto de reposición y el estado ya resuelto', () => {
    const dto = toStockInsumoResponseDto({
      insumoId: INSUMO_ID,
      stock: 2,
      stockMinimo: 10,
      estadoReposicion: 'BAJO_MINIMO',
    });

    expect(dto).toEqual({
      insumoId: INSUMO_ID,
      stock: 2,
      stockMinimo: 10,
      estadoReposicion: 'BAJO_MINIMO',
    });
  });

  /**
   * `null` y `SIN_PUNTO_DEFINIDO` viajan los dos: un `false` y un `null` de
   * JSON se leen igual de "no pasa nada", y el estado con nombre propio es lo
   * que distingue "nadie configuró el punto" de "hay de sobra".
   */
  it('preserva el punto de reposición nulo junto con SIN_PUNTO_DEFINIDO', () => {
    const dto = toStockInsumoResponseDto({
      insumoId: INSUMO_ID,
      stock: 0,
      stockMinimo: null,
      estadoReposicion: 'SIN_PUNTO_DEFINIDO',
    });

    expect(dto.stockMinimo).toBeNull();
    expect(dto.estadoReposicion).toBe('SIN_PUNTO_DEFINIDO');
  });
});

describe('ListarMovimientosInsumoQueryDto', () => {
  /**
   * El query param llega SIEMPRE como string: sin el `@Type(() => Number)` de
   * `class-transformer`, `@IsInt` rechazaría toda paginación válida y el
   * listado quedaría inutilizable con un 400 permanente.
   */
  it('acepta la paginación que llega como texto y la convierte a número', async () => {
    const dto = plainToInstance(
      ListarMovimientosInsumoQueryDto,
      { pagina: '2', porPagina: '50' },
      { enableImplicitConversion: false },
    );

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.pagina).toBe(2);
    expect(dto.porPagina).toBe(50);
  });

  it('acepta la query vacía: los dos defaults los resuelve el caso de uso', async () => {
    const dto = plainToInstance(ListarMovimientosInsumoQueryDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.pagina).toBeUndefined();
    expect(dto.porPagina).toBeUndefined();
  });

  /**
   * El piso de `porPagina` es de CORRECTITUD, no de higiene: el valor viaja
   * hasta el `take` de Prisma, y un `take` negativo INVIERTE el orden — la
   * respuesta serían los movimientos más VIEJOS presentados como los más
   * nuevos, con un 200 de cara limpia, sin error y sin log.
   *
   * El assert es de la restricción `min` y no de "hubo algún error": con
   * `@IsInt`, `@Min` y `@Max` sobre el mismo campo, un `not.toHaveLength(0)`
   * queda verde por la regla equivocada.
   */
  it.each([[0], [-1]])(
    'rechaza porPagina %s por min: un take negativo invierte el orden',
    async (porPagina) => {
      const dto = plainToInstance(ListarMovimientosInsumoQueryDto, { porPagina });

      expect(await restriccionesDe(dto)).toContain('min');
    },
  );

  /**
   * El piso de `pagina` ataja la OTRA falla, que no es la misma: el caso de uso
   * traduce la página a `offset: (pagina - 1) * porPagina`, así que una página
   * menor a 1 da un `skip` negativo y Prisma revienta con un 500 crudo que no
   * nombra el campo. Una miente y la otra explota; las dos las ataja el mismo
   * `@Min(1)`.
   */
  it.each([[0], [-1]])(
    'rechaza pagina %s por min: un skip negativo revienta en Prisma',
    async (pagina) => {
      const dto = plainToInstance(ListarMovimientosInsumoQueryDto, { pagina });

      expect(await restriccionesDe(dto)).toContain('min');
    },
  );

  it('rechaza porPagina por encima del tope de página por max', async () => {
    const dto = plainToInstance(ListarMovimientosInsumoQueryDto, { porPagina: 101 });

    expect(await restriccionesDe(dto)).toContain('max');
  });

  it('acepta el tope de página exacto', async () => {
    const dto = plainToInstance(ListarMovimientosInsumoQueryDto, { porPagina: 100 });

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * Un `porPagina` fraccionario llegaría al `take` de Prisma, que espera un
   * entero. `@IsInt` corre DESPUÉS del `@Type(() => Number)`, así que mide el
   * número ya convertido y no el texto.
   */
  it.each([
    ['pagina', { pagina: '1.5' }],
    ['porPagina', { porPagina: '2.5' }],
  ])('rechaza %s fraccionario por isInt', async (_campo, payload) => {
    const dto = plainToInstance(ListarMovimientosInsumoQueryDto, payload);

    expect(await restriccionesDe(dto)).toContain('isInt');
  });
});

describe('toListarMovimientosInsumoResponseDto', () => {
  function movimientoManual(): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.create({
      insumoId: INSUMO_ID,
      tipo: 'SALIDA',
      cantidad: 2,
      usuarioId: USUARIO_ID,
      motivo: 'Reposición del piso 3',
    }).getValue();
  }

  function movimientoDeRecepcion(): MovimientoInsumoEntity {
    return MovimientoInsumoEntity.create({
      insumoId: INSUMO_ID,
      tipo: 'ENTRADA',
      cantidad: 6,
      usuarioId: USUARIO_ID,
      itemCompraId: ITEM_COMPRA_ID,
    }).getValue();
  }

  /**
   * El envoltorio REUSA `toMovimientoInsumoResponseDto` para cada fila: un
   * segundo mapeo copiado derivaría, y la copia que se olvidara de un campo
   * nuevo lo dejaría de publicar solo en el listado.
   */
  it('mapea cada fila con el mapper del asiento, incluido el itemCompraId', () => {
    const manual = movimientoManual();
    const recepcion = movimientoDeRecepcion();

    const dto = toListarMovimientosInsumoResponseDto({
      items: [recepcion, manual],
      total: 2,
      pagina: 1,
      porPagina: 20,
    });

    expect(dto.items).toEqual([
      toMovimientoInsumoResponseDto(recepcion),
      toMovimientoInsumoResponseDto(manual),
    ]);
    expect(dto.items[0].itemCompraId).toBe(ITEM_COMPRA_ID);
    expect(dto.items[1].itemCompraId).toBeNull();
  });

  /**
   * `total` es el universo completo del insumo y NO el tamaño de la página: el
   * fixture trae MENOS filas que `total` a propósito, porque con los dos
   * números iguales el assert pasaría aunque el mapper publicara
   * `items.length`.
   */
  it('publica el total del universo y no el tamaño de la página', () => {
    const dto = toListarMovimientosInsumoResponseDto({
      items: [movimientoManual()],
      total: 47,
      pagina: 3,
      porPagina: 5,
    });

    expect(dto.items).toHaveLength(1);
    expect(dto.total).toBe(47);
    expect(dto.pagina).toBe(3);
    expect(dto.porPagina).toBe(5);
  });

  /**
   * La página vacía —el offset se pasó del final— sigue diciendo cuántos
   * movimientos tiene el insumo: sin eso, el paginador leería "no hay nada" en
   * vez de "esta página quedó afuera".
   */
  it('conserva el total con la página vacía', () => {
    const dto = toListarMovimientosInsumoResponseDto({
      items: [],
      total: 12,
      pagina: 9,
      porPagina: 20,
    });

    expect(dto.items).toEqual([]);
    expect(dto.total).toBe(12);
  });
});
