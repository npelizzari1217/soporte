-- WU-4 (sdd/matriz-permisos-por-usuario). Ref spec R7 (mapeo permiso→celdas).
-- Ref design §3 Paso 2 (Bloques A/B/C).
--
-- Puebla `usuario_cliente_permisos` con el criterio "expandir, no
-- interpretar" (#2212): cada permiso viejo (roles_permisos) y cada módulo
-- viejo (usuario_cliente_modulos) se traducen a las celdas nuevas SIN
-- inventar acceso nuevo ni recortar el actual. Verificado contra la matriz
-- RBAC real de producción (#2217): 4 usuarios, 43 pares rol→permiso, los 4
-- usuarios con los 4 módulos asignados.
--
-- Cero efecto de runtime: nadie lee esta tabla hasta que WU-7 despliegue
-- resolverScope/AccionesGuard sobre ella. Reversible con
-- `DELETE FROM usuario_cliente_permisos` (mapa de reversibilidad, tasks).
--
-- ADMINISTRADOR (R2): 0 filas. El bypass de resolverScope le materializa
-- PARES_VALIDOS completo sin leer esta tabla — por eso los tres bloques
-- excluyen explícitamente `r.codigo <> 'ADMINISTRADOR'`. Ausente en el SQL
-- ilustrativo del design; agregado acá porque sin el filtro, un
-- ADMINISTRADOR con roles_permisos completo (21/21) y módulos asignados
-- generaría filas — contradice R2 y el propio resumen del design
-- ("ADMINISTRADOR: 0 filas de backfill").
--
-- Totales esperados post-migración contra #2217 (2 clientes, 4 usuarios: 2
-- ADMINISTRADOR, 1 TECNICO, 1 COLABORADOR, 0 USUARIO):
--   - 2 ADMINISTRADOR → 0 filas cada uno.
--   - 1 TECNICO → 24 celdas (ver backfill-matriz-permisos.integration.spec.ts,
--     incluye COMPRAS:LECTURA vía el eje de módulos — desvío documentado en
--     ese spec, TECNICO retiene el módulo aunque perdió compra:gestionar/
--     aprobar en la migración 20260813130000).
--   - 1 COLABORADOR → 15 celdas.
--   - 0 USUARIO en prod (sin membresías activas), la regla igual lo cubriría
--     si existiera: TICKETS:{ALTAS,COMENTAR,LECTURA}, EDILICIA:{ALTAS,LECTURA},
--     KB:LECTURA, más LECTURA de EQUIPOS/COMPRAS si el módulo está asignado.

-- ─── Bloque A: celdas que SÍ intersectan usuario_cliente_modulos (COMPRAS, EDILICIA, EQUIPOS) ──
INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
SELECT DISTINCT m.usuario_id, m.cliente_id, x.modulo, x.accion
FROM membresias m
JOIN roles r ON r.id = m.rol_id
JOIN roles_permisos rp ON rp.rol_id = m.rol_id
JOIN permisos p ON p.id = rp.permiso_id
JOIN usuario_cliente_modulos ucm
     ON ucm.usuario_id = m.usuario_id AND ucm.cliente_id = m.cliente_id
JOIN (VALUES
  ('compra:gestionar','COMPRAS','ALTAS'),
  ('compra:gestionar','COMPRAS','MODIFICACION'),
  ('compra:gestionar','COMPRAS','BORRADO'),
  ('compra:aprobar','COMPRAS','APROBACION'),
  ('equipo:gestionar','EQUIPOS','ALTAS'),
  ('equipo:gestionar','EQUIPOS','MODIFICACION'),
  ('equipo:gestionar','EQUIPOS','BORRADO'),
  ('ticket:crear','EDILICIA','ALTAS'),
  ('subtarea:actualizar','EDILICIA','ALTAS'),
  ('subtarea:actualizar','EDILICIA','MODIFICACION'),
  ('subtarea:actualizar','EDILICIA','BORRADO')
) AS x(permiso, modulo, accion) ON x.permiso = p.codigo AND x.modulo = ucm.modulo
WHERE m.activo = true AND m.deleted_at IS NULL
  AND r.codigo <> 'ADMINISTRADOR'
ON CONFLICT DO NOTHING;

-- ─── Bloque B: LECTURA de COMPRAS/EQUIPOS/EDILICIA para toda membresía activa con el módulo asignado ──
-- Estos tres módulos ya tienen ModulosGuard hoy sobre sus GET, sin permiso
-- fino de RBAC — el acceso de lectura de hoy es puramente "¿tengo el módulo
-- asignado?", independiente de qué permisos de escritura tenga o le hayan
-- retirado. Traducción fiel de ese comportamiento actual.
INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
SELECT DISTINCT m.usuario_id, m.cliente_id, ucm.modulo, 'LECTURA'
FROM membresias m
JOIN roles r ON r.id = m.rol_id
JOIN usuario_cliente_modulos ucm
     ON ucm.usuario_id = m.usuario_id AND ucm.cliente_id = m.cliente_id
WHERE m.activo = true AND m.deleted_at IS NULL
  AND r.codigo <> 'ADMINISTRADOR'
  AND ucm.modulo IN ('COMPRAS','EQUIPOS','EDILICIA')
ON CONFLICT DO NOTHING;

-- ─── Bloque C: módulos SIN gate de módulo hoy (TICKETS, KB, DASHBOARD) — mapeo directo de RBAC ──
INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
SELECT DISTINCT m.usuario_id, m.cliente_id, x.modulo, x.accion
FROM membresias m
JOIN roles r ON r.id = m.rol_id
JOIN roles_permisos rp ON rp.rol_id = m.rol_id
JOIN permisos p ON p.id = rp.permiso_id
JOIN (VALUES
  ('ticket:crear','TICKETS','ALTAS'),
  ('ticket:comentar','TICKETS','COMENTAR'),
  ('ticket:editar','TICKETS','MODIFICACION'),
  ('ticket:transicionar','TICKETS','TRANSICIONAR'),
  ('ticket:asignar','TICKETS','ASIGNAR'),
  ('ticket:observar','TICKETS','OBSERVAR'),
  ('ticket:ver_todos','TICKETS','VER_TODOS'),
  ('ticket:ver_todos','KB','VER_TODOS'),
  ('ticket:ver_todos','DASHBOARD','LECTURA'),
  ('kb:gestionar','KB','ALTAS'),
  ('kb:gestionar','KB','MODIFICACION'),
  ('kb:gestionar','KB','BORRADO'),
  ('kb:gestionar','KB','PUBLICAR')
) AS x(permiso, modulo, accion) ON x.permiso = p.codigo
WHERE m.activo = true AND m.deleted_at IS NULL
  AND r.codigo <> 'ADMINISTRADOR'
ON CONFLICT DO NOTHING;

-- ─── Reglas universales: TICKETS:LECTURA y KB:LECTURA a TODA membresía activa no-admin ──
-- Ninguno de los dos módulos tiene ModulosGuard hoy: cualquiera con
-- membresía activa ya puede leerlos (R7, "reglas universales").
INSERT INTO usuario_cliente_permisos (usuario_id, cliente_id, modulo, accion)
SELECT DISTINCT m.usuario_id, m.cliente_id, u.modulo, 'LECTURA'
FROM membresias m
JOIN roles r ON r.id = m.rol_id
JOIN (VALUES ('TICKETS'), ('KB')) AS u(modulo) ON true
WHERE m.activo = true AND m.deleted_at IS NULL
  AND r.codigo <> 'ADMINISTRADOR'
ON CONFLICT DO NOTHING;
