import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import { MasterContext } from '../src/shared/tenancy/master-context';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';

// Resetea la contraseña de un usuario (admin reset). Hashea con Argon2, NO toca roles.
// Uso: RESET_EMAIL=... RESET_PASSWORD=... DATABASE_URL_MASTER=...
//      ts-node -r tsconfig-paths/register scripts/reset-password.ts
const MASTER_URL = process.env.DATABASE_URL_MASTER!;

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

async function main() {
  const email = req('RESET_EMAIL');
  const newPassword = req('RESET_PASSWORD');

  const prisma = new PrismaService(MASTER_URL);
  const mc = new MasterContext();
  const repo = new PrismaUsuarioRepository(prisma, mc);
  const hashProvider = new Argon2HashProvider();

  const usuario = await repo.findByEmail(email);
  if (!usuario) {
    console.log('RESET_ERR: usuario no encontrado: ' + email);
    await prisma.onModuleDestroy();
    process.exit(2);
  }

  await usuario.hashPassword(newPassword, hashProvider);
  await repo.save(usuario);
  console.log('RESET_OK: ' + email);

  await prisma.onModuleDestroy();
  process.exit(0);
}

main().catch((e) => {
  console.error('RESET_THROW', e);
  process.exit(1);
});
