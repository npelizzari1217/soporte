# Delta for Frontend Auth

> Change: `idle-session-timeout` | Capability: `frontend-auth`
> Base spec: `openspec/specs/frontend-auth/spec.md` (no se modifican requirements existentes)
> Non-goals (ver proposal): draft-save de formularios en curso; validación server-side de última actividad (sin endpoint/columna nuevos).

## ADDED Requirements

### Requirement: Auto-logout por inactividad tras 15 minutos

El sistema MUST cerrar la sesión automáticamente cuando no detecta actividad (mousemove, keydown, click, scroll) durante `IDLE_TIMEOUT_MS` (900000 ms), con debounce para no reiniciar el timer por cada evento individual.

#### Scenario: Sin interacción durante 15 minutos dispara el flujo de corte
- GIVEN un usuario autenticado sin interacción de mouse/teclado/scroll
- WHEN transcurren 15 minutos consecutivos sin ningún evento de actividad
- THEN el sistema MUST iniciar el flujo de corte de sesión (aviso + logout)

#### Scenario: Actividad durante la fase activa (aviso NO visible) reinicia el conteo
- GIVEN un usuario autenticado con el timer corriendo y el modal de aviso NO visible
- WHEN ocurre un evento de mousemove, keydown, click o scroll
- THEN el sistema MUST reiniciar el contador de inactividad a 0 (sujeto a debounce/throttle)

#### Scenario: Durante el aviso, la actividad pasiva NO reinicia el conteo (ADR-8 — seguridad)
- GIVEN el modal de aviso está visible (últimos `WARNING_BEFORE_MS` antes del corte)
- WHEN ocurre actividad pasiva (mousemove, scroll, keydown) SIN clic en "Seguir conectado"
- THEN el sistema MUST NOT reiniciar el contador ni cerrar el modal
- AND el corte MUST proceder salvo que el usuario haga clic explícito en "Seguir conectado"
- Rationale: durante el aviso, solo la intención explícita mantiene la sesión. Evita que el jitter del mouse o una vibración mantengan viva una estación desatendida, que es el propósito mismo de la feature. Decisión ratificada por el usuario (2026-07-15) y coherente con `design.md` ADR-8.

---

### Requirement: Aviso de cuenta regresiva antes del corte

El sistema MUST mostrar un modal con countdown visible `WARNING_BEFORE_MS` (60000 ms) antes del corte —a los 14 minutos de inactividad— decrementando cada segundo.

#### Scenario: A los 14 minutos de inactividad aparece el modal con countdown
- GIVEN un usuario autenticado sin actividad desde hace 14 minutos
- WHEN se cumple el umbral `IDLE_TIMEOUT_MS - WARNING_BEFORE_MS`
- THEN el sistema MUST mostrar un modal de aviso con countdown inicial de 60 segundos

#### Scenario: El countdown decrementa cada segundo
- GIVEN el modal de aviso está visible con countdown en 60
- WHEN transcurre 1 segundo sin interacción
- THEN el countdown MUST mostrar 59
- AND MUST seguir decrementando cada segundo hasta 0 o hasta interacción del usuario

---

### Requirement: "Seguir conectado" reinicia la sesión sin re-login

El sistema MUST permitir cancelar el corte mediante un clic en "Seguir conectado" dentro del modal de aviso.

#### Scenario: Clic en "Seguir conectado" reinicia el timer y cierra el modal
- GIVEN el modal de aviso está visible con countdown activo
- WHEN el usuario hace clic en "Seguir conectado"
- THEN el sistema MUST reiniciar el timer de inactividad a 0
- AND el modal MUST cerrarse
- AND la sesión MUST continuar sin pedir credenciales nuevamente

---

### Requirement: Corte real de sesión al agotarse el countdown

El sistema MUST ejecutar un logout real y verificable cuando el countdown llega a 0 sin interacción.

#### Scenario: Countdown llega a 0 → logout real + redirect
- GIVEN el modal de aviso está visible con countdown en 0
- WHEN no hubo ninguna interacción durante el countdown
- THEN el sistema MUST invocar `POST /api/auth/logout` (revoca `rt` server-side y limpia cookies `at`/`rt`)
- AND MUST redirigir a `/login`

#### Scenario: No debe quedar refresh silencioso posible tras el corte
- GIVEN el logout por inactividad se ejecutó y las cookies fueron eliminadas
- WHEN cualquier request subsiguiente llega al middleware o al proxy `/api/[...path]`
- THEN el sistema MUST tratar al usuario como no autenticado
- AND MUST NOT emitir un nuevo `at` a partir de un `rt` ya revocado

---

### Requirement: No-op del timer sin sesión autenticada

El sistema MUST NOT correr el timer de inactividad cuando no hay usuario autenticado.

#### Scenario: user es null → el timer no se inicia
- GIVEN `user === null` en el contexto de sesión
- WHEN el `IdleTimeoutProvider` se monta
- THEN el sistema MUST NOT registrar listeners de actividad ni iniciar timer alguno

#### Scenario: isLoading en true → el timer espera a resolver
- GIVEN `isLoading === true` mientras se resuelve la sesión
- WHEN el `IdleTimeoutProvider` se monta
- THEN el sistema MUST NOT iniciar el timer hasta que `isLoading` sea `false` y `user` sea no-nulo

---

### Requirement: Sincronización de inactividad entre pestañas

El sistema MUST propagar tanto la actividad como el corte de sesión a todas las pestañas abiertas del mismo navegador.

#### Scenario: Actividad en una pestaña resetea el timer en las demás
- GIVEN dos o más pestañas abiertas con la misma sesión autenticada
- WHEN se detecta actividad en una de las pestañas
- THEN el sistema MUST reiniciar el timer de inactividad en TODAS las pestañas abiertas

#### Scenario: El corte en una pestaña se propaga a todas
- GIVEN dos o más pestañas abiertas con la misma sesión
- WHEN el countdown llega a 0 y se ejecuta el logout en una pestaña
- THEN el sistema MUST propagar el estado de sesión cerrada a las demás pestañas
- AND las demás pestañas MUST redirigir a `/login`

---

### Requirement: Persistencia de última actividad ante refresh o remount

El sistema MUST inicializar el reloj de inactividad desde el timestamp de última actividad persistido, no desde `Date.now()` en cada montaje.

#### Scenario: Refresh a los 10 minutos de inactividad no resetea el conteo
- GIVEN el usuario lleva 10 minutos sin actividad y navega o refresca la página
- WHEN el componente que gestiona el idle-timeout se vuelve a montar
- THEN el sistema MUST leer el timestamp de última actividad persistido
- AND el conteo MUST continuar desde esos 10 minutos, no reiniciar a 0

#### Scenario: Timestamp persistido ya supera el umbral al montar
- GIVEN el timestamp persistido indica más de 15 minutos transcurridos
- WHEN el componente se monta
- THEN el sistema MUST disparar el flujo de corte inmediatamente, sin esperar un nuevo ciclo de 15 minutos

---

### Requirement: Constantes de configuración del idle-timeout

El sistema MUST definir los umbrales de tiempo como constantes centralizadas, no como valores hardcodeados dispersos.

#### Scenario: IDLE_TIMEOUT_MS y WARNING_BEFORE_MS están centralizados
- GIVEN el módulo de configuración de idle-timeout
- WHEN se referencian los umbrales de corte y aviso en cualquier parte del flujo
- THEN `IDLE_TIMEOUT_MS` MUST valer `900000` (15 min)
- AND `WARNING_BEFORE_MS` MUST valer `60000` (60 s)
- AND ambos valores MUST derivarse de un único punto de definición (sin literales repetidos)
