import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outDir = fileURLToPath(new URL('../templates/', import.meta.url));
await fs.mkdir(outDir, { recursive: true });

async function makeInsumos() {
  const wb = Workbook.create(); const sh = wb.worksheets.add('Insumos');
  sh.getRange('A1:D1').values = [['Nombre del insumo', 'Unidad de medida', 'Costo unitario COP', 'Activo (SI/NO)']];
  sh.getRange('A2:D4').values = [['Pan Mediano', 'unidad', 1500, 'SI'], ['Carne Mediana', 'unidad', 5000, 'SI'], ['Gaseosa 1.5L', 'unidad', 6000, 'SI']];
  sh.getRange('A1:D1').format = { fill: '#0B695E', font: { bold: true, color: '#FFFFFF' } };
  sh.getRange('A1:D4').format.borders = { preset: 'insideHorizontal', style: 'thin', color: '#DDE3E7' };
  sh.getRange('C2:C200').format.numberFormat = '#,##0';
  sh.getRange('A1:D1').format.columnWidth = 22; sh.getRange('A1').format.columnWidth = 30;
  sh.getRange('D2:D200').dataValidation = { rule: { type: 'list', values: ['SI', 'NO'] } };
  const file = await SpreadsheetFile.exportXlsx(wb); await file.save(`${outDir}plantilla-insumos.xlsx`);
}
async function makeProductos() {
  const wb = Workbook.create(); const sh = wb.worksheets.add('Productos');
  sh.getRange('A1:F1').values = [['Producto de carta', 'Precio de venta COP', 'Insumo', 'Cantidad por venta', 'Unidad', 'Nota opcional']];
  sh.getRange('A2:F5').values = [['HAMBURGUESA MEDIANA', 18000, 'Pan Mediano', 1, 'unidad', 'Una fila por ingrediente'], ['HAMBURGUESA MEDIANA', 18000, 'Carne Mediana', 1, 'unidad', ''], ['COMBO 1', 15000, 'Pan Pequeño', 1, 'unidad', ''], ['COMBO 1', 15000, 'Carne Pequeña', 1, 'unidad', '']];
  sh.getRange('A1:F1').format = { fill: '#0B695E', font: { bold: true, color: '#FFFFFF' } };
  sh.getRange('A1:F5').format.borders = { preset: 'insideHorizontal', style: 'thin', color: '#DDE3E7' };
  sh.getRange('B2:B200').format.numberFormat = '#,##0'; sh.getRange('D2:D200').format.numberFormat = '0.00';
  sh.getRange('A1:F1').format.columnWidth = 20; sh.getRange('A1').format.columnWidth = 28; sh.getRange('C1').format.columnWidth = 28; sh.getRange('F1').format.columnWidth = 28;
  const file = await SpreadsheetFile.exportXlsx(wb); await file.save(`${outDir}plantilla-productos-recetas.xlsx`);
}
await makeInsumos(); await makeProductos();
