/**
 * `CreateUsuarioTenantDto` / `EditarUsuarioDto` — topes de largo de la identidad.
 *
 * Foco: que el borde devuelva un 400 amable en vez de dejar pasar el valor hasta
 * Postgres (22001 → 500 crudo). Los límites NO se declaran acá: se importan de
 * `UsuarioEntity`, que es la autoridad. Estos tests existen para que el borde y
 * el dominio no puedan divergir en silencio — que es lo que había pasado: la
 * edición acotaba a 100 y el alta no acotaba nada.
 */
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateUsuarioTenantDto, EditarUsuarioDto } from './usuario-tenant.dto';
import {
  USUARIO_APELLIDO_MAX_LENGTH,
  USUARIO_EMAIL_MAX_LENGTH,
  USUARIO_NOMBRE_MAX_LENGTH,
} from '../../domain/entities/usuario.entity';

const ALTA_VALIDA = {
  email: 'nuevo@acme.com',
  nombre: 'Ada',
  apellido: 'Lovelace',
  password: 'unaClaveLarga',
  rolCodigo: 'TECNICO',
};

/**
 * `email` NO lleva `@MaxLength` en el DTO, a propósito: sería inalcanzable.
 * `@IsEmail` ya acota más fuerte que la columna `VarChar(255)` — `validator`
 * aplica `defaultMaxEmailLength = 254` salvo que se le pase
 * `ignore_max_length`, así que ningún email que pase `@IsEmail` llega a 255.
 *
 * El tope de `email` sí existe en `UsuarioEntity` por el principio de que el
 * dominio es la autoridad del límite, NO porque hoy haya callers sin DTO: los
 * únicos dos que construyen la entidad son `CrearUsuarioTenantUseCase` y
 * `CrearClienteUseCase`, y los dos entran por un DTO ya acotado.
 *
 * Sí existe un tercer escritor de `usuarios.nombre`/`apellido`/`email` que
 * ESQUIVA la entidad: `prisma_master/seeds/root-bootstrap.seed.ts` inserta los
 * valores de `ROOT_ADMIN_*` directo por Prisma. Ese camino no está cubierto por
 * este guard — es input de operador en deploy, no un 500 en pantalla, pero
 * conviene no creer que la columna quedó cerrada por todos lados.
 */

/**
 * Parte local en su máximo legal (64) más un dominio largo, para que el rechazo
 * venga de la regla de largo TOTAL y no de la de parte local. Con
 * `'a'.repeat(250) + '@acme.com'` el canario se ponía verde por el límite de 64,
 * o sea que no ejercitaba lo que el comentario decía fijar.
 */
const emailLargoInvalido =
  'a'.repeat(64) + '@' + 'b'.repeat(63) + '.' + 'c'.repeat(63) + '.' + 'd'.repeat(63) + '.com';

describe('CreateUsuarioTenantDto — topes de largo', () => {
  it('acepta el alta con los valores en el límite exacto', async () => {
    const dto = plainToInstance(CreateUsuarioTenantDto, {
      ...ALTA_VALIDA,
      nombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH),
      apellido: 'B'.repeat(USUARIO_APELLIDO_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['nombre', USUARIO_NOMBRE_MAX_LENGTH],
    ['apellido', USUARIO_APELLIDO_MAX_LENGTH],
  ])('rechaza un %s que pasa el tope', async (campo, max) => {
    const dto = plainToInstance(CreateUsuarioTenantDto, {
      ...ALTA_VALIDA,
      [campo]: 'A'.repeat(max + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === campo)).toBe(true);
  });

  /**
   * Este caso NO prueba un tope propio: documenta que `@IsEmail` ya rechaza un
   * email que la columna no podría guardar, y por eso el DTO no declara
   * `@MaxLength` sobre `email`. Si algún día se cambiara `@IsEmail` por algo
   * más laxo, este test se pone rojo y avisa que ahí sí haría falta el tope.
   */
  it('un email más largo que la columna ya lo rechaza @IsEmail, sin tope propio', async () => {
    const dto = plainToInstance(CreateUsuarioTenantDto, {
      ...ALTA_VALIDA,
      email: emailLargoInvalido,
    });
    const errors = await validate(dto);
    expect(emailLargoInvalido.length).toBeGreaterThan(USUARIO_EMAIL_MAX_LENGTH);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });
});

describe('EditarUsuarioDto — el mismo tope que el alta', () => {
  it('acepta los valores en el límite exacto', async () => {
    const dto = plainToInstance(EditarUsuarioDto, {
      nombre: 'A'.repeat(USUARIO_NOMBRE_MAX_LENGTH),
      apellido: 'B'.repeat(USUARIO_APELLIDO_MAX_LENGTH),
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['nombre', USUARIO_NOMBRE_MAX_LENGTH],
    ['apellido', USUARIO_APELLIDO_MAX_LENGTH],
  ])('rechaza un %s que pasa el tope', async (campo, max) => {
    const dto = plainToInstance(EditarUsuarioDto, { [campo]: 'A'.repeat(max + 1) });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === campo)).toBe(true);
  });

  it('sigue aceptando un patch que no toca ningún campo acotado', async () => {
    const dto = plainToInstance(EditarUsuarioDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });
});
