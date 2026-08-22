# Wander · Cuadre de caja e inventario

Aplicación web local para registrar ventas, caja, movimientos de inventario y el cuadre diario entre la tirilla y el conteo físico.

## Inicio rápido

1. Instala Node.js 18 o superior.
2. Desde esta carpeta ejecuta `npm install`.
3. Ejecuta `npm start`.
4. Abre `http://localhost:3000`.

La información se conserva localmente en `data/db.json`; respáldalo periódicamente. En Windows también puede ejecutar `iniciar.bat`.

Para precargar los Excel suministrados, después del primer inicio ejecute: `node scripts/preload-from-excel.js "Inventario Notebook.xlsx" "cuadre notebook armenia.xlsx"`.

## Uso diario

1. Selecciona la fecha. Al crear el día, el inventario inicial toma el físico del cierre anterior.
2. Importa la tirilla `.xlsx`; se lee la pestaña `T1` y se reconocen encabezados Producto y Cantidad.
3. Registra entradas, mermas, consumos/cortesías, gastos y pagos.
4. Diligencia el arqueo físico y revisa **Cuadre y auditoría**.

Los productos sin coincidencia exacta en el recetario se muestran al importar la tirilla. Agrégalos y define su receta en el recetario (la primera versión incluye una carta base editable).

## Carga masiva de carta e insumos

En la pestaña **Recetario** descargue las dos plantillas y vuelva a subirlas diligenciadas:

- **Insumos:** una fila por insumo con nombre, unidad, costo y estado. Si ya existe el mismo nombre, se actualiza.
- **Productos y recetas:** una fila por ingrediente. Repita el producto y el precio en cada una de sus filas. Por ejemplo, para una hamburguesa mediana use una fila con `Pan Mediano` y otra con `Carne Mediana`; al importar, ambos ingredientes quedarán en su receta.

El cuadro diario muestra primero los productos vendidos y el consumo que cada receta exige, y después consolida ese consumo por insumo contra el conteo físico.

## Fórmulas

- Salida real = Inicial + Entradas − Físico final − Consumos/averías/cortesías.
- Diferencia = Salida real − consumo teórico por tirilla.
- Efectivo esperado = Ventas de tirilla − gastos de caja − pagos por plataformas, crédito y bonos.
