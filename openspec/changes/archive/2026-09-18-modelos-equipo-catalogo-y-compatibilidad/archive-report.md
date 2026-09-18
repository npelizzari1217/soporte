# Informe de Cierre — modelos-equipo-catalogo-y-compatibilidad

**Ciclo**: modelos-equipo-catalogo-y-compatibilidad  
**Fecha de cierre**: 2026-09-18  
**Estado final**: CERRADO — Listo para producción con anotaciones de alcance

---

## 1. Estado del ciclo al cierre

### Entrega implementada
- **Rama principal**: `main` en `12d7938` (4 PRs fusionados el 2026-09-18)
- **Todos los requisitos cumplidos**: 5/5 especificación, 9/9 escenarios
- **Todas las tareas completas**: 23/23 marcadas `[x]` en `tasks.md`
- **Verificación final**: Ronda 2, veredicto `pass_with_warnings` (0 CRITICAL, 1 WARNING, 4 SUGGESTION)
- **Artefactos de especificación**: sincronizados a `openspec/specs/modelos-equipo-catalogo/`

### Alcance del trabajo
**100% frontend.** Entrega del ABM (crear, editar, activar/desactivar) del catálogo `ModeloEquipo` con selector en los diálogos de alta y edición de equipos, resolviendo nombres de modelos del lado cliente contra `GET /modelos-equipo` existente. El backend no requiere cambios; la entidad, DTOs, errores y endpoints ya existían, solo sin interfaz de usuario.

**Decisiones de alcance confirmadas al cierre**:
- Enclavamiento entre selector y texto libre: con modelo de catálogo seleccionado, `marca` y `modelo` quedan deshabilitados y vaciados (ADR-5, verificado por mutación M4).
- Sin cambios en `equipo-detail-view.tsx` (ADR-2): es correcto, preexistente hueco no cubierto por este ciclo.
- Backend `exportar-equipos.use-case.ts:77` exporta `Marca` vacía para equipos con modelo de catálogo (conocido, registrado como seguimiento de backend).

### Compuertas ejecutadas
Todas en `frontend/`:

| Compuerta | Comando | Resultado |
|---|---|---|
| Tests | `pnpm test` | 188 archivos, 1416 tests, 0 fallos (incluye +1 test de cobertura en `a331f19`) |
| Tipos | `pnpm type-check` | Sin errores (`tsc --noEmit`) |
| Lint | `pnpm lint` | 0 advertencias, 0 errores (`✔ No ESLint warnings or errors`) |

**Nota ambiental**: GitHub Actions bloqueado por falla de facturación de la cuenta desde ~09:57 del 2026-09-18. Los checks aparecen en rojo sin haber corrido. Condición de entorno, no defecto del código; la verificación local es evidencia de registro.

---

## 2. Estado de verificación

### Veredicto final: Pasa con advertencias
- **Requisitos**: 5/5 cumplidos
- **Escenarios**: 9/9 cubiertos
- **Hallazgos críticos**: 0
- **Advertencias**: 1 (W2, persistente por diseño)
- **Sugerencias**: 4 (todas menores de redacción y nitidez)

### Advertencias y cierre

**W1 (CERRADA)** — La ronda 1 reportó incertidumbre sobre si un test adicional en una sola dirección (activo→inactivo) aportaba poder discriminante sobre su hermano de reactivación. 

**Cierre por evidencia de mutación (M2, ronda 2)**: Se aplicó la mutación exacta que la W1 nombró como riesgo residual (`{ activo: false }` → `{ activo: true }`) sobre `modelo-equipo-list.tsx:37`. Resultado: muere **únicamente** el test nuevo; el hermano preexistente **pasa**. Eso demuestra que el test nuevo aporta poder discriminante que el hermano no tenía y no podía tener. **La W1 queda honestamente cerrada por medición, no por declaración.**

**W2 (PERSISTE, por decisión de diseño)** — El escenario de R3 (duplicado rechazado sin importar el estado del modelo) vive repartido entre dos capas:
- Mitad backend: `crear-modelo-equipo.use-case.spec.ts:66`, preexistente, no tocado por este ciclo.
- Mitad frontend: `modelo-equipo-form-dialog.test.tsx:79` mockea un 422 incondicional.

