# Verificación post-deploy — matriz-permisos-por-usuario (WU-8)

Procedimiento para correr DESPUÉS de desplegar el paso 3 (deploy atómico:
`migrate:master` + `migrate:tenants` + backend + frontend) del cambio
`sdd/matriz-permisos-por-usuario`. Ref design §3, "Verificación post-deploy
(humo, no opcional)". Los 6 checks originales del design se dividen en dos
grupos según si son automatizables sin credenciales de usuario real.

## Checks 1 a 4 — automatizados, correr el script

```
cd backend
node scripts/post-deploy-smoke-matriz-permisos.mjs
```

Requiere `backend/.env` (o las variables de entorno del proceso) apuntando
a la base real que se acaba de migrar, con `DATABASE_URL_MASTER` seteada. El
script es **solo lectura** (`SELECT`), no crea ni borra nada — se puede
correr las veces que haga falta.

Verifica, contra master y contra cada tenant activo:

1. `usuario_cliente_modulos` (master) sin ninguna fila `modulo='SOPORTE'`.
2. `tipos_ticket.modulo` (cada tenant) sin ningún `'SOPORTE'`.
3. `tipos_ticket.codigo='SOPORTE'` sigue existiendo (no se tocó — WARN, no
   FAIL, si un tenant particular lo borró/renombró a mano antes del deploy).
4. El último ticket conocido de tipo `SOPORTE` sigue numerando con el
   prefijo `SOP-AAAA-NNNNN`. Es una lectura del último ticket EXISTENTE, no
   crea un ticket nuevo — la confirmación definitiva de que un ticket
   NUEVO también numera así es el paso manual 4 de abajo.

Si el script termina con exit code distinto de 0, alguno de los 4 checks
falló: no continuar con el resto del checklist de deploy hasta entender por
qué (ver §3 del design, riesgos G3/G4).

## Checks 5 y 6 — manuales, requieren login real

Estos dos checks del design necesitan una sesión de navegador con
credenciales reales de producción. No se automatizan: no hay forma segura
de scriptear un login contra producción sin exponer o hardcodear un
secreto, y son solo 2 verificaciones puntuales.

### Check 5 — el TECNICO real conserva sus permisos

1. Login en la app con el usuario TECNICO real de producción
   (`rbac-produccion-verificado`, #2217: hay 1 TECNICO activo).
2. Confirmar que puede seguir haciendo lo mismo que hacía antes del deploy:
   crear/ver/asignar tickets, ver equipos, ver compras (solo lectura), ver
   edilicia, ver KB. Ningún botón que antes tenía debería haber
   desaparecido.
3. Si hay forma de inspeccionar el JWT (devtools → Application → o loguear
   el payload decodificado), confirmar que `permisos[]` coincide con las
   celdas listadas en el requisito S15 del spec (`TICKETS:*` completo,
   `EDILICIA:*` completo, `EQUIPOS:*` completo, `COMPRAS:LECTURA` solo,
   `KB:*` completo, `DASHBOARD:LECTURA`).

### Check 6 — un ADMINISTRADOR sigue viendo `/admin`

1. Login con un usuario ADMINISTRADOR real de producción.
2. Confirmar que el link `/admin` sigue visible en el nav (S16 del spec —
   es el hallazgo de mayor riesgo de R7: si `admin-access.ts` no se
   actualizó en el mismo commit que se eliminó `cliente:gestionar`, este
   link desaparece).
3. Entrar a Usuarios → abrir la grilla de permisos de un usuario cualquiera
   y confirmar que se ve toda tildada y deshabilitada (R2 — el
   ADMINISTRADOR bypasea, no tiene filas propias en la matriz).

## Si algo falla

- Checks 1-4 (script): parar el checklist de deploy, no avanzar a
  habilitar tráfico real hasta diagnosticar. Ver design §3 "Rollback de 3"
  (los `UPDATE` inversos del rename ya están escritos, no improvisar).
- Checks 5-6 (manual): un 403 inesperado en el TECNICO es el riesgo G2 del
  design (gate nuevo donde antes no había ninguno) — revisar el backfill.
  Un ADMINISTRADOR sin `/admin` es la regresión de R7 sobre
  `cliente:gestionar` — revisar que `admin-access.ts` esté en el mismo
  build que el backend desplegado.

## Reactivación de un tenant (S19, fix post-verify C3)

`ReactivarClienteUseCase` (`PATCH /clientes/:id/reactivar`, exclusivo ROOT)
corre `prisma migrate deploy` contra la DB del tenant reactivado ANTES de
persistir el flip a `activo=true` (mismo mecanismo — `ITenantMigrationRunner`
— que usa el alta de cliente, PR7). Esto cierra el hueco de un tenant que
estaba INACTIVO durante ESTE deploy: `scripts/migrate-tenants.js` solo
fan-outea a tenants `activo=true`, así que un tenant inactivo se queda con
`tipos_ticket.modulo='SOPORTE'` (sin la migración `rename_modulo_soporte_a_tickets`)
hasta que algo corra sus migraciones pendientes — antes de este fix, nada lo
hacía, y el filtrado por módulo devolvía 0 resultados EN SILENCIO.

Si `migrate deploy` falla durante la reactivación, la operación entera falla
(el cliente NO queda marcado `activo=true` con un schema desactualizado) — es
el comportamiento esperado: mejor un error visible acá que el hueco
silencioso de antes. Test de regresión:
`backend/src/clientes/application/use-cases/reactivar-cliente.use-case.spec.ts`.

## Qué NO cubre este documento

WU-9 (`DROP TABLE roles_permisos/permisos/usuario_cliente_modulos`, el
"Paso 5 · Contract" del design) es un deploy POSTERIOR, después de un
período de observación con estos 6 checks en verde. Ver
`backend/scripts/drop-legacy-rbac-matriz-vieja.sql` y `.mjs` — preparados,
NO aplicados, requieren invocación manual explícita, y ahora (fix post-verify
C2) requieren además que el deploy incluya el retiro del JOIN
`rol.rolesPermisos` en `PrismaMembresiaRepository`/`PrismaRoleRepository` —
sin eso, el DROP tumba el login (500 en cada login/switch/refresh). Ver el
header de `drop-legacy-rbac-matriz-vieja.sql` para el detalle.
