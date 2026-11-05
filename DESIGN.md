# Pizarra de cuentas

Modo oscuro de una sola identidad: la pizarra donde un negocio anota quién debe y qué vence. Sin texturas ni dibujos de tiza: solo orden, líneas finas y cifras claras.

## Color
- Fondo pizarra `#14191a`; paneles `#1b2223`; elementos elevados `#232b2c`.
- Texto blanco tiza `#eef0e8`; texto secundario `#a7b1aa`.
- Amarillo tiza `#f2c94c`: acción principal, selección actual y lo que vence pronto.
- Rojo `#ff8a7a`: lo que vence hoy y las deudas. Verde `#7fd6a0`: lo cobrado. Azul `#8ecae6`: edición e información.

## Tipografía
Inter en una sola familia, con cifras tabulares en toda la app. Títulos de 1 a 1.35 rem; cifras destacadas en negrita.

## Componentes
- Paneles sin sombra ni borde, radio de 12 px. Las cuentas son etiqueta y cifra separadas por una línea fina, como en una libreta.
- El tamaño del punto dice cuánto urge un vencimiento: 14 px hoy, 10 px en 3 días, 6 px esta semana y aro vacío si ya venció.
- Botón principal amarillo con texto oscuro; secundario con contorno. Sin animaciones de entrada; transiciones de 150 a 250 ms solo para estados.

## Estructura
Cinco secciones: Inicio, Tareas, Personas, Gastos y Préstamos. Menú lateral en PC y pestañas abajo en el teléfono (hasta 768 px), donde Gastos y Personas pasan a fichas.
