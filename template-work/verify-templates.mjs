import fs from 'node:fs/promises';
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
for (const name of ['plantilla-insumos.xlsx','plantilla-productos-recetas.xlsx']) {
  const file = await FileBlob.load(`../templates/${name}`);
  const wb = await SpreadsheetFile.importXlsx(file);
  const check = await wb.inspect({ kind: 'table', range: 'Plantilla!A1:F6', include: 'values', tableMaxRows: 6, tableMaxCols: 6 });
  console.log(name, check.ndjson);
  const image = await wb.render({ sheetName: 'Plantilla', autoCrop: 'all', scale: 1, format: 'png' });
  await fs.writeFile(`../templates/${name}.png`, new Uint8Array(await image.arrayBuffer()));
}
