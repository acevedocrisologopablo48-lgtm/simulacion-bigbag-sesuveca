# Estación de descarga de BigBags — P05

Visor del modelo CAD simplificado de SESUVECA DEL PERÚ, revisión 03/11/2026.

El montacargas presenta el BigBag de 1 t y se enganchan sus cuatro asas. La botonera fija acciona el izaje y el traslado por monorriel. La bolsa se apoya sobre la tolva y descarga por una manga con sello flexible y venteo filtrado. El operario regula la compuerta y pesa sacos de 25 o 50 kg durante la descarga. Al terminar, la bolsa vacía retorna a recepción. Se detiene su fondo a 1 m para recoger la manga desde un lateral y después se baja al pallet.

La pantalla utiliza las mallas del STEP vigente contenidas en `data/model.json.gz`. Bolsa, material, operarios y montacargas son representaciones de contexto. La animación explica la secuencia; no es un cálculo de deformación de tejido ni una simulación física del material.

La entrega está en `assets/docs/P05_PRACTICO_20261103.zip` y la secuencia maestra en `data/control_maestro_p05.json`.

La revisión utiliza seis secciones de tubo, peldaños completos de 800 x 250 mm y una cruceta con el mismo tubo de las columnas. Conserva la plataforma, la escalera y las barandas.

El visor carga módulos JavaScript desde un servidor HTTP. No abrir directamente con `file://`.

El gancho se limita a 5,945 m. Cada saco se cierra y pliega 70 mm de boca antes de retirarlo por el frente y después hacia el pallet lateral. Las maniobras manuales se realizan con los movimientos eléctricos detenidos.

La selección final del sello y del filtro depende del FIBC y del producto suministrados. El visor muestra la geometría y el movimiento nominal del proyecto.
