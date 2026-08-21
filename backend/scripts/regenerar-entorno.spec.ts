/**
 * [UNIT] `regenerar-entorno.mjs` — `validarNombreBaseDestructible` (W5).
 *
 * PURO: literales de entrada, sin fs, sin red, sin Docker. Es la amenaza
 * "DDL con identificadores" de la matriz del design: `DROP DATABASE` no
 * admite parámetros preparados, así que la única defensa posible es
 * rechazar el nombre ANTES de interpolarlo — este archivo prueba
 * exactamente eso, sin llegar nunca a abrir una conexión.
 */
import { validarNombreBaseDestructible } from './regenerar-entorno.mjs';

describe('validarNombreBaseDestructible() (W5, amenaza DDL)', () => {
  it.each([
    ['soporte_master', 'la base de desarrollo — nunca destructible'],
    [
      'soporte_01a0253ef26f78b88b02d5161410d8fd',
      'db_name del tenant REAL "Demo Soporte", leido de soporte_master.clientes',
    ],
    [
      'x"; DROP TABLE usuarios; --',
      'intento de inyección — ni siquiera matchea el patrón de identificador',
    ],
    ['soporte_master_prod', 'no termina en _test'],
    [
      'SOPORTE_MASTER_TEST',
      'mayúsculas: no matchea /^[a-z0-9_]+$/, se rechaza por patrón, no por semántica',
    ],
  ])('[CRITICAL] rechaza %s (%s)', (nombre) => {
    expect(validarNombreBaseDestructible(nombre)).toBe(false);
  });

  it.each([null, undefined, 42, {}, ['soporte_master_test']])(
    'rechaza un valor que no es string: %j',
    (valor) => {
      expect(validarNombreBaseDestructible(valor)).toBe(false);
    },
  );

  it.each(['soporte_master_test', 'soporte_tenant_test', 'soporte_regen_ab12cd34_master_test'])(
    'acepta %s — son el objetivo declarado de --recrear-test (spec "Alcance destructivo acotado")',
    (nombre) => {
      expect(validarNombreBaseDestructible(nombre)).toBe(true);
    },
  );
});
