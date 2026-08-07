// Configuración del CLI de Prisma 7 para la DB TENANT (por cliente).
//
// Usada EXCLUSIVAMENTE por los comandos de migración del tenant:
//   pnpm run migrate:tenant   → prisma migrate deploy --schema=prisma_tenant/...
//
// En Prisma 7 el bloque `datasource` del schema ya NO acepta `url`: la
// conexión para los comandos de Migrate vive acá. En RUNTIME la app NO usa
// esta url — PrismaService inyecta la conexión vía @prisma/adapter-pg.
//
// DATABASE_URL_TENANT apunta a UNA DB tenant concreta (ej. una DB de prueba
// en dev/CI). El fan-out de migraciones a todas las DBs tenant existentes es
// responsabilidad de un script externo (fuera de este andamiaje) que
// sobreescribe esta variable por cada iteración.
import { defineConfig } from 'prisma/config';

try {
  process.loadEnvFile();
} catch {
  // .env ausente — se usan las variables del entorno.
}

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL_TENANT,
  },
});
