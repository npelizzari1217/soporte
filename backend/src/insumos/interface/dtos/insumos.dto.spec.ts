import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateInsumoDto,
  EditInsumoDto,
  ListarInsumosQueryDto,
  toInsumoResponseDto,
} from './insumos.dto';
import {
  InsumoEntity,
  INSUMO_CODIGOS_ALTERNATIVOS_MAX,
  INSUMO_COMPATIBILIDAD_MAX,
  INSUMO_NOMBRE_MAX_LENGTH,
  INSUMO_STOCK_MINIMO_MAXIMO,
} from '../../domain/entities/insumo.entity';
import {
  InsumoCodigoAlternativoEntity,
  INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH,
  INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH,
} from '../../domain/entities/insumo-codigo-alternativo.entity';
import { COMPATIBILIDAD_ROL_MAX_LENGTH } from '../../domain/entities/compatibilidad-modelo';

const FAMILIA_ID = '11111111-1111-4111-8111-111111111111';
const UNIDAD_ID = '22222222-2222-4222-8222-222222222222';
const MODELO_ID = '55555555-5555-4555-8555-555555555555';
const OTRO_MODELO_ID = '66666666-6666-4666-8666-666666666666';

/** Body mínimo válido del alta, para que cada caso sobrescriba solo lo suyo. */
function bodyAlta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    nombre: 'Tóner negro',
    familiaId: FAMILIA_ID,
    unidadMedidaId: UNIDAD_ID,
    ...overrides,
  };
}

/** Lista de códigos alternativos válidos y distintos entre sí, para medir el techo. */
function codigosAlternativosDe(cantidad: number): Array<{ codigo: string }> {
  return Array.from({ length: cantidad }, (_valor, indice) => ({ codigo: `ALT-${indice}` }));
}

/**
 * Lista de compatibilidades con UUIDs válidos y distintos entre sí, para medir
 * el techo. Los ids se derivan del índice porque `@IsUUID` rechaza cualquier
 * cosa que no lo sea, y un id inválido pondría el caso en rojo por la
 * restricción equivocada.
 */
function compatibilidadDe(cantidad: number): Array<{ modeloEquipoId: string }> {
  return Array.from({ length: cantidad }, (_valor, indice) => ({
    modeloEquipoId: `44444444-4444-4444-8444-${String(indice).padStart(12, '0')}`,
  }));
}

/**
 * Recopila las restricciones que fallaron, para poder assertar CUÁL regla
 * rechazó y no solo "hubo algún error": con `@IsString`, `@MinLength` y
 * `@MaxLength` sobre el mismo campo, un `not.toHaveLength(0)` queda verde por
 * la regla equivocada.
 */
async function restriccionesDe(dto: object): Promise<string[]> {
  const errores = await validate(dto);
  const propias = errores.flatMap((e) => Object.keys(e.constraints ?? {}));
  const anidadas = errores.flatMap((e) =>
    (e.children ?? []).flatMap((hijo) => [
      ...Object.keys(hijo.constraints ?? {}),
      ...(hijo.children ?? []).flatMap((nieto) => Object.keys(nieto.constraints ?? {})),
    ]),
  );
  return [...propias, ...anidadas];
}

