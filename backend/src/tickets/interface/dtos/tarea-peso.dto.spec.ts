/**
 * [UNIT] `AsignarPesoTareaBodyDto` (odd/edilicia-obra-externa, S4, L17): entero de 0 a 100.
 */
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AsignarPesoTareaBodyDto } from './tarea-ticket.dto';

const valida = (peso: unknown): boolean =>
  validateSync(plainToInstance(AsignarPesoTareaBodyDto, { peso })).length === 0;

describe('AsignarPesoTareaBodyDto', () => {
  it.each([0, 1, 100])('acepta %s', (peso) => {
    expect(valida(peso)).toBe(true);
  });

  it.each([-1, 101, 1.5, '30', null, undefined])('rechaza %s', (peso) => {
    expect(valida(peso)).toBe(false);
  });
});
