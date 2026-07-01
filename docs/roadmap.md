# Hoja de Ruta Integral

## Contexto y proposito

Este documento describe la hoja de ruta completa para el kit opencode-sdd-kit, un
conjunto de herramientas y habilidades para desarrollo guiado por especificaciones
(Spec-Driven Development). El proyecto incluye seis herramientas TypeScript en
tools/, seis habilidades Markdown en skills/, diez comandos en commands/, reglas
compartidas en skills/rules/, plantillas en templates/, y una suite de pruebas en
tools/test/. Hasta ahora se han implementado nueve fases de pruebas con 138 tests
pasando en aproximadamente un segundo, un proceso de CI en GitHub Actions, y un
lote de correcciones de bugs que abordo ocho problemas en ocho archivos.

Quedan pendientes: la completitud de las seis habilidades segun las historias de
usuario originales, la adicion de compuertas de fase en cuatro comandos, la
cobertura de pruebas de alto riesgo, una funcionalidad mayor llamada 3.2
(Discovery and Complexity Routing con Express Mode), y un bug de concurrencia
que afecta la escritura simultanea de archivos de estado.

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

## Fase A: Completitud de habilidades (Domain Layer)

Las seis habilidades en skills/ fueron actualizadas durante la Fase 2.2 pero
se identificaron vacios respecto a las historias de usuario originales. Cada
tarea en esta fase incluye la creacion de pruebas antes de la modificacion del
archivo SKILL.md.

### A-1: speckit-constitution

Vacios identificados: flujo de propuesta conversacional ausente, despacho de
subagentes no implementado, anotaciones de limite ausentes, reglas compartidas
no referenciadas, y sintaxis @mention no utilizada.

La prueba escribira un test de integracion que verifique que la habilidad
propone estructura antes de crear archivos. Luego se agregara la seccion de
propuesta conversacional al SKILL.md siguiendo el patron que ya usan
speckit-spec-writer y speckit-plan-engineer. Despues se anadiran referencias a
skills/rules/ y la sintaxis @mention para subagentes.

### A-2: speckit-spec-writer

Vaclos identificados: despacho de subagentes para investigacion durante la
escritura de especificaciones, y sintaxis @mention.

La prueba verificara que la habilidad menciona la capacidad de delegar
investigacion a subagentes. La implementacion agregara una seccion en el paso
de generacion que describe cuando y como usar subagentes para resolver
ambiguedades. La sintaxis @mention se agregara a la seccion de referencia.

### A-3: speckit-plan-engineer

Vaclos identificados: anotaciones de limite incompletas (mencion conceptual
pero no el formato _Boundary: ComponentName_), y sintaxis @mention.

La prueba verificara que el formato _Boundary: ComponentName_ aparece en el
SKILL.md. La implementacion agregara ejemplos concretos del formato de
anotacion en la seccion de tareas y en la lista de verificacion de calidad.

### A-4: speckit-task-decomposer

Vaclos identificados: carga de domain-map.md ausente en el paso de contexto,
despacho de subagentes para validacion de grafos de dependencia complejos, y
sintaxis @mention.

La prueba verificara que el paso de carga de contexto incluye domain-map.md.
La implementacion agregara la lectura de domain-map.md en el Paso 1 y anadira
la capacidad de delegar validacion de dependencias a subagentes.

### A-5: speckit-implementer

Vaclos identificados: flujo de propuesta conversacional ausente, anotaciones
de limite ausentes, reglas compartidas no referenciadas, y sintaxis @mention.

La prueba verificara que la habilidad incluye una seccion de propuesta antes
de la ejecucion. La implementacion agregara un paso de propuesta similar al
de speckit-spec-writer, referencias a skills/rules/, y el formato de
anotacion de limite.

### A-6: speckit-reviewer

Vaclos identificados: despacho de subagentes para revision paralela de
artefactos, reglas compartidas no referenciadas, y sintaxis @mention.

La prueba verificara que la habilidad menciona la capacidad de revisar
artefactos en paralelo mediante subagentes. La implementacion agregara un
paso de despacho de subagentes y referencias a las reglas compartidas.

## Fase B: Compuertas de fase en comandos

Cuatro comandos en commands/ carecen de la compuerta de fase que los otros
seis comandos ya tienen. La compuerta consiste en llamar a speckit-validate
y leer spec.json antes de proceder con la operacion principal.

### B-1: audit.md

Estado actual: llama a speckit-validate pero no verifica el resultado ni lee
spec.json. La compuerta debe verificar que existe al menos una caracteristica
en el proyecto antes de ejecutar la auditoria. Tambien debe comprobar que el
directorio de trabajo es un proyecto valido.

### B-2: clean.md

Estado actual: no tiene ninguna validacion previa. La compuerta debe verificar
que el proyecto tiene caracteristicas antes de escanear. Ademas la variable
$ARGUMENTS debe moverse antes del bloque de instrucciones para mantener
consistencia con el resto de comandos.

### B-3: review.md

