/**
 * equipos.dto.spec.ts — RED→GREEN: tope de largo de `titulo` en
 * `CreateTicketSoporteHttpDto` (fix defecto "límite de largo de titulo").
 *
 * `titulo` crea un `Ticket` (`Ticket.titulo VarChar(255)`) vía
 * `TicketEntity.create()`. Sin este guard el valor atraviesa el DTO y el
 * dominio intactos y lo frena recién Postgres, con un error de driver sin
 * nombrar campo.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateTicketSoporteHttpDto,
  CreateEquipoHttpDto,
  EditarEquipoHttpDto,
  CreateComponenteHttpDto,
  EditarComponenteHttpDto,
  toComponenteResponseDto,
} from './equipos.dto';
import { ComponenteEquipoEntity } from '../../domain/entities/componente-equipo.entity';
import {
  EquipoInformaticoEntity,
  EquipoInformaticoProps,
  EQUIPO_UBICACION_MAX_LENGTH,
} from '../../domain/entities/equipo-informatico.entity';

describe('CreateTicketSoporteHttpDto — tope de largo de titulo espejando la columna', () => {
  const prioridadId = '00000000-0000-4000-8000-000000000002';

  // Asserta el error DEL CAMPO y por SU restricción, no que "hubo algún
  // error": un DTO que rechazara por otra propiedad daría verde igual con
  // el tope de largo ausente.
  it('rechaza titulo de más de 255 caracteres, por maxLength', async () => {
    const dto = plainToInstance(CreateTicketSoporteHttpDto, {
      titulo: 'A'.repeat(256),
      prioridadId,
    });
    const errorDeTitulo = (await validate(dto)).find((e) => e.property === 'titulo');

    expect(errorDeTitulo?.constraints).toHaveProperty('maxLength');
  });

  it('acepta titulo de exactamente 255 caracteres (límite inclusive)', async () => {
    const dto = plainToInstance(CreateTicketSoporteHttpDto, {
      titulo: 'A'.repeat(255),
      prioridadId,
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * Fix defecto "límites de equipos" (sdd/limites-db/explore gap #4). Recorre
 * LOS DOS DTOs (alta y edición): con un solo caso, un decorador borrado en
 * uno de los dos no pone nada en rojo (mismo hallazgo que `sectores.dto.spec.ts`).
 * Los tests asertan el error DEL CAMPO y por SU restricción, no que "hubo
 * algún error".
 */
describe.each([
  ['CreateEquipoHttpDto', CreateEquipoHttpDto],
  ['EditarEquipoHttpDto', EditarEquipoHttpDto],
])('%s — topes de largo/rango espejando la columna', (_nombreDto, Dto) => {
  const base = { nombre: 'Notebook' };

  it.each([
    ['nombre', 'A'.repeat(256), 'maxLength'],
    ['numeroSerie', 'A'.repeat(256), 'maxLength'],
    ['marca', 'A'.repeat(101), 'maxLength'],
    ['modelo', 'A'.repeat(101), 'maxLength'],
    ['ubicacion', 'A'.repeat(256), 'maxLength'],
    // 'ß' se normaliza a 'SS' (1→2): 200 crudos → 400 normalizados, supera el
    // tope de 255 recién DESPUÉS de normalizar. Prueba que el DTO mide el
    // valor normalizado, no el crudo (regresión: antes pasaba con 200 crudos
    // y explotaba en Postgres VarChar(255) como 500).
    ['ubicacion', 'ß'.repeat(200), 'maxLength'],
    ['importe', -1, 'min'],
    ['importe', 100_000_000, 'max'],
    ['valorResidual', -1, 'min'],
    ['valorResidual', 100_000_000, 'max'],
  ])('rechaza %s fuera de rango, por %s', async (campo, valor, restriccion) => {
    const dto = plainToInstance(Dto, { ...base, [campo]: valor });
    const errorDelCampo = (await validate(dto)).find((e) => e.property === campo);
    // `?? {}` evita que un `errorDelCampo` ausente (campo que hoy no
    // valida nada) haga explotar el matcher con un TypeError ajeno a la
    // aserción; sin este fallback, un RED real se confunde con un import roto.
    expect(errorDelCampo?.constraints ?? {}).toHaveProperty(restriccion);
  });

  it.each([
    ['nombre', 'A'.repeat(255)],
    ['numeroSerie', 'A'.repeat(255)],
    ['marca', 'A'.repeat(100)],
    ['modelo', 'A'.repeat(100)],
    ['ubicacion', 'A'.repeat(255)],
    // Hermano invertido del caso de arriba: 127 crudos → 254 normalizados,
    // dentro del tope. Sin este par, "rechaza siempre" y "rechaza lo
    // correcto" se ven idénticos.
    ['ubicacion', 'ß'.repeat(127)],
    ['importe', 0],
    ['importe', 99_999_999],
    ['valorResidual', 0],
    ['valorResidual', 99_999_999],
  ])('acepta %s en el límite exacto', async (campo, valor) => {
    const dto = plainToInstance(Dto, { ...base, [campo]: valor });
    const errorDelCampo = (await validate(dto)).find((e) => e.property === campo);
    expect(errorDelCampo).toBeUndefined();
  });
});