describe('CreateInsumoDto', () => {
  it('acepta un alta mínima', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta());

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * EL BORDE del issue #166 — el assert que importa: `CreateInsumoDto` no
   * declara `codigo` (no tiene ningún decorador de `class-validator` sobre esa
   * clave), así que el `ValidationPipe` global (`whitelist: true`,
   * `AppModule`) lo DESCARTA en silencio de la instancia antes de que llegue
   * al controller. La prueba corre la misma regla que corre production:
   * `validate(dto, { whitelist: true })` sin mockear nada.
   *
   * INVIERTE "acepta un alta mínima y normaliza el código a mayúscula" (#162):
   * ahí un `codigo` en el body se aceptaba y se guardaba tal cual. Acá se
   * demuestra lo contrario — sobrevive a la instancia, pero no a la
   * validación con whitelist, así que el use case jamás lo ve.
   */
  it('un codigo en el body NO sobrevive al ValidationPipe — whitelist lo descarta en silencio', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ codigo: 'CUALQUIERA' }));

    // Antes de validar, class-transformer todavía copió la clave cruda: la
    // prueba real está en lo que pasa DESPUÉS, no en que el borde ya la haya
    // filtrado por su cuenta.
    expect((dto as unknown as { codigo?: string }).codigo).toBe('CUALQUIERA');

    const errores = await validate(dto, { whitelist: true });

    expect(errores).toHaveLength(0);
    expect((dto as unknown as { codigo?: string }).codigo).toBeUndefined();
  });

  /**
   * El nombre se recorta pero NO se grita: es la descripción que lee una
   * persona en el listado.
   */
  it('recorta el nombre sin pasarlo a mayúscula', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ nombre: '  Tóner negro  ' }));

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.nombre).toBe('Tóner negro');
  });

  /**
   * `familiaId` y `unidadMedidaId` viajan en el BODY, así que `ParseUUIDPipe`
   * no los alcanza: sin `@IsUUID` el id crudo llega a Prisma contra una
   * columna `@db.Uuid`, Postgres tira 22P02 —que no está en el mapa cerrado de
   * `PrismaExceptionFilter`— y el usuario se come un 500.
   */
  it.each([['familiaId'], ['unidadMedidaId']])('rechaza %s que no es un UUID', async (campo) => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ [campo]: 'no-es-un-uuid' }));

    expect(await restriccionesDe(dto)).toContain('isUuid');
  });

  it('acepta el alta sin stockMinimo (sin punto de reposición definido)', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta());

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.stockMinimo).toBeUndefined();
  });

  it('acepta stockMinimo explícito en null, que borra el punto de reposición', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: null }));

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.stockMinimo).toBeNull();
  });

  it('acepta stockMinimo con dos decimales', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: 12.34 }));

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * Postgres NO falla ante un tercer decimal en un `DECIMAL(10,2)`: lo REDONDEA
   * en silencio. El usuario guardaría `0.005` y le quedaría `0.01`. El borde y
   * el dominio son los únicos lugares donde eso se atrapa, y se assertea la
   * restricción `esNumeroConDecimales` en particular porque el campo tiene
   * además `@Min` y `@Max`.
   */
  it('rechaza stockMinimo con más de dos decimales', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: 0.005 }));

    expect(await restriccionesDe(dto)).toContain('esNumeroConDecimales');
  });

  it('rechaza stockMinimo negativo', async () => {
    const dto = plainToInstance(CreateInsumoDto, bodyAlta({ stockMinimo: -1 }));

    expect(await restriccionesDe(dto)).toContain('min');
  });

  it('rechaza stockMinimo por encima del techo de negocio', async () => {
    const dto = plainToInstance(
      CreateInsumoDto,
      bodyAlta({ stockMinimo: INSUMO_STOCK_MINIMO_MAXIMO + 1 }),
    );

    expect(await restriccionesDe(dto)).toContain('max');
  });

  it('acepta stockMinimo exactamente en el techo de negocio (límite inclusive)', async () => {
    const dto = plainToInstance(
      CreateInsumoDto,
      bodyAlta({ stockMinimo: INSUMO_STOCK_MINIMO_MAXIMO }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Los topes y la normalización están declarados en LOS DOS DTOs (alta y
 * edición). Recorrer los dos no es redundancia: con un solo caso, borrar el
 * decorador de `EditInsumoDto` no pone nada en rojo y el camino PATCH queda
 * sin guard.
 *
 * **Ya no mide `codigo` (issue #166).** Ninguno de los dos DTOs lo declara,
 * así que no hay `@MaxLength`/`@MinLength` que espejar acá — el test de borde
 * que reemplaza a los viejos vive en `describe('CreateInsumoDto', ...)` de
 * arriba y prueba lo contrario: que el campo se DESCARTA, no que se mida.
 */
describe.each([
  ['CreateInsumoDto', CreateInsumoDto],
  ['EditInsumoDto', EditInsumoDto],
])('%s — topes de largo espejando la columna', (_nombre, Dto) => {
  it('rechaza un nombre de más de 255 caracteres', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ nombre: 'A'.repeat(INSUMO_NOMBRE_MAX_LENGTH + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('acepta un nombre de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ nombre: 'A'.repeat(INSUMO_NOMBRE_MAX_LENGTH) }));

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un nombre de solo espacios', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ nombre: '   ' }));

    expect(await restriccionesDe(dto)).toContain('minLength');
  });

  it('normaliza el código alternativo a mayúscula y colapsa el fabricante vacío a null', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [{ codigo: '  ce285a  ', fabricante: '   ' }],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigosAlternativos![0]!.codigo).toBe('CE285A');
    expect(dto.codigosAlternativos![0]!.fabricante).toBeNull();
  });

  it('pasa el fabricante a mayúscula, para que "hp" y "HP" no sean dos fabricantes', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [{ codigo: 'CE285A', fabricante: ' hp ' }],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.codigosAlternativos![0]!.fabricante).toBe('HP');
  });

  /**
   * El tope del código alternativo se mide DESPUÉS de normalizar, igual que el
   * del insumo: sin eso el valor atraviesa el borde y muere en la columna
   * `VarChar(50)`.
   */
  it('rechaza un código alternativo que se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [
          { codigo: 'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH), fabricante: 'HP' },
        ],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('rechaza un fabricante que se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [
          {
            codigo: 'CE285A',
            fabricante: 'ß'.repeat(INSUMO_CODIGO_ALTERNATIVO_FABRICANTE_MAX_LENGTH),
          },
        ],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('acepta un código alternativo de exactamente 50 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [
          { codigo: 'A'.repeat(INSUMO_CODIGO_ALTERNATIVO_CODIGO_MAX_LENGTH), fabricante: null },
        ],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un código alternativo de solo espacios', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        codigosAlternativos: [{ codigo: '   ', fabricante: 'HP' }],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('minLength');
  });

  /**
   * Sin `@ValidateNested`, `class-validator` mira el array como un valor
   * opaco: los códigos alternativos entrarían crudos y sin medir, y este caso
   * quedaría verde con un array de cualquier cosa adentro.
   */
  it('rechaza un elemento de codigosAlternativos que no es un objeto con codigo', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigosAlternativos: [{ fabricante: 'HP' }] }));

    expect(await restriccionesDe(dto)).toContain('isString');
  });

  /**
   * `codigosAlternativos: null` NO es lo mismo que ausente: la capa de
   * aplicación distingue `undefined` ("no tocar la lista") de una lista, y un
   * `null` que se cuele llega como iterable inválido y sale por 500. El borde
   * lo tiene que rechazar con un 400.
   */
  it('rechaza codigosAlternativos en null', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigosAlternativos: null }));

    expect(await restriccionesDe(dto)).toContain('isArray');
  });

  it('acepta la lista vacía de códigos alternativos, que es la orden de vaciarla', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ codigosAlternativos: [] }));

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * El techo se assertea por SU restricción y no por "hubo algún error":
   * `@IsArray`, `@ArrayMaxSize` y `@ValidateNested` conviven sobre el mismo
   * campo, así que un array de 51 elementos podría quedar verde por la regla
   * equivocada.
   */
  it('rechaza más códigos alternativos que el techo del dominio', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('arrayMaxSize');
  });

  it('acepta el techo exacto de códigos alternativos (límite inclusive)', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX) }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  // ─── Compatibilidad con modelos de equipo ─────────────────────────────────

  /**
   * `modeloEquipoId` viaja en el BODY, así que `ParseUUIDPipe` no lo alcanza:
   * sin `@IsUUID` el id crudo llega a Prisma contra una columna `@db.Uuid`,
   * Postgres tira 22P02 —que no está en el mapa cerrado de
   * `PrismaExceptionFilter`— y el usuario se come un 500.
   */
  it('rechaza un modeloEquipoId que no es un UUID', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ compatibilidad: [{ modeloEquipoId: 'no-es-un-uuid' }] }),
    );

    expect(await restriccionesDe(dto)).toContain('isUuid');
  });

  /**
   * Sin `@ValidateNested`, `class-validator` mira el array como un valor opaco:
   * los pares entrarían crudos y sin medir, y este caso quedaría verde con un
   * array de cualquier cosa adentro.
   */
  it('rechaza un elemento de compatibilidad sin modeloEquipoId', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ compatibilidad: [{ rol: 'NEGRO' }] }));

    expect(await restriccionesDe(dto)).toContain('isUuid');
  });

  it('normaliza el rol a mayúscula y colapsa a null el rol de solo espacios', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        compatibilidad: [
          { modeloEquipoId: MODELO_ID, rol: '  negro  ' },
          { modeloEquipoId: OTRO_MODELO_ID, rol: '   ' },
        ],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.compatibilidad![0]!.rol).toBe('NEGRO');
    expect(dto.compatibilidad![1]!.rol).toBeNull();
  });

  it('acepta el rol ausente y el rol en null: no todo insumo cumple un rol', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        compatibilidad: [
          { modeloEquipoId: MODELO_ID },
          { modeloEquipoId: OTRO_MODELO_ID, rol: null },
        ],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * El tope del rol se mide DESPUÉS de normalizar: `'ß'.toUpperCase()` es
   * `'SS'`, así que 20 `ß` crudas son 40 caracteres en una columna
   * `VarChar(20)`. Midiendo el crudo, el valor atraviesa el borde y muere en
   * Postgres con un 22001 que no nombra el campo.
   */
  it('rechaza un rol que entra crudo pero se pasa del tope al normalizarse', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        compatibilidad: [
          { modeloEquipoId: MODELO_ID, rol: 'ß'.repeat(COMPATIBILIDAD_ROL_MAX_LENGTH) },
        ],
      }),
    );

    expect(await restriccionesDe(dto)).toContain('maxLength');
  });

  it('acepta un rol de exactamente 20 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({
        compatibilidad: [
          { modeloEquipoId: MODELO_ID, rol: 'A'.repeat(COMPATIBILIDAD_ROL_MAX_LENGTH) },
        ],
      }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * `compatibilidad: null` NO es lo mismo que ausente: la capa de aplicación
   * distingue `undefined` ("no tocar la lista") de una lista, y un `null` que
   * se cuele llega como iterable inválido y sale por 500.
   */
  it('rechaza compatibilidad en null', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ compatibilidad: null }));

    expect(await restriccionesDe(dto)).toContain('isArray');
  });

  it('acepta la lista vacía de compatibilidad, que es la orden de vaciarla', async () => {
    const dto = plainToInstance(Dto, bodyAlta({ compatibilidad: [] }));

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * El techo se assertea por SU restricción y no por "hubo algún error":
   * `@IsArray`, `@ArrayMaxSize` y `@ValidateNested` conviven sobre el mismo
   * campo. Sin él, el guardado del agregado emite una escritura anidada por
   * modelo dentro de una sola transacción y la sostiene abierta sobre la base
   * del inquilino tantas idas y vueltas como modelos hayan entrado.
   */
  it('rechaza más modelos compatibles que el techo del dominio', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ compatibilidad: compatibilidadDe(INSUMO_COMPATIBILIDAD_MAX + 1) }),
    );

    expect(await restriccionesDe(dto)).toContain('arrayMaxSize');
  });

  it('acepta el techo exacto de modelos compatibles (límite inclusive)', async () => {
    const dto = plainToInstance(
      Dto,
      bodyAlta({ compatibilidad: compatibilidadDe(INSUMO_COMPATIBILIDAD_MAX) }),
    );

    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('EditInsumoDto — PATCH parcial', () => {
  it('acepta un body vacío: no tocar nada es un PATCH válido', async () => {
    const dto = plainToInstance(EditInsumoDto, {});

    expect(await validate(dto)).toHaveLength(0);
  });

  it('acepta un PATCH de un solo campo', async () => {
    const dto = plainToInstance(EditInsumoDto, { nombre: 'Renombrado' });

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * EL BORDE del issue #166 — cierra el agujero que el #162 dejaba abierto:
   * no alcanzaba con que el alta no aceptara un código a mano si Editar SÍ lo
   * cambiaba después. `EditInsumoDto` no declara `codigo`, así que el
   * `ValidationPipe` global (`whitelist: true`) lo descarta en silencio del
   * body del PATCH, igual que en `CreateInsumoDto`.
   */
  it('un codigo en el PATCH NO sobrevive al ValidationPipe — whitelist lo descarta en silencio', async () => {
    const dto = plainToInstance(EditInsumoDto, { nombre: 'Renombrado', codigo: 'TON-999' });

    expect((dto as unknown as { codigo?: string }).codigo).toBe('TON-999');

    const errores = await validate(dto, { whitelist: true });

    expect(errores).toHaveLength(0);
    expect((dto as unknown as { codigo?: string }).codigo).toBeUndefined();
  });

  /**
   * El techo tiene que estar en las DOS puntas. La edición es el camino más
   * probable para pasarse —a un insumo se le agregan códigos con el tiempo—,
   * así que un techo puesto solo en el alta no protege nada.
   */
  it('rechaza más códigos alternativos que el techo del dominio', async () => {
    const dto = plainToInstance(EditInsumoDto, {
      codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX + 1),
    });

    expect(await restriccionesDe(dto)).toContain('arrayMaxSize');
  });

  it('acepta el techo exacto de códigos alternativos (límite inclusive)', async () => {
    const dto = plainToInstance(EditInsumoDto, {
      codigosAlternativos: codigosAlternativosDe(INSUMO_CODIGOS_ALTERNATIVOS_MAX),
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  /**
   * La edición es el camino más probable para pasarse del techo —a un insumo
   * se le agregan modelos compatibles con el tiempo—, así que un techo puesto
   * solo en el alta no protege nada.
   */
  it('rechaza más modelos compatibles que el techo del dominio', async () => {
    const dto = plainToInstance(EditInsumoDto, {
      compatibilidad: compatibilidadDe(INSUMO_COMPATIBILIDAD_MAX + 1),
    });

    expect(await restriccionesDe(dto)).toContain('arrayMaxSize');
  });

  it('acepta un PATCH que solo trae la compatibilidad', async () => {
    const dto = plainToInstance(EditInsumoDto, {
      compatibilidad: [{ modeloEquipoId: MODELO_ID, rol: 'NEGRO' }],
    });

    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('toInsumoResponseDto', () => {
  it('mapea la entidad al shape de respuesta HTTP, con sus códigos alternativos', () => {
    const codigo = InsumoCodigoAlternativoEntity.create(
      { codigo: 'CE285A', fabricante: 'HP' },
      '33333333-3333-4333-8333-333333333333',
    );
    const insumo = InsumoEntity.create({
      codigo: 'TON-001',
      nombre: 'Tóner negro',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: 5.5,
      activo: true,
      codigosAlternativos: [codigo],
      compatibilidad: [],
    });

    const dto = toInsumoResponseDto(insumo);

    expect(dto.codigo).toBe('TON-001');
    expect(dto.nombre).toBe('Tóner negro');
    expect(dto.familiaId).toBe(FAMILIA_ID);
    expect(dto.unidadMedidaId).toBe(UNIDAD_ID);
    expect(dto.stockMinimo).toBe(5.5);
    expect(dto.activo).toBe(true);
    expect(typeof dto.createdAt).toBe('string');
    // El agregado no se puede editar sin ver sus códigos: el formulario manda
    // la lista COMPLETA, así que una respuesta sin ellos obligaría al usuario a
    // recargarlos de memoria.
    expect(dto.codigosAlternativos).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', codigo: 'CE285A', fabricante: 'HP' },
    ]);
  });

  /**
   * La compatibilidad viaja por el mismo motivo que los códigos alternativos:
   * el PATCH lleva la lista COMPLETA, así que una respuesta sin ella obligaría
   * al usuario a reconstruirla de memoria y cualquier edición le borraría los
   * modelos que no recordó.
   *
   * El par NO lleva `id`: su identidad es `(insumo, modelo)`, que es la PK de
   * la tabla.
   */
  it('mapea la compatibilidad del agregado, sin id, con su rol', () => {
    const insumo = InsumoEntity.create({
      codigo: 'TON-003',
      nombre: 'Con compatibilidad',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [
        { modeloEquipoId: MODELO_ID, rol: 'NEGRO' },
        { modeloEquipoId: OTRO_MODELO_ID, rol: null },
      ],
    });

    expect(toInsumoResponseDto(insumo).compatibilidad).toEqual([
      { modeloEquipoId: MODELO_ID, rol: 'NEGRO' },
      { modeloEquipoId: OTRO_MODELO_ID, rol: null },
    ]);
  });

  it('serializa el stockMinimo nulo como null, no como cero', () => {
    const insumo = InsumoEntity.create({
      codigo: 'TON-002',
      nombre: 'Sin punto de reposición',
      familiaId: FAMILIA_ID,
      unidadMedidaId: UNIDAD_ID,
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    });

    expect(toInsumoResponseDto(insumo).stockMinimo).toBeNull();
  });
});

/**
 * `ListarInsumosQueryDto` (WU-2, sdd/repuestos-seccion). Mismo patrón que
 * `soloEnCurso` de `ListarComprasQueryDto`: la querystring manda el booleano
 * como string, y `'false'` tiene que llegar como `false`, no como un string
 * truthy.
 */
describe('ListarInsumosQueryDto', () => {
  it("'esRepuesto=true' en la querystring se transforma al boolean true", async () => {
    const dto = plainToInstance(ListarInsumosQueryDto, { esRepuesto: 'true' });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.esRepuesto).toBe(true);
  });

  /**
   * Gemelo invertido del caso anterior: sin él, un `@Type(() => Boolean)` que
   * tratara cualquier string no vacío como verdadero pasaría igual con solo
   * el caso `'true'` cubierto.
   */
  it("'esRepuesto=false' en la querystring se transforma al boolean false, no truthy", async () => {
    const dto = plainToInstance(ListarInsumosQueryDto, { esRepuesto: 'false' });
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.esRepuesto).toBe(false);
  });

  it('esRepuesto ausente no rechaza — el catálogo GET /insumos no lo exige', async () => {
    const dto = plainToInstance(ListarInsumosQueryDto, {});
    const errores = await validate(dto);
    expect(errores).toHaveLength(0);
    expect(dto.esRepuesto).toBeUndefined();
  });

  it('rechaza un esRepuesto que no es "true" ni "false"', async () => {
    const dto = plainToInstance(ListarInsumosQueryDto, { esRepuesto: 'tal-vez' });
    const errores = await validate(dto);
    expect(errores.some((e) => e.property === 'esRepuesto')).toBe(true);
  });
});
