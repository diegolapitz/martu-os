# Martu OS — Dirección 3a

Estado: dirección visual definitiva, implementada desde `Rediseño de sitio Vercel.zip`.

## Fuente de verdad

La referencia normativa es la opción `#t3` de
`.tmp/redesign-reference-20260902/Martu OS - Direcciones visuales.dc.html`,
complementada por `IMPLEMENTACION-3a.md`. Los PNG incluidos sirven para
comparación y QA; nunca se incrustan como interfaz.

El rediseño cambia presentación y ergonomía, no el producto: se preservan las
rutas, datos Supabase, CRUD, deep links, calendario, notificaciones y agente.

## Dirección

Un sistema operativo creativo, calmo y muy legible. El 85% de la pantalla es
neutral. El color tiene significado: identidad de cliente, urgencia real o
presencia acotada de la Supervisora. La jerarquía surge de tipografía,
alineación, densidad y separadores; no de tarjetas decorativas.

- Canvas gris frío `#EEF0ED`, superficies blancas y activo `#E7ECE6`.
- Tinta `#16181A`; secundarios `#565E62` y `#5F686D`.
- Bordes `#E2E6E1`, sin sombras en la estructura.
- UI en Schibsted Grotesk; fechas, conteos y overlines en IBM Plex Mono.
- Botón primario negro. Lima Supervisora `#C9F24E` como máximo dos veces por pantalla.
- Sin serif, cursivas, beige, gradientes, grandes superficies negras ni radios inflados.

## Identidad de clientes

El identificador es un tile cuadrado más el nombre visible. Valores canónicos:

| Cliente | Tile | Color |
| --- | --- | --- |
| Gavilán | Gv | `#4F7157` |
| Luma Estudio | Lu | `#9A755F` |
| Casa Norte | CN | `#A16947` |
| Brava Fit | BF | `#A54936` |
| Nido | Ni | `#6D6A85` |

Un color persistido válido puede reemplazar el canónico. Si existe logo subido,
el tile muestra esa imagen con recorte uniforme; si no, usa las iniciales.

## Gramática por superficie

- **Shell:** sidebar blanca de 206 px, topbar de 56 px, regla superior de 3 px,
  destinos operativos y registro de clientes separado.
- **Mi día:** fecha, tres conteos, foco actual con rail del cliente, tres
  prioridades y rail lateral de agenda/atención.
- **Trabajo:** toolbar compacta y registro con columnas Trabajo · Cliente ·
  Estado · Vence. Todo CRUD sigue disponible sin IA.
- **Cliente:** cabecera de identidad, acciones directas y tabs continuos para
  Resumen, Estrategia, Ideas, Guiones, Contenido, Calendario, Métricas y Pauta.
- **Calendario:** grilla mensual compacta, filtro por cliente y barra segmentada
  de carga visible.
- **Supervisora:** misma base neutral; lima sólo en marca/foco. Conversaciones,
  pendientes y memoria son listas planas y editables.
- **Onboarding:** flujo centrado, corto y funcional. Los logos se eligen desde
  archivos/cámara, se previsualizan, recortan y guardan en la nube.

## Responsive y accesibilidad

- Sidebar compacta entre 761–1180 px; navegación inferior bajo 760 px.
- Una sola columna móvil, sin overflow horizontal, con dock y navegación fija
  reservando espacio real.
- Objetivo táctil mínimo 44 px en móvil; foco visible; iconos Lucide con nombre
  accesible; el color nunca es el único identificador.
- Transiciones de 120–180 ms y anulación con `prefers-reduced-motion`.
- No hay loaders de pantalla completa: el shell y la geometría permanecen.

## Criterio de aceptación

Comparación visual a igual viewport contra la referencia, navegación desktop y
móvil, CRUD y carga de logo reales, cero errores de consola, cero overflow,
lint, tipos, tests, evals, E2E y build antes del deploy.
