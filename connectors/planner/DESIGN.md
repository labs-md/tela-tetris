---
name: TelaTetris · Planificador
description: Sistema del asistente de planificación de tela en español, con tema claro e identidad LABS.
colors:
  bg: "#f7f8f6"
  panel: "#ffffff"
  raised: "#f1f3ee"
  line: "#dfe3db"
  muted: "#60655c"
  text: "#1c1c1b"
  yellow: "#e8fb5b"
  orange: "#f95300"
  selected: "#f7fbdc"
  focus: "#59651b"
  control-line: "#cbd1c5"
  control-hover-line: "#8b9582"
  orange-ink: "#a93600"
  pattern-dark: "#c6d64c"
  pattern-light: "#f3fca8"
  pattern-stroke: "#69715d"
typography:
  display:
    fontFamily: "Neuton, Georgia, serif"
    fontSize: "42px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.008em"
  brand:
    fontFamily: "Neuton, Georgia, serif"
    fontSize: "28px"
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
  control:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.6
rounded:
  compact: "4px"
  control: "6px"
  panel: "10px"
spacing:
  compact: "8px"
  gap: "10px"
  control: "12px"
  inset: "16px"
  mobile-panel: "18px"
  mobile: "20px"
  section: "24px"
  intermediate: "28px"
  outer: "40px"
  wizard: "32px"
components:
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
    padding: "12px 14px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    typography: "{typography.control}"
    padding: "10px 16px"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "0"
    typography: "{typography.label}"
  button-download:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    typography: "{typography.label}"
    padding: "10px 6px"
    width: "100%"
  input-quantity:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    height: "46px"
    width: "100%"
  preset:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "28px"
  preset-selected:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "28px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
  status:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.muted}"
    rounded: "{rounded.compact}"
    typography: "{typography.label}"
    padding: "4px 8px"
  status-complete:
    backgroundColor: "{colors.selected}"
    textColor: "{colors.text}"
    rounded: "{rounded.compact}"
    typography: "{typography.label}"
    padding: "4px 8px"
---

# Design System: TelaTetris · Planificador

## Overview

**Creative North Star: "La mesa de corte"**

El planificador guía una decisión a la vez con pasos numerados, paneles blancos y reglas finas sobre un fondo gris verdoso. Neuton identifica la herramienta; Inter permite comparar cantidades, medidas y unidades. El amarillo de LABS destaca la acción y la selección; el naranja señala el final medido del rollo y las piezas que lo usan en el preset.

Este sistema rige únicamente `connectors/planner`. Conserva la identidad profesional clara de LABS y registra el asistente construido en `planner.css`, `index.html` y `planner.js`. La selección, las cantidades, la revisión y el resultado comparten la misma tipografía y los mismos controles; la ruta visible y el pie de acciones permiten volver sin perder el pedido.

**Key Characteristics:**

- Paneles blancos planos, bordes finos y esquinas discretas.
- Neuton en título y marca; Inter en información, controles y compra.
- Amarillo para acción, paso activo y selección, con naranja en la geometría del tendido.
- Una tarea visible por paso, con acciones en un pie común.
- Geometría y colores del preset compartidos por muestras, tendido y descarga.

## Colors

La base clara reserva los acentos de LABS para acciones, estados y geometría.

### Primary

- **Amarillo LABS** (`yellow`): acción principal, círculo del paso activo, selección de texto y piezas delanteras.
- **Selección suave** (`selected`): fondo del preset elegido y estados de búsqueda y finalización.

### Secondary

- **Naranja LABS** (`orange`): línea discontinua del extremo del rollo y bolsillos del preset.
- **Naranja de lectura** (`orange-ink`): texto del largo final, errores y separador del pie.
- **Oliva de patrón** (`pattern-dark`) y **amarillo pálido de patrón** (`pattern-light`): espalda y manga, respectivamente, en los presets que las incluyen.

### Neutral

- **Fondo claro** (`bg`): página y botones laterales del campo de cantidad.
- **Blanco** (`panel`): paneles, campo numérico y piezas blancas del preset.
- **Gris elevado** (`raised`): estado pendiente y hover de descarga.
- **Carbón** (`text`): texto principal, controles e identidad.
- **Gris de lectura** (`muted`): ayuda, unidades secundarias y etiquetas.
- **Regla suave** (`line`): límites de paneles y divisiones internas.
- **Borde de control** (`control-line`) y **borde de hover** (`control-hover-line`): cantidades y opciones de prenda.
- **Oliva de foco** (`focus`): contorno de teclado visible sobre fondos claros.
- **Contorno de patrón** (`pattern-stroke`): separación de las piezas en muestras y canvas.

