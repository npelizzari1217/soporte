/**
 * `CreateClienteDto` / `UpdateClienteDto` — tope de largo de `cuit`.
 *
 * Foco: que el borde devuelva un 400 amable en vez de dejar pasar el valor
 * hasta Postgres (22001 → 500 crudo). El límite NO se declara acá: se importa
 * de `ClienteEntity`, que es la autoridad. Estos tests existen para que el
 * borde y el dominio no puedan divergir en silencio, que es exactamente lo
 * que había pasado (`@MaxLength(20)` contra una columna de 13).
 */
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigurarZonaHorariaClienteDto, CreateClienteDto, UpdateClienteDto } from './cliente.dto';
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from '../../../auth/domain/entities/usuario.entity';
import {
  CLIENTE_CUIT_MAX_LENGTH,
  CLIENTE_NOMBRE_MAX_LENGTH,
  CLIENTE_RAZON_SOCIAL_MAX_LENGTH,
} from '../../domain/entities/cliente.entity';
import { ZONA_HORARIA_MAX_LENGTH } from '../../../shared/domain/zona-horaria';

const ALTA_VALIDA = {
  nombre: 'Acme SA',
  adminEmail: 'admin@acme.com',
  adminNombre: 'Ada',
  adminApellido: 'Lovelace',
  adminPassword: 'unaClaveLarga',
  zonaHoraria: 'America/Argentina/Buenos_Aires',
};

const CUIT_EN_EL_LIMITE = '30-12345678-9';
const CUIT_PASADO = 'A'.repeat(CLIENTE_CUIT_MAX_LENGTH + 1);

/** El tope del DTO es el del dominio, no un número tipeado a mano. */
it('CLIENTE_CUIT_MAX_LENGTH es el largo de un CUIT formateado', () => {
  expect(CUIT_EN_EL_LIMITE).toHaveLength(CLIENTE_CUIT_MAX_LENGTH);
});