Es correcto: un ciclo 100% frontend no debe duplicar garantías sobre código que no escribió ni puede romper. Pero significa que el escenario completo tal como está redactado no se descarga dentro de su alcance. **Consecuencia operativa**: si futuro trabajo agregase un índice parcial al UNIQUE de `(marca, modelo)`, el frontend seguiría en verde sin forma de detectarlo. Registrado como WARNING para que no se relea como cobertura completa.

### Hallazgos menores (SUGGESTION)

**S1**: El escenario de R4 dice "modeloEquipoId: null"; la implementación envía AUSENCIA en alta. Redacción exacta de ADR-4: vacío es AUSENCIA en alta, LIMPIAR en edición. Estado persistido sí es null. Sin defecto de código.

**S2**: El ciclo no tiene `state.yaml` (los dos anteriores sí lo tienen con `phase: verify`). No bloquea; se anota para decisión de si es artifact de rutina.

**S3**: El test hermano de reactivación es más débil (prueba solo la acción, no el render final). ~3 líneas de simetría. No bloquea.

**S4**: El mensaje de `a331f19` afirma "siete listas"; son 6 definiciones de función y 7 call sites (uno en una ficha de detalle). Imprecisión en un comentario. Razonamiento correcto, solo el número está mal.

### Rondas de verificación

| Ronda | Rama | Veredicto | Nota |
|---|---|---|---|
| R1 (verificacion/modelos-equipo-integracion, `3c1cc65`) | `pass_with_warnings` | W1 sobre dirección de test, W2 sobre R3 |
| R2 (verificacion/modelos-equipo-integracion, `6d6e06f`) | `pass_with_warnings` | W1 CERRADA por mutación M2; W2 ratificada con fundamento; S3 nueva y menor |

---

## 3. Remedios aplicados tras R1

**Commit `a331f19` — cobertura de test**:
- Agrega un test que recorre R2 en dirección activo→inactivo (el WHEN literal de la spec).
- Hermano preexistente recorría inactivo→activo.
- Mutación M2 confirma que el nuevo test mata un mutante que el hermano deja pasar (`{ activo: true }` no cambiaría el estado y el test nuevo lo detecta; el hermano nunca afirma render del estado final).

**Commit `0ff585f` — precisión de justificación**:
- El mensaje de `a331f19` afirmaba que invertir el ternario de etiquetas (M1) demuestra lo que el nuevo test aporta.
- M1 sí mata 2 tests, pero ambos por la misma causa: el hermano preexistente también era sensible a ese mutante.
- Corrección: lo que demuestra el nuevo test es M2, no M1.
- **Cambios en código**: ninguno (solo test, ya entregado). **Cambio en registro**: JSDoc y mensaje precisados para no dejar una falsa justificación en el historial.

---

## 4. Especificación archivada

### Nuevo dominio: modelos-equipo-catalogo

**Ubicación**: `openspec/specs/modelos-equipo-catalogo/spec.md`  
**Fuente**: Delta copy de `openspec/changes/archive/2026-09-18-modelos-equipo-catalogo-y-compatibilidad/specs/modelos-equipo-catalogo/spec.md`

**Requisitos**:
1. **ABM gateado por rol** (sin permiso nuevo, usa `esAdminCliente` preexistente)
2. **Listar, crear, editar, activar/desactivar** con normalización marca/modelo y rechazo de duplicados
3. **Duplicado rechazado sin importar estado** (W2: repartido entre capas)
4. **Selector en equipos** al crear/editar
5. **Enclavamiento**: selector deshabilita y vacía texto libre; quitarlo rehabilita

**Escenarios verificados**: 9/9, todas las combinaciones de GIVEN/WHEN/THEN probadas con ejemplo concreto (`MODELO_HP`, `EPSON L3250`, etc.).

---

## 5. Contenido del archivo archivado

