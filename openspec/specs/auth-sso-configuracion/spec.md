# Auth SSO Configuración — Specification

## Purpose

Definir cómo se habilita el SSO: una sola app por proveedor para toda la plataforma, configurada en el servidor; qué proveedores se ofrecen en la pantalla de login; y que en esta entrega no existe gestión de la cuenta vinculada por parte del usuario.

> **Decisión de producto citada.** `docs/roadmap-comercial.md`, sección "Decisiones de producto de la segunda etapa", viñeta "Segunda etapa, punto 7 — login con Google o Microsoft (SSO)" (ciclo en #507), viñetas de "Una sola app por proveedor" y de "Los botones están solo en la pantalla de login". Esta spec cubre D4 y D9. Trazabilidad completa en `auth-sso-login`.

## Definiciones

- **Par de configuración**: client id y client secret de un proveedor, ambos presentes y no vacíos, en el entorno del backend.
- **Proveedor habilitado**: el que tiene su par de configuración completo.

## Requirements

### Requirement: SC1 Una sola app por proveedor, configurada en el servidor

El sistema DEBE usar una única app por proveedor para toda la plataforma, configurada solo en el entorno del servidor. NO DEBE existir configuración de SSO por cliente (ni tabla, ni campo, ni pantalla, ni secreto cifrado por cliente). La URL de retorno DEBE derivarse de la URL base pública de la aplicación y del proveedor, y NO DEBE configurarse aparte ni tomarse de la petición.

#### Scenario: Sin configuración por cliente

- GIVEN el esquema de clientes y las pantallas de administración
- WHEN se inspeccionan
- THEN no hay campo, tabla ni pantalla para configurar SSO de un cliente

#### Scenario: URL de retorno derivada

- GIVEN la URL base pública `https://soporte.sesitec.net`
- WHEN se inicia el flujo de Google
- THEN el `redirect_uri` es `https://soporte.sesitec.net/api/auth/sso/google/callback`

#### Scenario: Una app sirve a todos los clientes

- GIVEN usuarios de dos clientes distintos
- WHEN ambos ingresan por el mismo proveedor
- THEN ambos usan la misma app y el cliente se elige después de entrar

### Requirement: SC2 Un proveedor sin su par de configuración queda deshabilitado

Un proveedor DEBE estar habilitado solo si su client id y su client secret están presentes y no vacíos. Con el par ausente o incompleto, el proveedor DEBE quedar deshabilitado: iniciar su flujo y completar su callback DEBEN rechazarse con la falla genérica y sin llamadas salientes. Las variables del SSO NO DEBEN ser requeridas para arrancar: la aplicación DEBE arrancar sin ellas y el ingreso con contraseña DEBE funcionar igual. Con ningún par configurado, el comportamiento del login DEBE ser el de antes del cambio.

#### Scenario: Aplicación sin variables de SSO

- GIVEN un entorno sin ninguna variable de SSO
- WHEN arranca el backend
- THEN arranca sin error y el login con contraseña funciona

#### Scenario: Par incompleto

- GIVEN un entorno con el client id de Google pero sin su secret
- WHEN se consulta el estado de los proveedores
- THEN Google figura deshabilitado

#### Scenario: Iniciar un proveedor deshabilitado

- GIVEN Microsoft deshabilitado
- WHEN se invoca el inicio del flujo de Microsoft
- THEN se rechaza con la falla genérica, sin crear estado ni llamar al proveedor

#### Scenario: Un proveedor habilitado y otro no

- GIVEN Google habilitado y Microsoft deshabilitado
- WHEN se usan ambos flujos
- THEN Google funciona y Microsoft se rechaza

### Requirement: SC3 Lista pública de proveedores habilitados

El backend DEBE exponer un endpoint público de solo lectura que devuelva únicamente los proveedores habilitados. NO DEBE devolver client ids, secrets, URLs de configuración ni el estado de los deshabilitados.

#### Scenario: Ambos habilitados

- GIVEN ambos pares de configuración completos
- WHEN se consulta el endpoint sin sesión
- THEN devuelve Google y Microsoft

#### Scenario: Solo uno habilitado

- GIVEN solo Google habilitado
- WHEN se consulta
- THEN devuelve únicamente Google

#### Scenario: Ninguno habilitado

- GIVEN ningún par configurado
- WHEN se consulta
- THEN devuelve una lista vacía

#### Scenario: Sin filtración de configuración

- GIVEN proveedores habilitados
- WHEN se inspecciona la respuesta
- THEN no contiene client id ni client secret

### Requirement: SC4 Los botones están solo en la pantalla de login y solo para proveedores habilitados

La pantalla de login DEBE mostrar un botón "Continuar con Google" y/o "Continuar con Microsoft" únicamente para los proveedores que devuelve el endpoint de SC3. Con lista vacía NO DEBE mostrarse ningún botón. Los botones DEBEN navegar al inicio del flujo (navegación completa, no una llamada asíncrona). NO DEBE haber botones de SSO en ninguna otra pantalla.

#### Scenario: Dos botones

- GIVEN el endpoint devuelve ambos proveedores
- WHEN se muestra el login
- THEN aparecen los dos botones

#### Scenario: Un solo botón

- GIVEN el endpoint devuelve solo Google
- WHEN se muestra el login
- THEN aparece únicamente "Continuar con Google"

#### Scenario: Sin botones

- GIVEN el endpoint devuelve una lista vacía o falla
- WHEN se muestra el login
- THEN no aparece ningún botón de SSO y el formulario de contraseña funciona

#### Scenario: Otras pantallas

- GIVEN las demás pantallas de la aplicación
- WHEN se inspeccionan
- THEN ninguna ofrece ingreso ni vinculación por SSO

### Requirement: SC5 El usuario no ve ni desvincula su propia cuenta

En esta entrega NO DEBE existir pantalla ni endpoint para que un usuario vea, agregue o quite su vínculo SSO. La única vía para desvincular DEBE ser el reseteo del administrador (`auth-sso-vinculo`: SV7, SV8). La interfaz de administración DEBE ofrecer "Resetear vínculo SSO" como un único botón, junto al de "Resetear 2FA", y mostrar el resultado sin distinguir por proveedor.

#### Scenario: Sin autogestión

- GIVEN un usuario con sesión
- WHEN busca ver o quitar su vínculo SSO
- THEN no existe pantalla ni ruta para hacerlo

#### Scenario: Botón del administrador

- GIVEN un administrador autorizado en el diálogo de edición de un usuario
- WHEN abre el diálogo
- THEN ve un único botón "Resetear vínculo SSO" junto a "Resetear 2FA"

#### Scenario: Reseteo desde la interfaz

- GIVEN el botón y un usuario con vínculos
- WHEN el administrador lo confirma
- THEN se invoca el reseteo único y la interfaz informa el resultado

## Trazabilidad

| # | Viñeta de la decisión (resumen) | Requerimiento(s) |
|---|---|---|
| D4 | Una sola app por proveedor para toda la plataforma, en el servidor; los clientes no configuran nada | SC1, SC2 |
| D9 | Botones solo en la pantalla de login | SC3, SC4 |
| D9 | El usuario no ve ni desvincula su cuenta; lo hace el administrador | SC5 |
