# Hoja de Ruta Integral

## Contexto y proposito

Este documento describe la hoja de ruta completa para el kit opencode-sdd-kit, un
conjunto de herramientas y habilidades para desarrollo guiado por especificaciones
(Spec-Driven Development). El proyecto incluye seis herramientas TypeScript en
tools/, seis habilidades Markdown en skills/, diez comandos en commands/, reglas
compartidas en skills/rules/, plantillas en templates/, y una suite de pruebas en
tools/test/. Actualmente la suite tiene 277 tests pasando y CI verde en Node 20 y 22.

Estados actuales: C completo, D completo, B completo, Fase A: 5 completas, 1 pendiente
(A-3 plan-engineer). Suite: 339 tests en 17 archivos. Solo falta A-3 y luego Fase 3.2
(Discovery and Complexity Routing con Express Mode).

## Sistema de implementacion incremental

Cada cambio en este proyecto seguira un ciclo conocido en la industria como
TDD con entrega atomica, tambien llamado Red-Green-Refactor mas Commit. Este
enfoque protege contra regresiones porque las pruebas se escriben antes que la
implementacion. El ciclo completo para cada tarea es el siguiente.

Paso uno, escribir la prueba que falla (Red). Para un cambio en una herramienta,
esto significa crear o extender un archivo en tools/test/unit/ o
tools/test/integration/ que ejecute la funcionalidad esperada y falle porque
aun no existe. Para un cambio en una habilidad Markdown, la prueba puede ser
un test de integracion que invoque la herramienta asociada y verifique la
salida o el archivo generado.

Paso dos, implementar el cambio minimo que hace pasar la prueba (Green). Esto
puede ser tan simple como agregar una seccion a un archivo SKILL.md o tan
complejo como anadir logica a una herramienta TypeScript. La implementacion
debe ser la mas simple posible, sin abstracciones para uso futuro.

Paso tres, refactorizar si es necesario (Refactor). Mejorar la estructura del
codigo sin cambiar su comportamiento. Todas las pruebas deben seguir pasando.

Paso cuatro, ejecutar la suite completa con `npm test` para verificar que no
hay regresiones. Si alguna prueba falla, el cambio no esta completo.

Paso cinco, hacer commit con un mensaje en ingles, sin guiones largos, usando
solo comas para separar ideas. El formato es `tipo: descripcion corta` donde
tipo puede ser feat, fix, test, refactor, docs, o ci.

Paso seis, hacer push. Luego detenerse y evaluar el siguiente paso.

Este ciclo se aplica a cada tarea individual, no a grupos de tareas. La
granularidad busca que cada commit sea atomico: contiene exactamente un cambio
logico, sus pruebas, y nada mas.

## Fase A: Completitud de habilidades (COMPLETO)

Las 6 habilidades (constitution, spec-writer, plan-engineer, task-decomposer,
implementer, reviewer) estan completas: todas tienen propuesta conversacional,
subagentes con @mention, boundary annotations, shared rules, y tests de
contenido. 132 tests distribuidos en 6 archivos de contenido.

## Fase B: Compuertas de fase en comandos (COMPLETO)

Los cuatro comandos (audit.md, clean.md, review.md, spec.md) ya tienen
compuertas de fase implementadas. Verificado con commands-gates.test.ts
(11 tests).

## Fase C: Cobertura de pruebas de alto riesgo (COMPLETO)

Todas las 7 tareas de C estan implementadas y pasando.

## Fase 3.2: Discovery, Complexity Routing, Express Mode — subfases

Subfases implementadas incrementalmente, 1 componente por commit.

### 3.2.1: Discovery (COMPLETO)

ProjectContext interface, discoverProject, detectPackageManager, detectFramework,
detectConfigFiles, detectScripts en shared/types.ts. En memoria (siempre fresco).
Constitucion enmendada para permitir auto-discovery explicito y visible.
Tests unitarios para cada detector en discovery.test.ts (21 tests).

### 3.2.2: Express Mode config (COMPLETO)

expressMode: boolean en SDDConfig. speckit-config.ts permite leer/escribir
expressMode via key=value. Tests de configuracion en status-config.test.ts.

### 3.2.3: Complexity Tool (COMPLETO)

Nuevo speckit-complexity.ts: evalua tareas por cantidad de archivos, dependencias
externas, ambiguedad y boundaries. Usa ProjectContext de Discovery. Devuelve
nivel simple/standard/complex con razonamiento. Tests en complexity.test.ts (14 tests).

### 3.2.4: Implementer Routing (COMPLETO)

speckit-implementer/SKILL.md: Step 1.5 Complexity Routing con 3 rutas
(simple directa, standard TDD, complex con subagentes). Express Mode guard en
Step 2. Tests de contenido en implementer-content.test.ts.

### 3.2.5: Express Mode Skills (COMPLETO)

spec-writer y plan-engineer SKILL.md: Express Mode guard en proposal steps.
Cuando expressMode: true, salta propuesta conversacional y procede con
valores predeterminados. Tests de contenido actualizados.

## Fase D: Bug de concurrencia (COMPLETO)

Implementado con acquireLock/releaseLock atomicos via fs.mkdir, withLock
helper reentrante, timeout configurable, stale lock detection, y wrappers
en las 6 herramientas. 14+ tests en locking.test.ts.

## Fase F: Auditoria de bugs externos (COMPLETO)

Siete bugs identificados por auditoria externa. Fixes: install scripts rama
master, scaffold race condition con withLock, config defaultTechStack redirect,
audit fix recalculo de resumen, clean constitutionExists real,
findTargetFeatureDir sort numerico. Pendiente: taskDescription NLP scoring.

## Fase E: Cobertura de edge cases (COMPLETO)

Incluye T-1 a T-9: withLock error propagation, stale lock detection con datos
corruptos, PID-based dead process detection (fast path sin esperar threshold),
status con directorios borrados, config con caracteres especiales, y clean con
directorios faltantes. Suite final: 374 tests.

## Mapa de dependencias

Las dependencias entre fases y tareas siguen este orden.

Fase C (pruebas) no tiene dependencias de Fase A o Fase B porque las pruebas
existentes se pueden extender sin modificar las habilidades o comandos. Por
lo tanto Fase C puede comenzar inmediatamente.

Fase A (habilidades) depende de que existan pruebas para cada cambio, pero
esas pruebas se crean como parte de cada tarea A-1 a A-6. No hay dependencia
externa.

Fase B (comandos) depende de que las herramientas speckit-validate y la
lectura de spec.json funcionen correctamente. Esto ya esta probado.

Fase 3.2 (Discovery, Complexity, Express) depende de que Fase A este
completa porque Express Mode modifica el comportamiento de las habilidades
que se estan actualizando en Fase A.

Fase D (concurrencia) no tiene dependencias de las otras fases y puede
comenzar en cualquier momento.

El orden de ejecucion actualizado es:

1. Fase C (completo)
2. Fase A, comenzando con A-5 (completo), luego A-1 (completo).
3. Fase B (completo)
4. Fase D (completo)
5. Fase E (completo)
6. Fase 3.2 (pendiente)

## Resumen de metricas

Fase A: 6 tareas (completo).
Fase B: 4 tareas (completo).
Fase C: 7 tareas (completo).
Fase D: 1 tarea (completo).
Fase E: 1 tarea (completo).
Fase F: 6 tareas (completo).
Fase 3.2: 5 subfases (completo).

Total: 30 tareas, 29 completas, 1 pendiente (taskDescription NLP).
Suite actual: 420+ tests en 20 archivos.