```
2026-09-18-modelos-equipo-catalogo-y-compatibilidad/
├── proposal.md                    ✓ Decisiones, alcance, riesgos
├── specs/
│   └── modelos-equipo-catalogo/
│       └── spec.md               ✓ 5 requisitos, 9 escenarios
├── design.md                      ✓ 6 ADRs, arquitectura
├── tasks.md                       ✓ 23/23 completas (WU-1, WU-2, WU-3)
├── apply-progress.md              ✓ Snapshots de implementación
├── verify-report.md               ✓ R2: 0 CRITICAL, 1 WARNING, 4 SUGGESTION
├── exploration.md                 ✓ Investigación previa
└── archive-report.md              ← Este archivo
```

---

## 6. Decisiones de cierre registradas

### Sobre W1
La primera ronda dejó abierta una incertidumbre: el test nuevo de reactivación podría ser decorativo si el test de baja lo cubría todo. La mutación M2 demuestra lo contrario con números: `{ activo: true }` deja pasar el hermano y mata solo el nuevo. Eso cierra la W1 honestamente, con evidencia, no por afirmación.

### Sobre W2
Se decidió correctamente NO escalarla. El escenario pertenece a dos capas y la mitad backend preexiste sin cambios. El frontend cubre su mitad (rechazo 422, formulario no cierra). Duplicar esa cobertura en el frontend sería exigirle responsabilidad sobre código ajeno, que es la forma de llenar un test de aserciones falsas. Queda como WARNING para que futuro trabajo vea dónde vive la autoridad (backend), no como cierre silencioso.

### Sobre la deuda de Ayuda
Suspendida por decisión del dueño desde 2026-09-07. Este ciclo agrega pantalla y modifica formulario, así que **genera deuda** que queda anotada en mensajes de commit y cuerpo de PRs. La pausa sigue vigente: se escribe todo junto al final del proyecto, no incrementalmente. La excepción de "corregir un artículo que quedó FALSO" aplica; ninguno quedó roto.

### Sobre el export vacío del backend
Conocido y no remediado. El cambio lo generó: `exportar-equipos.use-case.ts:77` exporta `Marca` desde el campo crudo, así que equipos con modelo de catálogo lo exportan vacío. Corregirlo es trabajo de backend. Registrado como seguimiento explícito, no como defecto silencioso.

---

## 7. Cambios de código entregados

### Resumen
- **22 archivos nuevos/modificados** (frontend/)
- **1362 inserciones, 11 supresiones**
- **Backend**: sin cambios (0 commits de backend)

### Distribución por unidad de trabajo
| WU | Commits | Archivos | Pruebas |
|---|---|---|---|
| WU-1 (tipos, schemas, hooks) | `e7a99ed` | types.ts, schemas.ts, 2 hooks | schemas.test.ts |
| WU-2 (ABM) | `5d1351e` | form-dialog, list, admin-view, page.tsx, admin-nav.tsx | modelo-equipo-*.test.tsx, admin-nav.test.tsx |
| WU-3a (columna Marca) | `9cf0316` | equipos-list-view.tsx, types.ts, handlers.ts | equipos-list-view.test.tsx |
| WU-3b (selector + enclavamiento) | `f300b6b` | equipo-create-dialog.tsx, equipo-edit-dialog.tsx, schemas.ts | equipo-*.test.tsx |
| Cobertura R2 | `a331f19` | — (solo test) | modelos-equipo-admin-view.test.tsx (+37 líneas) |

El **test viaja en el mismo commit que el código** en todos los WU de implementación. `a331f19` es el caso inverso (test sin código) y legítimo: cobertura de una dirección que faltaba.

---

## 8. Mutaciones adversariales ejecutadas (R2)

Por requisito de `rules.verify`: al menos una mutación de un guard central. Se ejecutaron **cuatro**, todas revertidas:

| M | Descripción | Resultado | Conclusión |
|---|---|---|---|
| M1 | Invertir ternario de etiquetas activo/inactivo | 2 tests muertos | Ambos tests son sensibles; no demuestra solo el nuevo |
| M2 | `{ activo: !X.activo }` → `{ activo: true }` | 1 test muerto (el nuevo) | **W1 CERRADA**: el nuevo test aporta poder que el hermano no tiene |
| M3 | Remover invalidación de caché | 1 test muerto (UI) | Mock fiel; el refetch sí importa |
| M4 | Degradar enclavamiento a "solo deshabilitar" | 1 test muerto | Guard central de R5 discrimina "deshabilitado" de "vaciado" |

