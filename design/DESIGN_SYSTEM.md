# Martu OS V1: sistema visual

Referencias de producción:

- `concepts/v1-client-workspace.png`
- `concepts/v1-mobile-system.png`

## Dirección

Martu OS es un espacio de trabajo operativo, calmo y rápido. El canvas es blanco
o gris frío, la jerarquía es tipográfica y el cobalto aparece solamente para
acción, selección y foco. La interfaz prioriza listas, documentos y paneles con
relaciones claras. Las tarjetas son contenedores puntuales, no la estructura por
defecto.

## Principios

1. El shell nunca desaparece durante una navegación.
2. Cada pantalla tiene una acción primaria evidente y un solo título principal.
3. Las entidades mantienen contexto, estado y linaje visibles.
4. Los cambios frecuentes reciben respuesta optimista y confirmación local.
5. Desktop, tablet y mobile muestran el mismo sistema, no versiones separadas.

## Tokens

- Canvas: `#F7F8FB`.
- Superficie: `#FFFFFF`.
- Superficie secundaria: `#F2F4F7`.
- Tinta: `#101828`.
- Texto secundario: `#667085`.
- Texto tenue: `#98A2B3`.
- Cobalto: `#155EEF`.
- Cobalto activo: `#004EEB`.
- Cobalto suave: `#EAF2FF`.
- Línea: `#E4E7EC`.
- Línea fuerte: `#D0D5DD`.
- Éxito: `#067647` y superficie `#ECFDF3`.
- Aviso: `#B54708` y superficie `#FFFAEB`.
- Error: `#B42318` y superficie `#FEF3F2`.
- Radios: 6, 8, 10 y 12 px. Las cápsulas se reservan para estados y filtros.
- Sombras: ninguna en el canvas. Elevación suave en drawer, modal y menú flotante.
- Espaciado base: 4 px; escala 4, 8, 12, 16, 20, 24, 32, 40, 48 y 64.
- Movimiento: 140 a 200 ms. Respetar `prefers-reduced-motion`.

## Tipografía

- Toda la aplicación usa `Manrope Variable` con fallback sans.
- No se usan serif, cursiva decorativa ni tipografía manuscrita.
- H1 de pantalla: 40 a 48 px desktop, 30 a 36 px mobile.
- Título de cliente: 28 a 34 px.
- Título documental: 24 a 30 px.
- Cuerpo: 14 a 16 px con interlínea 1.5.
- Chrome y metadata: 12 a 13 px con interlínea 1.35.
- Controles heredan Manrope de forma explícita.

## Layout

- Referencia desktop: 1440 x 900.
- Sidebar: 216 px, fija dentro del viewport y con borde derecho.
- Topbar: 64 px, persistente, con búsqueda y acciones globales.
- Canvas: ancho flexible, nunca depende de un `min-width` que genere overflow.
- Drawer IA: 400 px desktop y pantalla completa mobile.
- Bajo 1180 px: sidebar compacta de 84 px y etiquetas ocultas.
- Bajo 760 px: topbar compacta y navegación inferior de cinco destinos.
- El contenido conserva padding de 16 px en 390 px de ancho.

## Navegación

La navegación primaria contiene, en este orden:

1. Mi día
2. Trabajo
3. Clientes
4. Calendario
5. Supervisor

Integraciones y Configuración son utilidades secundarias. El destino activo usa
`aria-current="page"`, fondo cobalto suave e icono cobalto. Los enlaces se
precargan al recibir hover o foco. Una línea de progreso discreta comunica la
navegación pendiente sin reemplazar el shell.

## Familias de componentes

- Marca tipográfica `martu / os`.
- Iconos Lucide outline entre 1.6 y 1.9 px.
- Botón primario cobalto, secundario delineado y acción quieta de texto.
- Filas de trabajo con estado, cliente, vencimiento y acceso a la entidad.
- Tabs con subrayado cobalto; chips solamente para filtros y estados.
- Documento abierto con autosave, metadata y rail contextual.
- Drawer IA integrado, mensajes contenidos y enlaces a entidades.
- Skeletons locales que preservan el shell y la geometría de la pantalla.
- Feedback local con texto y color, nunca solamente color.

## Accesibilidad

- Foco visible con anillo cobalto de 3 px y separación de 2 px.
- Área táctil mínima de 40 x 40 px; 44 px en la navegación mobile.
- Contraste AA como piso para texto y controles.
- Botones de icono con nombre accesible.
- Paneles cerrados no permanecen dentro del orden de foco.
- Estados de carga y navegación se anuncian sin mover el foco.
- `prefers-reduced-motion` desactiva transiciones no esenciales.

## Tratamiento de assets

Los conceptos son referencias, no imágenes embebidas. Textos, controles, datos,
listas, estados y diagramas se implementan como UI nativa. No se usan gradientes,
texturas ni ilustraciones decorativas en el shell.