/**
 * R2 — `ubicacion` null/vacía atraviesa el DTO sin lanzar (el `@Transform`
 * solo invoca `normalizarUbicacion` cuando `typeof value === 'string'`;
 * `normalizarUbicacion` es TOTAL sobre `string` y NO acepta `null`).
 *
 * GUARD DE INVARIANTE — NO arranca en RED: la implementación de 1.4 ya
 * incluye el ternario `typeof value === 'string' ? ... : value`, así que
 * escribir el test ahora no lo pone rojo. Se declara así y se prueba la
 * mordida mutando el ternario para que llame a `normalizarUbicacion` sin
 * chequear el tipo — confirma rojo por la aserción de `dto.ubicacion`, no
 * por `TypeError`. Restaurado por Edit tras verificar el rojo.
 */
describe.each([
  ['CreateEquipoHttpDto', CreateEquipoHttpDto],
  ['EditarEquipoHttpDto', EditarEquipoHttpDto],
])('%s — ubicacion null/vacía y no vacía (R2)', (_nombreDto, Dto) => {
  const base = { nombre: 'Notebook' };

  it('ubicacion=null no lanza y no produce error de campo', async () => {
    // Envuelto en función para que `.not.toThrow()` capture la mordida como
    // AssertionError legible en vez de un TypeError sin capturar: sin el
    // ternario de tipo, `normalizarUbicacion(null)` revienta con
    // `Cannot read properties of null (reading 'toUpperCase')`.
    let dto!: InstanceType<typeof Dto>;
    expect(() => {
      dto = plainToInstance(Dto, { ...base, ubicacion: null });
    }).not.toThrow();
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === 'ubicacion')).toBeUndefined();
    expect(dto.ubicacion).toBeNull();
  });

  // Caso `''`: distinto de `null` — pasa `@IsOptional()` y SÍ entra al
  // `@Transform` (`typeof '' === 'string'`), así que se normaliza a `''` y
  // llega al dominio como string vacío, no como `null`.
  it('ubicacion="" no lanza, no produce error de campo y llega como string vacío', async () => {
    const dto = plainToInstance(Dto, { ...base, ubicacion: '' });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === 'ubicacion')).toBeUndefined();
    expect(dto.ubicacion).toBe('');
  });

  // Hermano invertido: con contenido no vacío, el DTO SÍ normaliza (mide y
  // guarda el valor ya normalizado) y valida el resultado.
  it('ubicacion con contenido no vacío se normaliza y valida (hermano invertido)', async () => {
    const dto = plainToInstance(Dto, { ...base, ubicacion: 'oficina 1' });
    const errores = await validate(dto);
    expect(errores.find((e) => e.property === 'ubicacion')).toBeUndefined();
    expect(dto.ubicacion).toBe('OFICINA 1');
  });
});

/**
 * Costura DTO→dominio (ADR-1 del design, "Idempotencia: se prueba, no se
 * asume"). Lo que importa: el DTO ya normalizó, así que la entidad NO debe
 * volver a EXPANDIR el largo — debe quedar en 240, nunca en 480.
 *
 * GUARD DE INVARIANTE — NO arranca en RED: sin `@Transform`, `dto.ubicacion`
 * sería el crudo de 120 y la costura daría 240 igual (120 'ß' → 240 'SS' en
 * el dominio). La mordida (mutar `normalizarUbicacion` a
 * `valor.toUpperCase() + 'X'`) es la prueba real de que esto muerde.
 */
// Copia de `baseProps()` en `equipo-informatico.entity.spec.ts:17` (mismo
// shape base para tests de dominio) — se duplica acá en vez de importar
// desde el otro spec para no crear un archivo de fixtures compartido.
function baseEntityProps(): Omit<EquipoInformaticoProps, 'activo'> {
  return {
    nombre: 'Notebook',
    numeroSerie: null,
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacion: null,
    modeloEquipoId: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
  };
}

