import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const outDir = fileURLToPath(new URL('../templates/', import.meta.url));
await fs.mkdir(outDir, { recursive: true });
async function save(name, headers, rows, widths) {
  const wb = Workbook.create(); const sh = wb.worksheets.add('Plantilla');
  sh.getRange(`A1:${String.fromCharCode(64 + headers.length)}1`).values = [headers];
  sh.getRange(`A2:${String.fromCharCode(64 + headers.length)}${rows.length + 1}`).values = rows;
  sh.getRange(`A1:${String.fromCharCode(64 + headers.length)}1`).format = { fill: '#0B695E', font: { bold: true, color: '#FFFFFF' } };
  sh.getRange(`A1:${String.fromCharCode(64 + headers.length)}${rows.length + 1}`).format.borders = { preset: 'insideHorizontal', style: 'thin', color: '#DDE3E7' };
  widths.forEach((width, index) => sh.getRangeByIndexes(0, index, 1, 1).format.columnWidth = width);
  const file = await SpreadsheetFile.exportXlsx(wb); await file.save(`${outDir}${name}`);
}
await save('plantilla-insumos.xlsx', ['Nombre del insumo', 'Unidad de medida', 'Costo unitario COP', 'Activo (SI/NO)'], [['Pan Mediano', 'unidad', 1500, 'SI'], ['Carne Mediana', 'unidad', 5000, 'SI'], ['Gaseosa 1.5L', 'unidad', 6000, 'SI']], [30, 22, 22, 18]);
await save('plantilla-productos-recetas.xlsx', ['Producto de carta', 'Precio de venta COP', 'Insumo', 'Cantidad por venta', 'Unidad', 'Nota opcional'], [['HAMBURGUESA MEDIANA', 18000, 'Pan Mediano', 1, 'unidad', 'Una fila por ingrediente'], ['HAMBURGUESA MEDIANA', 18000, 'Carne Mediana', 1, 'unidad', ''], ['COMBO 1', 15000, 'Pan Pequeño', 1, 'unidad', ''], ['COMBO 1', 15000, 'Carne Pequeña', 1, 'unidad', '']], [28, 22, 28, 22, 15, 28]);
