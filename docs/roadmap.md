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

## Fase 3.2: Discovery, Complexity Routing, y Express Mode

Esta es la funcionalidad mayor pendiente del plan original. No se ha iniciado
ninguna implementacion ni prueba para esta fase. El nombre 3.2 hace referencia
a la tercera fase del plan original, segunda iteracion.

### Descripcion

Discovery es la capacidad de las herramientas para descubrir automaticamente
el contexto del proyecto: detectar el framework, el gestor de paquetes, las
dependencias instaladas, la estructura de directorios, y las convenciones
existentes. Esto permite que las herramientas tomen decisiones informadas sin
preguntar al usuario cada vez.

Complexity Routing es la capacidad de evaluar la complejidad de una tarea y
seleccionar la ruta de implementacion adecuada: ruta simple para cambios
menores sin necesidad de subagentes, ruta estandar para cambios tipicos con
un ciclo TDD completo, y ruta compleja para cambios grandes que requieren
investigacion, multiples subagentes, y revision extendida.

Express Mode es un modo de operacion que omite las propuestas conversacionales
y las confirmaciones del usuario, ejecutando directamente la implementacion
con valores predeterminados. Es util para usuarios experimentados que confian
en el sistema.

### Componentes

El sistema requiere los siguientes cambios en las herramientas existentes.

Uno, una nueva funcion en shared/types.ts que detecte el contexto del proyecto:
framework principal, gestor de paquetes, archivos de configuracion existentes,
y estructura de directorios. Esta funcion debe ser llamada por las habilidades
durante la carga de contexto.

Dos, una nueva herramienta speckit-complexity.ts que reciba una descripcion de
tarea y devuelva un nivel de complejidad: simple, estandar, o complejo. La
evaluacion puede basarse en la cantidad de archivos afectados, la presencia de
dependencias externas, o la ambiguedad de la especificacion.

Tres, una actualizacion a speckit-implementer para que lea el nivel de
complejidad antes de ejecutar cada tarea y seleccione la ruta adecuada. En
modo simple, ejecuta sin subagentes. En modo estandar, ejecuta el ciclo TDD
completo. En modo complejo, despacha subagentes de investigacion.

Cuatro, una actualizacion a speckit-spec-writer y speckit-plan-engineer para
que soporten Express Mode. Cuando el modo express esta activo, las propuestas
conversacionales se omiten y los valores predeterminados se usan
automaticamente.

Cinco, pruebas de integracion para cada nivel de complejidad y para el modo
express. Las pruebas deben verificar que la ruta seleccionada corresponde al
nivel de complejidad declarado.

## Fase D: Bug de concurrencia (COMPLETO)

Implementado con acquireLock/releaseLock atomicos via fs.mkdir, withLock
helper reentrante, timeout configurable, stale lock detection, y wrappers
en las 6 herramientas. 14+ tests en locking.test.ts.

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
Fase 3.2: 5 tareas (pendiente).

Total: 24 tareas, 22 completas, 2 pendientes (Fase 3.2).
Suite actual: 374 tests en 18 archivos.
