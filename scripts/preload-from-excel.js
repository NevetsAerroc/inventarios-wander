/* Uso: node scripts/preload-from-excel.js "Inventario Notebook.xlsx" "cuadre notebook armenia.xlsx" */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const root = path.join(__dirname, '..'); const dbFile = path.join(root, 'data', 'db.json');
if (!fs.existsSync(dbFile)) { console.error('Inicie la aplicación una vez para crear data/db.json.'); process.exit(1); }
const [inventoryFile, salesFile] = process.argv.slice(2);
if (!inventoryFile && !salesFile) { console.error('Indique al menos un archivo Excel.'); process.exit(1); }
const db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); const norm = x => String(x || '').trim().toUpperCase().replace(/\s+/g, ' ');
const uid = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
function values(file, preferred) { const wb=XLSX.readFile(file); const sh=wb.Sheets[preferred]||wb.Sheets[wb.SheetNames[0]]; return XLSX.utils.sheet_to_json(sh,{defval:''}); }
function key(rows, pattern) { return Object.keys(rows[0]||{}).find(x=>pattern.test(x)); }
if (inventoryFile) { const rows=values(inventoryFile,'DIA'); const k=key(rows,/insumo|producto|art[ií]culo|descrip/i); if(!k) throw Error('No se encontró columna de insumo.'); rows.forEach(r=>{const name=String(r[k]).trim();if(name&&!db.insumos.some(i=>norm(i.name)===norm(name))) db.insumos.push({id:uid('i'),name,unit:'unidad',price:0,active:true});}); console.log(`Insumos: ${db.insumos.length}`); }
if (salesFile) { const rows=values(salesFile,'T1'); const k=key(rows,/producto|art[ií]culo|descrip/i); if(!k) throw Error('No se encontró columna Producto.'); rows.forEach(r=>{const name=String(r[k]).trim();if(name&&!db.products.some(p=>norm(p.name)===norm(name))) db.products.push({id:uid('p'),name,price:0,recipe:[]});}); console.log(`Productos: ${db.products.length}`); }
fs.writeFileSync(dbFile,JSON.stringify(db,null,2)); console.log('Precarga terminada. Complete precios y recetas desde Recetario.');
