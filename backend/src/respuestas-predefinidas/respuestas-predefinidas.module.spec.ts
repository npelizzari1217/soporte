/**
 * Wiring de `RespuestasPredefinidasModule`: inspecciona la metadata del decorador `@Module()`
 * sin compilar el árbol de módulos ni requerir DB.
 */
import 'reflect-metadata';
import { RespuestasPredefinidasModule } from './respuestas-predefinidas.module';
import { RespuestasPredefinidasController } from './interface/controllers/respuestas-predefinidas.controller';
import { AuthModule } from '../auth/auth.module';
import { RESPUESTA_PREDEFINIDA_REPOSITORY } from './domain/ports/i-respuesta-predefinida.repository';

describe('RespuestasPredefinidasModule wiring', () => {
  it('registra el controller e importa AuthModule (guards)', () => {
    const controllers = (Reflect.getMetadata('controllers', RespuestasPredefinidasModule) ??
      []) as unknown[];
    const imports = (Reflect.getMetadata('imports', RespuestasPredefinidasModule) ??
      []) as unknown[];
    expect(controllers).toContain(RespuestasPredefinidasController);
    expect(imports).toContain(AuthModule);
  });

  it('provee RESPUESTA_PREDEFINIDA_REPOSITORY', () => {
    const providers = (Reflect.getMetadata('providers', RespuestasPredefinidasModule) ??
      []) as Array<{ provide?: unknown }>;
    expect(providers.map((p) => p.provide)).toContain(RESPUESTA_PREDEFINIDA_REPOSITORY);
  });
});