describe('Costura CreateEquipoHttpDto → EquipoInformaticoEntity (idempotencia de ubicacion)', () => {
  it('el DTO normaliza y el dominio NO re-expande (120 crudo → 240, nunca 480)', async () => {
    const crudo = 'ß'.repeat(120);
    const dto = plainToInstance(CreateEquipoHttpDto, { nombre: 'X', ubicacion: crudo });
    expect(await validate(dto)).toHaveLength(0);
    // Guard que estrecha el tipo (en vez de `dto.ubicacion!`): un `crudo` no
    // vacío nunca normaliza a `null`, así que este `throw` es inalcanzable en
    // este test — solo le prueba el tipo al compilador.
    if (dto.ubicacion == null) {
      throw new Error('dto.ubicacion no debería ser null tras normalizar un valor no vacío');
    }

    const equipo = EquipoInformaticoEntity.create({
      ...baseEntityProps(),
      ubicacion: dto.ubicacion,
    });
    if (equipo.ubicacion == null) {
      throw new Error('equipo.ubicacion no debería ser null tras create() con ubicacion definida');
    }
    expect(equipo.ubicacion.length).toBe(240);
    expect(equipo.ubicacion.length).toBeLessThanOrEqual(EQUIPO_UBICACION_MAX_LENGTH);
  });
});

/**
 * Componente en el DTO (mismo fix defecto "límites de equipos"):
 * `descripcion`/`numeroSerie`/`capacidad` espejan
 * `COMPONENTE_*_MAX_LENGTH` de `componente-equipo.entity.ts`. Recorre LOS DOS
 * DTOs (alta y edición) por el mismo motivo que el bloque de equipo de
 * arriba. `tipoComponenteCodigo` queda fuera: sin `@MaxLength` a propósito
 * (ver JSDoc del DTO).
 */
describe.each([
  ['CreateComponenteHttpDto', CreateComponenteHttpDto],
  ['EditarComponenteHttpDto', EditarComponenteHttpDto],
])('%s — topes de largo espejando la columna', (nombreDto, DtoCls) => {
  const Dto = DtoCls as new () => object;
  const base =
    nombreDto === 'CreateComponenteHttpDto'
      ? { insumoId: '33333333-3333-4333-8333-333333333333' }
      : {};

  it.each([
    ['descripcion', 'A'.repeat(256)],
    ['numeroSerie', 'A'.repeat(256)],
    ['capacidad', 'A'.repeat(101)],
  ])('rechaza %s fuera de rango, por maxLength', async (campo, valor) => {
    const dto = plainToInstance(Dto, { ...base, [campo]: valor });
    const errorDelCampo = (await validate(dto)).find((e) => e.property === campo);
    expect(errorDelCampo?.constraints).toHaveProperty('maxLength');
  });

  it.each([
    ['descripcion', 'A'.repeat(255)],
    ['numeroSerie', 'A'.repeat(255)],
    ['capacidad', 'A'.repeat(100)],
  ])('acepta %s en el límite exacto', async (campo, valor) => {
    const dto = plainToInstance(Dto, { ...base, [campo]: valor });
    const errorDelCampo = (await validate(dto)).find((e) => e.property === campo);
    expect(errorDelCampo).toBeUndefined();
  });
});

/**
 * Contrato HTTP de la edición de componente (ADR-2): solo `descripcion`,
 * `numeroSerie` y `capacidad`; `tipoComponenteCodigo` e `insumoId` sobrantes
 * los descarta el `whitelist` del `ValidationPipe` global, sin error.
 */
describe('EditarComponenteHttpDto — el tipo y el repuesto no se editan', () => {
  it('descarta tipoComponenteCodigo e insumoId sobrantes con whitelist, sin error', async () => {
    const dto = plainToInstance(EditarComponenteHttpDto, {
      descripcion: 'Nueva',
      tipoComponenteCodigo: 'CUALQUIERA',
      insumoId: '33333333-3333-4333-8333-333333333333',
    });

    const errores = await validate(dto, { whitelist: true });

    expect(errores).toHaveLength(0);
    const plano = dto as unknown as Record<string, unknown>;
    expect(plano.tipoComponenteCodigo).toBeUndefined();
    expect(plano.insumoId).toBeUndefined();
    expect(dto.descripcion).toBe('Nueva');
  });
});