Estado actual: llama a speckit-validate pero no verifica aprobaciones en
spec.json. La compuerta debe leer spec.json y verificar que al menos un
artefacto existe antes de proceder con la revision.

### B-4: spec.md

Estado actual: no lee spec.json antes de crear una nueva especificacion.
La compuerta debe verificar si ya existe una especificacion para la
caracteristica actual y advertir al usuario antes de sobrescribir.

## Fase C: Cobertura de pruebas de alto riesgo

Los siguientes vacios en la cobertura de pruebas fueron identificados durante
la auditoria de codigo. Cada uno representa un riesgo de regresion si no se
aborda.

### C-1: Ruta de error sin directorio de trabajo

Cuatro herramientas (speckit-scaffold, speckit-validate, speckit-audit,
speckit-clean) no tienen pruebas para el caso donde context.worktree esta
vacio o es nulo. La prueba debe pasar un worktree vacio y verificar que la
herramienta devuelve un titulo "Error" y un mensaje que contiene "worktree".

### C-2: Manejo de JSON corrupto

Ninguna prueba verifica que las herramientas manejan archivos JSON malformados
en spec.json, session.json, o config.json. La prueba debe escribir JSON
invalido en estos archivos, ejecutar la herramienta correspondiente, y
verificar que el programa no lanza una excepcion sino que devuelve un valor
por defecto o un mensaje de error controlado.

### C-3: Estado parcial de steering en auditoria

La prueba de speckit-audit cubre el caso de steering completo (tres archivos)
y el caso sin steering, pero no los casos intermedios donde solo existen uno
o dos de los tres archivos. La prueba debe crear combinaciones parciales y
verificar que aparecen los hallazgos correspondientes de tipo info.

### C-4: Pruebas unitarias para funciones de entrada y salida

Las funciones readSpecJson, readSession, writeSession, getFeatureDirs, y
getLatestFeatureDir en tools/shared/types.ts solo tienen cobertura indirecta
a traves de pruebas de integracion. Se necesitan pruebas unitarias directas
que creen archivos temporales, escriban datos, los lean, y verifiquen que
los valores devueltos coinciden con lo esperado.

### C-5: Vacios en la reparacion automatica de clean

La herramienta speckit-clean tiene rutas de reparacion que no estan probadas:
la correccion de featureNumber cuando no coincide con el directorio, la
sincronizacion de session.phase con el estado real de los archivos, y la
asignacion de featureDir cuando es nulo pero existen caracteristicas.

### C-6: Falta de coincidencia de fase spec/spec.md ausente

Ni speckit-validate ni speckit-audit tienen pruebas para el caso donde
spec.json dice "spec" pero spec.md no existe. La prueba debe crear spec.json
con phase spec, omitir spec.md, y verificar que se detecta una falta de
coincidencia.

### C-7: Validacion del esquema Zod

El esquema SpecJsonSchema en types.ts no tiene pruebas de rechazo. La prueba
debe alimentar el esquema con objetos que tienen tipos incorrectos, campos
faltantes, o campos adicionales, y verificar que safeParse devuelve success
false.

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

## Fase D: Bug de concurrencia

El bug de concurrencia afecta a todas las herramientas que leen y escriben
session.json, spec.json, o config.json. Cuando dos herramientas se ejecutan en
paralelo, ambas pueden leer el mismo archivo, modificarlo, y escribirlo. La
segunda escritura sobrescribe los cambios de la primera sin integrarlos.

La solucion propuesta es usar un archivo de bloqueo atomico mediante la
creacion de un directorio temporal con fs.mkdir. Si la creacion del directorio
tiene exito, el bloqueo se adquirio. Si falla porque el directorio ya existe,
el bloqueo esta ocupado y la herramienta debe esperar o fallar rapidamente.

La implementacion requiere una funcion lock() y unlock() en shared/types.ts,
y su uso en todas las herramientas que modifican archivos de estado. Las
pruebas deben verificar que dos llamadas simultaneas no producen perdida de
datos.

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

El orden recomendado de ejecucion es:

1. Fase C, comenzando con C-1 y C-2 que son los riesgos mas altos.
2. Fase A, comenzando con A-5 (implementer) porque tiene la mayor cantidad
   de vacios y es la habilidad que mas se beneficiara de las pruebas.
3. Fase B, que es relativamente simple y tiene pocos cambios por comando.
4. Fase D, que requiere diseno pero no depende de otros cambios.
5. Fase 3.2, que es la mas compleja y se beneficia de tener todo lo anterior
   estable y probado.

## Resumen de metricas

Fase A: 6 tareas de implementacion, aproximadamente 12 pruebas nuevas.
Fase B: 4 tareas de implementacion, aproximadamente 8 pruebas nuevas.
Fase C: 7 tareas de implementacion, aproximadamente 25 pruebas nuevas.
Fase 3.2: 5 tareas de implementacion, aproximadamente 15 pruebas nuevas.
Fase D: 1 tarea de implementacion, aproximadamente 4 pruebas nuevas.

Total estimado: 23 tareas y 64 pruebas nuevas, llevando la suite de 138 a
aproximadamente 202 pruebas.
