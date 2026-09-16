const { db } = require('./src/db/index');
const { settings, insumos, products, days } = require('./src/db/schema');
const { eq } = require('drizzle-orm');

async function loadFromFirestore(maxRetries = 2) {
  try {
    const settingsRec = await db.select().from(settings).limit(1);
    const insumosRec = await db.select().from(insumos);
    const productsRec = await db.select().from(products);
    const daysRec = await db.select().from(days);

    if (insumosRec.length === 0 && productsRec.length === 0 && settingsRec.length === 0) {
      return { isVirgin: true, settings: null, insumos: [], products: [], days: [] };
    }

    let parsedSettings = settingsRec[0] || { businessName: 'Wander', currency: 'COP' };

    return { 
      success: true, 
      settings: parsedSettings, 
      insumos: insumosRec, 
      products: productsRec, 
      days: daysRec 
    };
  } catch (err) {
    console.error('Error cargando db desde pg:', err);
    return { failed: true, reason: err.message };
  }
}

async function saveProductToFirestore(product) {
  if (!product || !product.id) return;
  await db.insert(products).values(product).onConflictDoUpdate({ target: products.id, set: product });
}

async function deleteProductFromFirestore(productId) {
  if (!productId) return;
  await db.delete(products).where(eq(products.id, productId));
}

async function saveInsumoToFirestore(insumo) {
  if (!insumo || !insumo.id) return;
  await db.insert(insumos).values(insumo).onConflictDoUpdate({ target: insumos.id, set: insumo });
}

async function saveDayToFirestore(dayData) {
  if (!dayData || !dayData.date) return;
  await db.insert(days).values(dayData).onConflictDoUpdate({ target: days.date, set: dayData });
}

async function saveSettingsToFirestore(settingsData) {
  if (!settingsData) return;
  settingsData.id = 'app';
  await db.insert(settings).values(settingsData).onConflictDoUpdate({ target: settings.id, set: settingsData });
}

async function saveCatalogToFirestore(insumoList, productList) {
  if (insumoList && insumoList.length > 0) {
    for (const i of insumoList) {
      await db.insert(insumos).values(i).onConflictDoUpdate({ target: insumos.id, set: i });
    }
  }
  if (productList && productList.length > 0) {
    for (const p of productList) {
      await db.insert(products).values(p).onConflictDoUpdate({ target: products.id, set: p });
    }
  }
}

async function saveAllToFirestore(dbData) {
  if (dbData.settings) await saveSettingsToFirestore(dbData.settings);
  await saveCatalogToFirestore(dbData.insumos, dbData.products);
  if (dbData.days && dbData.days.length > 0) {
    for (const d of dbData.days) {
      await saveDayToFirestore(d);
    }
  }
}

function isQuotaExceeded() {
  return false;
}

function getFirestore() {
  return db;
}

module.exports = {
  getFirestore,
  loadFromFirestore,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveInsumoToFirestore,
  saveDayToFirestore,
  saveSettingsToFirestore,
  saveCatalogToFirestore,
  saveAllToFirestore,
  isQuotaExceeded
};
