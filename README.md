# Estación simple de bigbags — P05

Visor del modelo CAD simplificado de SESUVECA DEL PERÚ, revisión 03/11/2026.

El proceso comprende recepción y enganche del bigbag, izaje con tecle y monorriel, apoyo sobre tolva, apertura manual de la boca inferior, ensacado mediante compuerta manual y balanza fija, y retorno de la bolsa vacía.

La pantalla utiliza las mallas del STEP vigente contenidas en `data/model.json.gz`. Bolsa, material, operarios y montacargas son representaciones de contexto. La animación explica la secuencia; no es un cálculo de deformación de tejido ni una simulación física del material.

Entrega: `assets/docs/P05_SIMPLE_20261103.zip`. Secuencia: `data/control_maestro_p05.json`.

El visor carga módulos JavaScript desde un servidor HTTP. No abrir directamente con `file://`.