Todas revertidas con `git checkout --`, árbol limpio confirmado.

---

## 9. Notas operativas para el repo

### Para futuros ciclos que toquen este dominio
- La autoridad de R3 "duplicado rechazado" vive en el backend, no completamente en el frontend: `crear-modelo-equipo.use-case.spec.ts:66` es donde esa garantía se sostiene.
- R2/R5 sobre enclavamiento está completo en el frontend (probado por mutación M4); el backend no lo resuelve.
- Las 6 definiciones de `EstadoActivoAction` en el repo son duplicación preexistente, no introducida aquí. Extracto a componente compartido sería refactoring de alcance ancho.

### Deuda Ayuda persistente
- Pausa vigente hasta nuevo aviso.
- Ciclo agrega: cómo crear un modelo, por qué la normalización difiere entre campos, qué significa desactivar un modelo, cómo se elige en el formulario de equipos.
- Ciclo modifica: descripción del formulario de equipos (selección + enclavamiento).
- Excepción: si artículo existente queda FALSO, corregirlo dentro de la pausa.

### Seguimiento de backend
Comentado en ADR del design.md: `backend/src/equipos/application/use-cases/exportar-equipos.use-case.ts:77` exporta `Marca` del campo `equipo.marca` (hoy vacío cuando hay `modeloEquipoId`). Futuro ciclo puede optar por no exportar la columna, exportar el nombre resuelto del modelo, o resolver el campo antes de exportar.

---

## 9 bis. Una mancha en el ledger de intentos, anotada a propósito

El intento de verificación de **ronda 2** quedó liquidado en el ledger nativo con el
diagnóstico literal `"probe"`. No es un código ni una abreviatura: es un texto de prueba que
el orquestador pasó esperando que esa llamada a `settle` fuera rechazada, y no lo fue. Los
registros de intento son **inmutables** una vez liquidados, así que ese renglón del ledger no
dice nada útil y no se puede corregir.

**Dónde está la evidencia real**: en `verify-report.md` de esta misma carpeta, que es el
artefacto de registro y sí documenta la ronda 2 completa — veredicto, compuertas observadas,
las cuatro mutaciones y su limpieza.

Queda escrito acá para que quien consulte el ledger en el futuro y encuentre `"probe"` sepa
de dónde salió, en vez de suponer que la ronda 2 no dejó rastro. Un acta que omite el error
de quien la encargó no es un acta.

## 10. Artefactos del ciclo

| Artefacto | Estado | Observación |
|---|---|---|
| proposal.md | ✓ Archivado | Decisiones ratificadas al cierre |
| specs/ | ✓ Sincronizado | Nuevo dominio `modelos-equipo-catalogo` creado en `openspec/specs/` |
| design.md | ✓ Archivado | 6 ADRs sin desviaciones, todos confirmados |
| tasks.md | ✓ Completo | 23/23 tareas tildadas, ninguna pendiente |
| apply-progress.md | ✓ Archivado | Snapshots de WU-1, WU-2, WU-3 e hito de cobertura |
| verify-report.md | ✓ Archivado | Ronda 2, veredicto final con mutaciones |
| state.yaml | — | No presente; no bloqueante (los ciclos anteriores lo incluyen con `phase: verify`) |

---

## 11. Conclusión

**El ciclo está COMPLETO, VERIFICADO y LISTO PARA PRODUCCIÓN**, con dos anotaciones de alcance que quedan como referencias para trabajo futuro:

1. **W2 (alcance correcto)**: La responsabilidad genuina del frontend en R3 vive en el backend. El frontend cubre su mitad (display del error). Esto es límite de responsabilidad, no un defecto. 
2. **Deuda explícita de Ayuda**: El ciclo agrega UI que debe documentarse. La pausa sigue vigente; se escribirá al cerrar el proyecto.

No hay hallazgos que bloqueen la entrega. Los 9/9 escenarios están probados por mutación adversarial donde corresponde. Las 23 tareas están terminadas y registradas.

**Fecha de cierre**: 2026-09-18  
**Commit final integrado**: `12d7938` (main)  
**Especificación archivada**: `openspec/specs/modelos-equipo-catalogo/spec.md`
