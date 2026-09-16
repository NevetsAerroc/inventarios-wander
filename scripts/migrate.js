const firestore = require('../firestore-sync');
const pg = require('../pg-sync');

async function migrate() {
  console.log('--- INICIANDO MIGRACIÓN DE FIRESTORE A POSTGRESQL ---');
  console.log('Descargando datos de Firestore...');
  
  const cloudRes = await firestore.loadFromFirestore(3);
  
  if (!cloudRes || !cloudRes.success) {
    console.error('ERROR: No se pudo descargar de Firestore.', cloudRes?.reason);
    process.exit(1);
  }
  
  console.log(`Descarga exitosa: ${cloudRes.insumos.length} insumos, ${cloudRes.products.length} productos, ${cloudRes.days.length} días.`);
  
  console.log('Subiendo datos a PostgreSQL...');
  const dbData = {
    settings: cloudRes.settings,
    insumos: cloudRes.insumos,
    products: cloudRes.products,
    days: cloudRes.days
  };
  
  try {
    await pg.saveAllToFirestore(dbData);
    console.log('--- MIGRACIÓN COMPLETADA CON ÉXITO ---');
    process.exit(0);
  } catch(e) {
    console.error('ERROR AL SUBIR A POSTGRESQL:', e);
    process.exit(1);
  }
}

migrate();