### Named Rules

**The Accent Purpose Rule.** El amarillo destaca la acción principal y los estados activos; los paneles de compra permanecen blancos. El naranja del tendido señala el extremo medido del rollo.

**The Color Continuity Rule.** Cada tipo de pieza conserva su color en la muestra, el tendido y la descarga; el color identifica geometría, no una valoración de calidad.

## Typography

**Display Font:** Neuton, con Georgia y serif como respaldo.
**Body Font:** Inter, con system-ui y sans-serif como respaldo.

Las fuentes se sirven localmente con `font-display: swap`. El contraste serif/sans identifica el portal sin introducir tipografía arcade. El peso de Inter distribuido y usado es 500; Neuton usa 400.

### Hierarchy

- **Display:** título de página; en móvil pasa a 36px.
- **Brand:** marca de cabecera; en móvil pasa a 26px.
- **Title:** encabezados de panel en Inter.
- **Body:** introducción y texto general.
- **Control:** navegación, nombres de prenda y acción principal.
- **Label:** ayuda, medidas, tallas, filas de resumen y notas.

La compra usa Inter de 42px, peso 500, interlínea 1.15 y espaciado -0.035em; en móvil pasa a 40px. Los campos y valores calculados usan cifras tabulares. El canvas usa Inter de 12px y conserva las unidades fuera de las piezas. Los párrafos de supuestos se limitan a 75ch.

### Named Rules

**The Measured Label Rule.** El canvas comprueba el espacio disponible antes de mostrar nombre y talla; omite la etiqueta cuando no cabe y conserva la geometría.

## Layout

La cabecera, el contenido y el pie comparten un ancho máximo de 1200px. El margen interior lateral es 40px en escritorio, 28px hasta 1150px y 20px hasta 760px. El ritmo combina espacios cortos para controles con separaciones de sección de 20px y 24px.

El contenido empieza con una ruta de cuatro columnas iguales, seguida del título de la tarea actual y un panel blanco. Cada paso usa un interior de 32px; un pie separado por una regla conserva Atrás, el contador y la siguiente acción en la misma posición dentro del panel. La selección presenta tres tarjetas en una fila. Las cantidades S, M, L y XL ocupan cuatro columnas con un ancho máximo de 760px. La revisión combina el pedido flexible con condiciones en una columna de 300px y una separación de 48px. El resultado combina un plano flexible con la compra de 280px, separados por 22px.

Hasta 760px, las prendas se apilan como tarjetas horizontales, las tallas forman dos columnas y la revisión pasa a una. Los pasos conservan cuatro columnas, con el número sobre la etiqueta. El interior del asistente pasa a 22px y el contador ocupa una fila del pie antes de los botones. El resultado une plano y compra dentro del panel exterior, sin bordes duplicados. La cabecera conserva marca y enlace LABS y oculta su nota descriptiva.

La altura del plano pasa de 360px a 310px en móvil. El rollo conserva su escala y se desplaza horizontalmente dentro del panel; la página no necesita ensancharse. Las muestras de patrón pasan de cinco a tres columnas. La impresión oculta ruta, título, acciones y cabecera, y apila tendido y compra.

## Elevation & Depth

Los paneles son planos, sin sombras. El blanco se separa del fondo de página mediante bordes de un píxel; las divisiones internas y los fondos suaves agrupan información. La selección usa un tono pálido y un borde oliva, sin elevar la opción.

### Named Rules

**The Flat Sections Rule.** Los paneles se distinguen por fondo, borde, espacio y tipografía, sin sombras.

## Shapes

Los paneles repiten esquinas de 10px y los botones de 6px. Estados y marco de rollo usan 4px. Los extremos del campo de cantidad usan 5px solo en sus esquinas exteriores; el centro permanece rectangular. Los iconos son SVG de trazo fino y las piezas conservan el contorno real del preset.

## Components

### Buttons

La acción principal es amarilla, con flecha SVG, altura mínima de 46px y padding de 12px 14px. En escritorio tiene ancho mínimo de 180px y se alinea al final del pie; en móvil ocupa el espacio disponible junto a Atrás. El hover usa amarillo algo más oscuro y la pulsación marca el borde en carbón. Las acciones secundarias son blancas, con borde y altura mínima de 44px; se usan para volver, agregar una prenda y empezar otro pedido. Las acciones de texto usan gris y se oscurecen al pasar el puntero. La descarga es un botón blanco con borde y altura mínima de 42px; su hover usa el fondo gris elevado.
Todos los controles interactivos comparten transiciones de color, fondo y borde de 150ms. El foco visible es un contorno oliva de 2px separado 4px. Los botones deshabilitados usan opacidad 0.45. La preferencia de movimiento reducido elimina transiciones y lleva el acomodo directamente a su posición final.

