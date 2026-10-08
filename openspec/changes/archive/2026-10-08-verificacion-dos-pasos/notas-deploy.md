## Notas de deploy — verificacion-dos-pasos (cadena completa)

**Se despliega solo la cadena completa (WU-1 a WU-13).** El backend nuevo exige el desafio y el frontend viejo no sabe presentarlo; un deploy parcial deja el login roto.

### Antes del deploy

- **Migracion M1 en master**: `backend/prisma_master/migrations/20261008120000_verificacion_dos_pasos/` (5 tablas, CHECKs, indices, FK `ON DELETE CASCADE`, `clientes.requiere_2fa`). Lleva `rollback.sql` en la misma carpeta. Sin backfill: todo cliente arranca con `requiere_2fa = false`.
- **`EMAIL_CRYPTO_KEY` valida en `backend/.env`**: los secretos TOTP se cifran con ella; si falta o es invalida, el enrolamiento falla. Comprobarla antes del deploy.
- El lockfile no se espera que cambie.
- `backend/.env.example` **todavia no tiene `ROOT_ADMIN_TOTP_SECRET`**: su lectura da permiso denegado en el entorno de los agentes. Una persona debe agregar la linea comentada (solo desarrollo y test; valor documentado en el README).

### Efecto en produccion

- **Cada ROOT queda obligado a enrolar 2FA en su primer login.** Tener el celular a mano. Los 10 codigos de recuperacion se muestran una sola vez.
- Activar la politica de un cliente no corta las sesiones abiertas: se pide el segundo paso en el proximo login de cada usuario.
- Recuperacion de un ROOT que perdio el celular y los codigos: `corepack pnpm exec ts-node scripts/resetear-2fa-root.ts` con `RESET_EMAIL` (ver `DEPLOY-VPS-runbook.md`, seccion 5).

### Despues del deploy

1. Hacer dos contraseñas incorrectas desde fuera de la red con un email de prueba.
2. En master: `SELECT clave FROM auth_intentos_fallidos;` — la clave debe terminar en una **IP publica**, nunca `sin-ip` ni `127.0.0.1`.
3. Borrar esa fila.
4. Smoke de login sin 2FA y del login completo del ROOT (enrolamiento forzado incluido).

### Deuda de Ayuda acumulada (suspendida; se escribe en la tanda final)

- Login con segundo paso: pantalla del codigo, "Recordar este dispositivo", codigos de recuperacion como alternativa y seleccion de cliente con ticket.
- Pantalla de enrolamiento forzado en el login (QR, clave manual, codigos de recuperacion, "Los guarde").
- Ajustes de 2FA del perfil: activar, cambiar celular, regenerar codigos, desactivar (no disponible si esta obligado).
- Desactivar el propio 2FA y su efecto sobre los dispositivos confiables.
- Cambiar o resetear la contraseña ahora cierra los dispositivos confiables.
- Politica de 2FA por cliente (tarjeta "Verificacion en dos pasos" en Admin > Usuarios) y su efecto en el proximo login.
- Boton "Resetear 2FA" en Editar usuario (cuando usarlo, que ve el usuario despues, mensaje neutro ante un caso no permitido).