/**
 * Contrato HTTP del alta de componente (ADR-1, ADR-2): `insumoId` obligatorio,
 * `descontarStock` booleano estricto y `tipoComponenteCodigo` descartado por
 * el `whitelist` del `ValidationPipe` global.
 */
describe('CreateComponenteHttpDto — contrato del alta única', () => {
  const insumoId = '33333333-3333-4333-8333-333333333333';

  it('sin insumoId es inválido (400 en el pipe)', async () => {
    const errores = await validate(plainToInstance(CreateComponenteHttpDto, {}));
    expect(errores.find((e) => e.property === 'insumoId')).toBeDefined();
  });

  it('acepta un alta mínima y descontarStock omitido', async () => {
    const dto = plainToInstance(CreateComponenteHttpDto, { insumoId });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.descontarStock).toBeUndefined();
  });

  it.each([true, false])('acepta descontarStock booleano %s', async (valor) => {
    const dto = plainToInstance(CreateComponenteHttpDto, { insumoId, descontarStock: valor });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['false', 'true', 0, 1])(
    'rechaza descontarStock no booleano %j (sin conversión implícita)',
    async (valor) => {
      const dto = plainToInstance(CreateComponenteHttpDto, { insumoId, descontarStock: valor });
      const error = (await validate(dto)).find((e) => e.property === 'descontarStock');
      expect(error?.constraints).toHaveProperty('isBoolean');
    },
  );

  it.each(['NUEVO', 'USADO'])('acepta la condición %s del catálogo', async (condicion) => {
    const dto = plainToInstance(CreateComponenteHttpDto, { insumoId, condicion });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each(['REFURBISHED', 'usado', '', 1])(
    'rechaza la condición %j fuera del catálogo (400 en el pipe)',
    async (condicion) => {
      const dto = plainToInstance(CreateComponenteHttpDto, { insumoId, condicion });
      const error = (await validate(dto)).find((e) => e.property === 'condicion');
      expect(error?.constraints).toHaveProperty('isIn');
    },
  );

  it('un tipoComponenteCodigo sobrante se descarta con whitelist, sin error', async () => {
    const dto = plainToInstance(CreateComponenteHttpDto, {
      insumoId,
      tipoComponenteCodigo: 'CUALQUIERA',
    });

    const errores = await validate(dto, { whitelist: true });

    expect(errores).toHaveLength(0);
    expect(
      (dto as unknown as { tipoComponenteCodigo?: string }).tipoComponenteCodigo,
    ).toBeUndefined();
  });
});

describe('toComponenteResponseDto — registro del retiro (ADR-7)', () => {
  const props = { equipoId: 'equipo-uuid', insumoId: 'insumo-uuid' };

  it('un componente activo informa el retiro vacío y bajaSinSalidaPrevia false', () => {
    const dto = toComponenteResponseDto(
      ComponenteEquipoEntity.create({
        ...props,
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
      }).getValue(),
    );

    expect(dto).toMatchObject({
      bajaDestino: null,
      bajaMotivo: null,
      bajaMovimientoId: null,
      bajaUsuarioId: null,
      bajaSinSalidaPrevia: false,
    });
  });

  it('un retiro al stock sin SALIDA vinculada informa bajaSinSalidaPrevia true', () => {
    const componente = ComponenteEquipoEntity.create({
      ...props,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    componente.retirar({
      destino: 'STOCK_USADO',
      motivo: 'Vino de otro equipo',
      usuarioId: 'usuario-uuid',
      bajaMovimientoId: 'mov-uuid',
    });

    expect(toComponenteResponseDto(componente)).toMatchObject({
      bajaDestino: 'STOCK_USADO',
      bajaMotivo: 'Vino de otro equipo',
      bajaMovimientoId: 'mov-uuid',
      bajaUsuarioId: 'usuario-uuid',
      bajaSinSalidaPrevia: true,
    });
  });

  it('con SALIDA vinculada, el retiro al stock informa bajaSinSalidaPrevia false', () => {
    const componente = ComponenteEquipoEntity.create({
      ...props,
      descripcion: null,
      numeroSerie: null,
      capacidad: null,
    }).getValue();
    componente.vincularInstalacion('salida-uuid');
    componente.retirar({
      destino: 'STOCK_USADO',
      motivo: null,
      usuarioId: 'usuario-uuid',
      bajaMovimientoId: 'mov-uuid',
    });

    expect(toComponenteResponseDto(componente).bajaSinSalidaPrevia).toBe(false);
  });
});
