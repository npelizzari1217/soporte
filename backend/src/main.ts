import 'dotenv/config';
import 'reflect-metadata';
// Guard de entorno (sdd/fail-fast-env): el import ES el fail-fast — tiene que
// evaluarse ANTES que cualquier módulo del grafo de arranque, o un DI factory
// o decorador podría leer una variable requerida ausente sin que nadie aborte.
import './config/entorno';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Arranca la aplicación NestJS: crea el `AppModule`, fija el prefijo global
 * `api` y escucha en el puerto configurado (o 3000 por defecto).
 *
 * @returns No devuelve nada; el guard de entorno (`./config/entorno`) ya se
 *   evaluó al importarse, ANTES de esta función (ver comentario de import
 *   arriba), así que acá el entorno ya es válido.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  await app.listen(process.env['PORT'] ?? 3000);
}

// Cubre los fallos de `NestFactory.create`/`listen`: sin catch saldrían como
// unhandled rejection, sin prefijo y sin exit code propio.
//
// OJO: NO cubre el guard de entorno. `./config/entorno` lanza al evaluarse el
// módulo, o sea antes de que `bootstrap` siquiera exista, así que
// `ErrorEntornoInvalido` nunca pasa por acá — sale como stack trace crudo. Es
// aceptable porque ese error ya se nombra solo (dice qué variable falta), pero
// no confundir una cosa con la otra.
bootstrap().catch((error: unknown) => {
  console.error('[arranque] La aplicación no pudo iniciar:', error);
  process.exit(1);
});