### Cards / Containers

Los paneles comparten blanco, regla fina y radio de panel. El panel del asistente usa 32px en escritorio y 22px en móvil; el pie tiene separación y borde propios. Las condiciones usan fondo claro dentro de la revisión. El resumen de compra permanece blanco tanto pendiente como calculado; su cifra grande, las unidades y las reglas separadoras hacen la jerarquía.

### Inputs / Fields

La cantidad agrupa botón de quitar, campo centrado y botón de agregar en una sola banda de 46px de alto. El campo blanco tiene bordes superior e inferior y cifras tabulares. Los extremos usan el fondo de página y borde de control; el hover habilitado se vuelve amarillo. Los nombres accesibles incluyen prenda y talla. Los errores aparecen antes del pie de acciones en naranja de lectura. La siguiente acción permanece deshabilitada para cantidades vacías o inválidas.

### Navigation

La cabecera blanca contiene marca Neuton, icono geométrico, nota breve y enlace LABS a la derecha. Su altura es 76px en escritorio y 68px en móvil.

La ruta usa cuatro botones numerados con regla inferior. El paso activo combina círculo amarillo, texto carbón y regla oliva; los completados usan círculo gris suave. Los pasos futuros se mantienen legibles y deshabilitados. El estado activo usa `aria-current="step"`. Los pasos alcanzados permiten volver y conservar cantidades; cada transición lleva el foco al título de la tarea. El pie muestra Atrás, contador y Elegir tallas o Revisar pedido; la revisión muestra Calcular mi tela y el resultado ofrece Editar pedido y Nuevo pedido.
### Garment selection

Las opciones muestran siluetas SVG, nombre y descripción. En escritorio son tarjetas verticales, con 28px de padding y altura mínima de 220px. En móvil son horizontales, con 20px de padding y altura mínima de 115px. La seleccionada usa fondo pálido y borde oliva con `aria-pressed`. La selección no depende de un icono tipográfico.

### Order review

Las filas agrupan prenda, tallas, total y Editar, con divisiones finas. Agregar otra prenda vuelve a la selección sin borrar el pedido. Las condiciones quedan en un panel suave contiguo en escritorio y debajo del pedido en móvil. Los cambios de cantidades borran el resultado anterior; salir de una búsqueda activa la cancela. Nuevo pedido restablece la ruta y las cantidades.
### Status

El estado es una etiqueta rectangular compacta. Pendiente usa gris; buscando y terminado usan selección suave y texto carbón. El mensaje describe el cálculo y se acompaña de un anuncio accesible del resultado.

### Measured fabric plan

El canvas presenta el rollo blanco, cuadrícula fina, cotas y piezas reales. Las muestras usan relleno con opacidad 0.55, y el canvas con 0.82; ambos conservan contornos. El extremo del largo tiene una línea naranja discontinua. Las piezas entran con una animación de 650ms y desaceleración de cuarta potencia; el botón de repetir vuelve a mostrar ese movimiento. El banco de patrones conserva nombre, cantidad y dimensiones junto a cada SVG.

## Do's and Don'ts

### Do:

- Do conservar Neuton para título y marca e Inter para controles, medidas y compra.
- Do mantener visibles las unidades y las advertencias sobre patrones ilustrativos.
- Do conservar el color y la geometría de cada pieza entre las distintas representaciones.
- Do mantener el desplazamiento horizontal del rollo dentro de su contenedor.
- Do dar foco visible y respetar la preferencia de movimiento reducido.
- Do mantener la ruta numerada, una tarea por paso y las acciones en el pie del panel.
- Do conservar las cantidades al volver y deshabilitar el avance si el pedido no es válido.

### Don't:

- Don't trasladar fuentes pixeladas, biseles, cuenta regresiva ni composición de juego al planificador.
- Don't convertir el tendido en un escenario oscuro ni la compra en un panel amarillo.
- Don't sustituir las piezas calculadas por diagramas decorativos.
- Don't añadir sombras para jerarquizar paneles planos.
- Don't reducir las etiquetas del rollo para forzarlas dentro de una pieza pequeña.