describe('CreateClienteDto — cuit', () => {
  it('acepta un cuit en el límite exacto', async () => {
    const dto = plainToInstance(CreateClienteDto, { ...ALTA_VALIDA, cuit: CUIT_EN_EL_LIMITE });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un cuit que pasa el tope', async () => {
    const dto = plainToInstance(CreateClienteDto, { ...ALTA_VALIDA, cuit: CUIT_PASADO });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'cuit')).toBe(true);
  });

  it('sigue aceptando el alta sin cuit: el tope no lo vuelve obligatorio', async () => {
    const dto = plainToInstance(CreateClienteDto, ALTA_VALIDA);
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('UpdateClienteDto — cuit', () => {
  it('acepta un cuit en el límite exacto', async () => {
    const dto = plainToInstance(UpdateClienteDto, { cuit: CUIT_EN_EL_LIMITE });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un cuit que pasa el tope', async () => {
    const dto = plainToInstance(UpdateClienteDto, { cuit: CUIT_PASADO });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'cuit')).toBe(true);
  });

  it('sigue aceptando un patch que no toca el cuit', async () => {
    const dto = plainToInstance(UpdateClienteDto, { nombre: 'Acme SRL' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

/**
 * El alta no declaraba NINGÚN tope de largo mientras la edición sí, así que un
 * nombre de 220 se podía crear y después no se podía editar — y por API llegaba
 * a la columna y moría ahí (22001 → 500 crudo). Los dos DTOs importan ahora la
 * misma constante del dominio.
 */
describe.each([
  ['CreateClienteDto', CreateClienteDto, ALTA_VALIDA],
  ['UpdateClienteDto', UpdateClienteDto, {}],
])('%s — topes de nombre y razonSocial', (_nombre, Dto, base) => {
  it('acepta un nombre en el límite exacto', async () => {
    const dto = plainToInstance(Dto, { ...base, nombre: 'A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH) });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rechaza un nombre que pasa el tope', async () => {
    const dto = plainToInstance(Dto, {
      ...base,
      nombre: 'A'.repeat(CLIENTE_NOMBRE_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'nombre')).toBe(true);
  });

  it('rechaza una razonSocial que pasa el tope', async () => {
    const dto = plainToInstance(Dto, {
      ...base,
      razonSocial: 'A'.repeat(CLIENTE_RAZON_SOCIAL_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'razonSocial')).toBe(true);
  });
});

/**
 * Los campos de admin del alta de tenant escriben las MISMAS columnas que el ABM
 * de usuarios (`usuarios.nombre`/`apellido` `VarChar(100)`), así que importan la
 * misma constante de `UsuarioEntity`. Cerrar una sola de las dos puertas dejaba
 * la clase abierta con apariencia de cerrada.
 *
 * `adminEmail` no lleva tope: `@IsEmail` ya acota más fuerte que la columna.
 */
describe('CreateClienteDto — topes de los campos de admin', () => {
  it('acepta los valores en el límite exacto', async () => {
    const dto = plainToInstance(CreateClienteDto, {
      ...ALTA_VALIDA,
      adminNombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH),
      adminApellido: 'B'.repeat(USUARIO_APELLIDO_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['adminNombre', USUARIO_NOMBRE_MAX_LENGTH],
    ['adminApellido', USUARIO_APELLIDO_MAX_LENGTH],
  ])('rechaza un %s que pasa el tope', async (campo, max) => {
    const dto = plainToInstance(CreateClienteDto, { ...ALTA_VALIDA, [campo]: 'A'.repeat(max + 1) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === campo)).toBe(true);
  });
});

/**
 * `zonaHoraria` — OBLIGATORIA desde el alta (sdd/zona-horaria-por-tenant, WU-2
 * tarea 2.4). No se defaultea a Buenos Aires (decisión "Zona de un cliente
 * NUEVO: se exige explícita en el alta"): un alta sin zona DEBE rechazarse en
 * el borde, igual que `nombre` o `adminEmail`. El tope de largo se importa del
 * VO (`ZONA_HORARIA_MAX_LENGTH`), no un número tipeado a mano — mismo criterio
 * que `CLIENTE_CUIT_MAX_LENGTH`.
 */
describe('CreateClienteDto — zonaHoraria', () => {
  it('acepta el alta con zonaHoraria', async () => {
    const dto = plainToInstance(CreateClienteDto, ALTA_VALIDA);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('[CRITICAL] rechaza el alta sin zonaHoraria — es obligatoria, no se defaultea', async () => {
    const { zonaHoraria: _omitida, ...sinZona } = ALTA_VALIDA;
    const dto = plainToInstance(CreateClienteDto, sinZona);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });

  it('rechaza zonaHoraria vacía', async () => {
    const dto = plainToInstance(CreateClienteDto, { ...ALTA_VALIDA, zonaHoraria: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });

  /**
   * [CRITICAL] Centinela de forma, separado del de largo (mismo criterio que
   * `zona-horaria.spec.ts` — "cae por largo" vs. "cae por invalidez" son dos
   * fallas distintas). Un candidato de largo VÁLIDO pero forma inválida
   * (`'A'.repeat(64)` no es una zona) pasaba antes por `@MaxLength` +
   * `@IsNotEmpty` sin que nada validara su FORMA, y llegaba hasta
   * `ZonaHoraria.crear()` dentro del use case — que lanza fuera del único
   * `try/catch` de `CrearClienteUseCase.execute()`: 500 crudo, no 422/400
   * limpio. `@IsZonaHorariaValida()` cierra ese hueco en el borde.
   */
  it('[CRITICAL] rechaza una zona de largo válido pero forma inválida — nunca debe llegar al 500 vía ZonaHoraria.crear()', async () => {
    const dto = plainToInstance(CreateClienteDto, {
      ...ALTA_VALIDA,
      zonaHoraria: 'A'.repeat(ZONA_HORARIA_MAX_LENGTH),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });

  it('rechaza una zona que pasa el tope de largo', async () => {
    const dto = plainToInstance(CreateClienteDto, {
      ...ALTA_VALIDA,
      zonaHoraria: 'A'.repeat(ZONA_HORARIA_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });
});

/**
 * `ConfigurarZonaHorariaClienteDto` — body de `PATCH /clientes/:id/zona-horaria`
 * (sdd/zona-horaria-por-tenant, C2b). Reutiliza el MISMO decorator
 * `@IsZonaHorariaValida()` que `CreateClienteDto.zonaHoraria` — este bloque es
 * el gemelo de `describe('CreateClienteDto — zonaHoraria')` de arriba: sin él,
 * un candidato de forma inválida (`'A'.repeat(64)`) podría dejar de rechazarse
 * en el borde sin que ningún test lo note, y la única defensa pasaría a ser
 * `ZonaHorariaInvalidaError` dentro del caso de uso (defensa en profundidad,
 * nunca pensada como la única barrera).
 */
describe('ConfigurarZonaHorariaClienteDto', () => {
  it('acepta un candidato válido', async () => {
    const dto = plainToInstance(ConfigurarZonaHorariaClienteDto, {
      zonaHoraria: 'America/Argentina/Buenos_Aires',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('[CRITICAL] rechaza cuando falta zonaHoraria', async () => {
    const dto = plainToInstance(ConfigurarZonaHorariaClienteDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });

  it('rechaza zonaHoraria vacía', async () => {
    const dto = plainToInstance(ConfigurarZonaHorariaClienteDto, { zonaHoraria: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });

  it('[CRITICAL] rechaza una zona de largo válido pero forma inválida — nunca debe llegar al 500/422 vía ZonaHoraria.crear()', async () => {
    const dto = plainToInstance(ConfigurarZonaHorariaClienteDto, {
      zonaHoraria: 'A'.repeat(ZONA_HORARIA_MAX_LENGTH),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });

  it('rechaza una zona que pasa el tope de largo', async () => {
    const dto = plainToInstance(ConfigurarZonaHorariaClienteDto, {
      zonaHoraria: 'A'.repeat(ZONA_HORARIA_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'zonaHoraria')).toBe(true);
  });
});
