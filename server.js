const http = require('http');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const firestoreSync = require('./pg-sync');

const PORT = 3000;
const ROOT = __dirname;
const isProd = process.env.NODE_ENV === 'production';
const DATA_DIR = isProd ? path.join('/tmp', 'data') : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function today() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function inferCategory(name) {
  const norm = normalize(name);
  if (norm.includes('PERRO') || norm.includes('SALCHICHA')) return 'Perros';
  if (norm.includes('SANDWICH') || norm.includes('FRANCÉS') || norm.includes('FRANCES')) return 'Sándwiches';
  if (norm.includes('GASEOSA') || norm.includes('JUGO') || norm.includes('AGUA') || norm.includes('TEA') || norm.includes('LIMONADA') || norm.includes('MALTEADA') || norm.includes('MR TEA')) return 'Bebidas';
  if (norm.includes('ADICION') || norm.includes('PAPITAS') || norm.includes('SALCHIPAPA') || norm.includes('COSTILLA')) return 'Adiciones y Entradas';
  return 'Hamburguesas';
}

function inferSubgroup(name) {
  const norm = normalize(name);
  if (norm.includes('GRANDE') || norm.includes('3 CARNES') || norm.includes('SUPER') || norm.includes('AGRANDADO') || norm.includes('COMBO 4') || norm.includes('COMBO 5') || norm.includes('COMBO 6')) return 'Grandes / Súper';
  if (norm.includes('MEDIAN') || norm.includes('ASADA') || norm.includes('NORMAL') || norm.includes('COMBO 1') || norm.includes('COMBO 2') || norm.includes('COMBO 3')) return 'Medianas / Normales';
  if (norm.includes('PEQUEÑ') || norm.includes('PEQUENA') || norm.includes('JUNIOR')) return 'Pequeñas / Junior';
  return 'Especiales / Otros';
}

function readDb() {
  if (!fs.existsSync(DB_FILE)) return seedDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  let changed = false;
  if (!db.settings) {
    db.settings = { businessName: 'Wander', currency: 'COP' };
    changed = true;
  }
  if (!db.settings.viewSettings) {
    db.settings.viewSettings = {
      categoryOrder: [],
      hiddenCategories: [],
      subgroupOrder: {},
      hiddenSubgroups: {},
      productOrder: {},
      hiddenProducts: [],
      auditInsumoOrder: [],
      hiddenAuditInsumos: [],
      subgroupInsumoOrder: {},
      hiddenSubgroupInsumos: {}
    };
    changed = true;
  }
  db.products.forEach(p => {
    const newCat = p.category || inferCategory(p.name);
    const newSub = p.subgroup || inferSubgroup(p.name);
    if (p.category !== newCat) { p.category = newCat; changed = true; }
    if (p.subgroup !== newSub) { p.subgroup = newSub; changed = true; }
  });
  if (changed) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }
  return db;
}

function writeDb(db, options = {}) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

  // Sincronización precisa y económica con Cloud Firestore
  if (options.day) {
    firestoreSync.saveDayToFirestore(options.day);
  }
  if (options.settings) {
    firestoreSync.saveSettingsToFirestore(db.settings);
  }
  if (options.product) {
    firestoreSync.saveProductToFirestore(options.product);
  }
  if (options.deleteProduct) {
    firestoreSync.deleteProductFromFirestore(options.deleteProduct);
  }
  if (options.insumo) {
    firestoreSync.saveInsumoToFirestore(options.insumo);
  }
  if (options.catalog) {
    firestoreSync.saveCatalogToFirestore(db.insumos, db.products);
  }
  if (options.all) {
    firestoreSync.saveAllToFirestore(db);
  }
}

function id(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function seedDb() {
  const insumos = [
    ['Pan Grande', 'unidad', 1800], ['Carne Grande', 'unidad', 6500], ['Pan Mediano', 'unidad', 1500], ['Carne Mediano', 'unidad', 5000],
    ['Pollo Apas.', 'unidad', 5000], ['Pan Pequeño', 'unidad', 1200], ['Carne Pequeña', 'unidad', 3500], ['Francés Normal', 'unidad', 1300],
    ['Francés Junior', 'unidad', 1000], ['Perro Super', 'unidad', 2500], ['Perro Junior', 'unidad', 1800], ['Salchicha Long', 'unidad', 2500],
    ['Chorizo', 'unidad', 2800], ['Pollo Desmechado', 'porción', 3800], ['Cordero', 'porción', 6000], ['Jamonada', 'tajada', 900], ['Queso', 'tajada', 1000], ['Gaseosa', 'unidad', 3000]
  ].map(([name, unit, price]) => ({ id: id('i'), name, unit, price, active: true }));

  const find = (name) => insumos.find(i => i.name === name).id;
  const products = [
    { name: 'COMBO 1', price: 15000, category: 'Hamburguesas', subgroup: 'Pequeñas / Junior', recipe: [['Pan Pequeño', 1], ['Carne Pequeña', 1], ['Gaseosa', 1]] },
    { name: '3 CARNES', price: 30000, category: 'Hamburguesas', subgroup: 'Grandes / Súper', recipe: [['Pan Grande', 1], ['Carne Grande', 3], ['Queso', 1]] },
    { name: 'ASADA DE CERDO', price: 18000, category: 'Hamburguesas', subgroup: 'Medianas / Normales', recipe: [['Pan Mediano', 1], ['Carne Mediano', 1]] },
    { name: 'PERRO SUPER', price: 12000, category: 'Perros', subgroup: 'Grandes / Súper', recipe: [['Perro Super', 1], ['Salchicha Long', 1], ['Queso', 1]] },
    { name: 'GASEOSA 1.5', price: 6000, category: 'Bebidas', subgroup: 'Especiales / Otros', recipe: [['Gaseosa', 2]] }
  ].map(p => ({ id: id('p'), name: p.name, price: p.price, category: p.category, subgroup: p.subgroup, recipe: p.recipe.map(([n, quantity]) => ({ insumoId: find(n), quantity })) }));

  const db = { insumos, products, days: [], settings: { businessName: 'Wander', currency: 'COP' } };
  writeDb(db);
  return db;
}

function json(res, status, data) {
  if (data && typeof data === 'object') {
    data.quotaWarning = firestoreSync.isQuotaExceeded();
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function dayFor(db, date) {
  let day = db.days.find(d => d.date === date);
  if (!day) {
    const prev = db.days.filter(d => d.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
    day = { id: id('d'), date, opening: {}, physical: {}, movements: [], sales: [], payments: { cash: 0, nequi: 0, bancolombia: 0, credit: 0, vouchers: 0 }, expenses: [], createdAt: new Date().toISOString() };
    db.insumos.forEach(i => {
      day.opening[i.id] = prev?.physical?.[i.id] || 0;
      day.physical[i.id] = prev?.physical?.[i.id] || 0;
    });
    db.days.push(day);
  }
  const prev = db.days.filter(d => d.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  db.insumos.forEach(i => {
    const prior = prev?.physical?.[i.id] || 0;
    const previousOpening = day.opening[i.id];
    if (previousOpening == null || previousOpening !== prior) {
      day.opening[i.id] = prior;
      if (day.physical[i.id] == null || day.physical[i.id] === previousOpening) day.physical[i.id] = prior;
    }
    if (day.physical[i.id] == null) day.physical[i.id] = day.opening[i.id];
  });
  return day;
}

function normalize(v) { return String(v || '').trim().toUpperCase().replace(/\s+/g, ' '); }
function matchKey(v) { return normalize(v).replace(/\bDE LLEVAR\b/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, ''); }
function saleRecord(db, productId, quantity) {
  const product = db.products.find(p => p.id === productId);
  return { productId, quantity: Number(quantity), productName: product?.name || '', price: Number(product?.price || 0), directSale: Boolean(product?.directSale), recipeSnapshot: (product?.recipe || []).map(r => ({ insumoId: r.insumoId, quantity: Number(r.quantity) })) };
}

function report(db, day) {
  const inventory = db.insumos.filter(insumo => insumo.active !== false).map(insumo => {
    const movements = day.movements.filter(m => m.insumoId === insumo.id);
    const entries = movements.filter(m => m.type === 'entry').reduce((s, m) => s + Number(m.quantity), 0);
    const adjustments = movements.filter(m => ['waste', 'employee', 'gift'].includes(m.type)).reduce((s, m) => s + Number(m.quantity), 0);
    let theoretical = 0;
    day.sales.forEach(s => {
      const p = db.products.find(x => x.id === s.productId);
      const recipe = s.recipeSnapshot || p?.recipe || [];
      recipe.filter(r => r.insumoId === insumo.id).forEach(r => theoretical += r.quantity * s.quantity);
    });
    const calculatedOut = Number(day.opening[insumo.id] || 0) + entries - Number(day.physical[insumo.id] || 0) - adjustments;
    const difference = calculatedOut - theoretical;
    return { insumo, opening: Number(day.opening[insumo.id] || 0), entries, adjustments, physical: Number(day.physical[insumo.id] || 0), calculatedOut, theoretical, difference, value: difference * insumo.price };
  });

  const salesTotal = day.sales.reduce((s, x) => s + Number(x.quantity) * Number(x.price ?? (db.products.find(p => p.id === x.productId)?.price || 0)), 0);
  const expensesTotal = day.expenses.reduce((s, x) => s + Number(x.amount), 0);
  const platforms = Object.values(day.payments).reduce((s, x) => s + Number(x), 0) - Number(day.payments.cash || 0);
  const productBreakdown = day.sales.filter(s => Number(s.quantity) > 0).map(s => {
    const product = db.products.find(p => p.id === s.productId);
    const recipe = s.recipeSnapshot || product?.recipe || [];
    return {
      name: s.productName || product?.name || 'Producto eliminado',
      category: product?.category || inferCategory(s.productName || product?.name || ''),
      subgroup: product?.subgroup || inferSubgroup(s.productName || product?.name || ''),
      quantity: Number(s.quantity),
      directSale: Boolean(s.directSale ?? product?.directSale),
      ingredients: recipe.map(r => ({ name: db.insumos.find(i => i.id === r.insumoId)?.name || 'Insumo eliminado', quantity: r.quantity * Number(s.quantity), unit: db.insumos.find(i => i.id === r.insumoId)?.unit || '' }))
    };
  });

  // Arqueo Jerárquico por Categoría y Subgrupo/Tamaño (Estilo Plantilla Excel)
  const categoryMap = {};
  const matchedSaleIndices = new Set();

  // Inicializar todas las categorías y subgrupos con los productos registrados en el catálogo
  db.products.forEach(p => {
    const cat = p.category || inferCategory(p.name);
    const sub = p.subgroup || inferSubgroup(p.name);

    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, totalUnits: 0, totalSalesValue: 0, subgroups: {}, categoryInsumosTheoretical: {} };
    }
    if (!categoryMap[cat].subgroups[sub]) {
      categoryMap[cat].subgroups[sub] = { subgroup: sub, totalUnits: 0, totalSalesValue: 0, products: [], insumosTheoretical: {} };
    }

    // Buscar todas las ventas coincidentes para este producto en la tirilla
    const matchingSales = day.sales.filter((s, idx) => {
      const match = (s.productId && s.productId === p.id) ||
                    matchKey(s.productName) === matchKey(p.name) ||
                    normalize(s.productName) === normalize(p.name);
      if (match) matchedSaleIndices.add(idx);
      return match;
    });

    const qty = matchingSales.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    const explicitPrice = matchingSales.find(s => Number(s.price) > 0)?.price;
    const unitPrice = Number(explicitPrice || p.price || 0);
    const lineTotal = qty * unitPrice;

    categoryMap[cat].totalUnits += qty;
    categoryMap[cat].totalSalesValue += lineTotal;
    categoryMap[cat].subgroups[sub].totalUnits += qty;
    categoryMap[cat].subgroups[sub].totalSalesValue += lineTotal;

    categoryMap[cat].subgroups[sub].products.push({
      id: p.id,
      name: p.name,
      quantity: qty,
      price: unitPrice,
      total: lineTotal
    });

    // Sumar consumo teórico de insumos según recetas
    if (qty > 0) {
      matchingSales.forEach(s => {
        const sQty = Number(s.quantity || 0);
        const recipe = (p.recipe && p.recipe.length > 0) ? p.recipe : (s.recipeSnapshot || []);
        recipe.forEach(r => {
          const insumo = db.insumos.find(i => i.id === r.insumoId);
          if (!insumo) return;
          const ingQty = Number(r.quantity || 0) * sQty;

          if (!categoryMap[cat].subgroups[sub].insumosTheoretical[insumo.id]) {
            categoryMap[cat].subgroups[sub].insumosTheoretical[insumo.id] = { insumo, theoretical: 0 };
          }
          categoryMap[cat].subgroups[sub].insumosTheoretical[insumo.id].theoretical += ingQty;

          if (!categoryMap[cat].categoryInsumosTheoretical[insumo.id]) {
            categoryMap[cat].categoryInsumosTheoretical[insumo.id] = { insumo, theoretical: 0 };
          }
          categoryMap[cat].categoryInsumosTheoretical[insumo.id].theoretical += ingQty;
        });
      });
    }
  });

  // Agregar ventas de productos de la tirilla que no estén explícitamente en el catálogo
  day.sales.forEach((s, idx) => {
    if (matchedSaleIndices.has(idx)) return;
    const qty = Number(s.quantity || 0);
    if (qty <= 0) return;
    const cat = inferCategory(s.productName);
    const sub = inferSubgroup(s.productName);
    const unitPrice = Number(s.price || 0);
    const lineTotal = qty * unitPrice;

    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, totalUnits: 0, totalSalesValue: 0, subgroups: {}, categoryInsumosTheoretical: {} };
    }
    if (!categoryMap[cat].subgroups[sub]) {
      categoryMap[cat].subgroups[sub] = { subgroup: sub, totalUnits: 0, totalSalesValue: 0, products: [], insumosTheoretical: {} };
    }

    categoryMap[cat].totalUnits += qty;
    categoryMap[cat].totalSalesValue += lineTotal;
    categoryMap[cat].subgroups[sub].totalUnits += qty;
    categoryMap[cat].subgroups[sub].totalSalesValue += lineTotal;

    categoryMap[cat].subgroups[sub].products.push({
      id: null,
      name: s.productName,
      quantity: qty,
      price: unitPrice,
      total: lineTotal
    });

    // Si tiene receta en el snapshot de venta o producto con nombre similar
    const catalogMatch = db.products.find(x => normalize(x.name) === normalize(s.productName));
    const recipe = (catalogMatch?.recipe && catalogMatch.recipe.length > 0) ? catalogMatch.recipe : (s.recipeSnapshot || []);
    recipe.forEach(r => {
      const insumo = db.insumos.find(i => i.id === r.insumoId);
      if (!insumo) return;
      const ingQty = Number(r.quantity || 0) * qty;

      if (!categoryMap[cat].subgroups[sub].insumosTheoretical[insumo.id]) {
        categoryMap[cat].subgroups[sub].insumosTheoretical[insumo.id] = { insumo, theoretical: 0 };
      }
      categoryMap[cat].subgroups[sub].insumosTheoretical[insumo.id].theoretical += ingQty;

      if (!categoryMap[cat].categoryInsumosTheoretical[insumo.id]) {
        categoryMap[cat].categoryInsumosTheoretical[insumo.id] = { insumo, theoretical: 0 };
      }
      categoryMap[cat].categoryInsumosTheoretical[insumo.id].theoretical += ingQty;
    });
  });

  const categoryBreakdown = Object.values(categoryMap).map(c => {
    const subgroups = Object.values(c.subgroups).map(sg => {
      // Insumos asociados a las recetas de TODOS los productos pertenecientes a este subgrupo
      const insumoIds = new Set();

      // 1. Insumos de todos los productos del catálogo asignados a este subgrupo (incluso si hoy no tienen ventas)
      const catalogSubgroupProds = db.products.filter(p => {
        const pCat = p.category || inferCategory(p.name);
        const pSub = p.subgroup || inferSubgroup(p.name);
        return pCat === c.category && pSub === sg.subgroup;
      });
      catalogSubgroupProds.forEach(prod => {
        (prod?.recipe || []).forEach(r => {
          if (r.insumoId) insumoIds.add(r.insumoId);
        });
      });

      // 2. Insumos de productos registrados en sg.products
      sg.products.forEach(p => {
        const prod = db.products.find(x => (p.id && x.id === p.id) || normalize(x.name) === normalize(p.name));
        (prod?.recipe || []).forEach(r => {
          if (r.insumoId) insumoIds.add(r.insumoId);
        });
      });

      // 3. Cualquier insumo que haya registrado consumo teórico
      Object.keys(sg.insumosTheoretical || {}).forEach(insId => insumoIds.add(insId));

      const insumosAudit = Array.from(insumoIds).map(insumoId => {
        const insumo = db.insumos.find(i => i.id === insumoId);
        if (!insumo || !insumo.name) return null;
        const theoItem = sg.insumosTheoretical[insumoId];
        const theoretical = theoItem ? theoItem.theoretical : 0;
        const invMatch = inventory.find(inv => inv.insumo.id === insumoId);
        const calculatedOut = invMatch ? invMatch.calculatedOut : 0;
        const diff = calculatedOut - theoretical;
        return {
          insumo: { id: insumo.id, name: insumo.name, unit: insumo.unit || 'unidad', price: Number(insumo.price || 0) },
          theoretical,
          calculatedOut,
          difference: diff,
          value: diff * Number(insumo.price || 0)
        };
      }).filter(Boolean);

      return {
        subgroup: sg.subgroup,
        totalUnits: sg.totalUnits,
        totalSalesValue: sg.totalSalesValue,
        products: sg.products,
        insumosAudit
      };
    });

    // Insumos asociados a la categoría completa
    const catInsumoIds = new Set();
    const catalogCatProds = db.products.filter(p => (p.category || inferCategory(p.name)) === c.category);
    catalogCatProds.forEach(prod => {
      (prod?.recipe || []).forEach(r => {
        if (r.insumoId) catInsumoIds.add(r.insumoId);
      });
    });
    Object.keys(c.categoryInsumosTheoretical || {}).forEach(insId => catInsumoIds.add(insId));

    const categoryInsumosAudit = Array.from(catInsumoIds).map(insumoId => {
      const insumo = db.insumos.find(i => i.id === insumoId);
      if (!insumo || !insumo.name) return null;
      const theoItem = c.categoryInsumosTheoretical[insumoId];
      const theoretical = theoItem ? theoItem.theoretical : 0;
      const invMatch = inventory.find(inv => inv.insumo.id === insumoId);
      const calculatedOut = invMatch ? invMatch.calculatedOut : 0;
      const diff = calculatedOut - theoretical;
      return {
        insumo: { id: insumo.id, name: insumo.name, unit: insumo.unit || 'unidad', price: Number(insumo.price || 0) },
        theoretical,
        calculatedOut,
        difference: diff,
        value: diff * Number(insumo.price || 0)
      };
    }).filter(Boolean);

    return {
      category: c.category,
      totalUnits: c.totalUnits,
      totalSalesValue: c.totalSalesValue,
      subgroups,
      categoryInsumosAudit
    };
  });

  // Apply user viewSettings for order & visibility
  const vs = db.settings?.viewSettings || {};
  const hiddenCategories = new Set(vs.hiddenCategories || []);
  const hiddenProducts = new Set(vs.hiddenProducts || []);
  const hiddenAuditInsumos = new Set(vs.hiddenAuditInsumos || []);

  let finalCategoryBreakdown = categoryBreakdown.filter(c => !hiddenCategories.has(c.category));
  if (Array.isArray(vs.categoryOrder) && vs.categoryOrder.length) {
    const catOrderMap = new Map(vs.categoryOrder.map((cat, idx) => [cat, idx]));
    finalCategoryBreakdown.sort((a, b) => {
      const ordA = catOrderMap.has(a.category) ? catOrderMap.get(a.category) : 9999;
      const ordB = catOrderMap.has(b.category) ? catOrderMap.get(b.category) : 9999;
      return ordA - ordB;
    });
  }

  finalCategoryBreakdown = finalCategoryBreakdown.map(cat => {
    const hiddenSubForCat = new Set(vs.hiddenSubgroups?.[cat.category] || []);
    let subs = cat.subgroups.filter(sg => !hiddenSubForCat.has(sg.subgroup));

    const subOrderList = vs.subgroupOrder?.[cat.category];
    if (Array.isArray(subOrderList) && subOrderList.length) {
      const subOrderMap = new Map(subOrderList.map((s, idx) => [s, idx]));
      subs.sort((a, b) => {
        const ordA = subOrderMap.has(a.subgroup) ? subOrderMap.get(a.subgroup) : 9999;
        const ordB = subOrderMap.has(b.subgroup) ? subOrderMap.get(b.subgroup) : 9999;
        return ordA - ordB;
      });
    }

    subs = subs.map(sg => {
      const key = `${cat.category}::${sg.subgroup}`;
      let prods = sg.products.filter(p => !hiddenProducts.has(p.id || p.name));
      const prodOrderList = vs.productOrder?.[key];
      if (Array.isArray(prodOrderList) && prodOrderList.length) {
        const prodOrderMap = new Map(prodOrderList.map((pid, idx) => [pid, idx]));
        prods.sort((a, b) => {
          const ordA = prodOrderMap.has(a.id || a.name) ? prodOrderMap.get(a.id || a.name) : 9999;
          const ordB = prodOrderMap.has(b.id || b.name) ? prodOrderMap.get(b.id || b.name) : 9999;
          return ordA - ordB;
        });
      }

      // Subgroup insumo audit ordering & visibility
      const hiddenInsumosForSub = new Set(vs.hiddenSubgroupInsumos?.[key] || []);
      let filteredAudit = (sg.insumosAudit || []).filter(ia => !hiddenInsumosForSub.has(ia.insumo?.id));
      const subInsumoOrderList = vs.subgroupInsumoOrder?.[key];
      if (Array.isArray(subInsumoOrderList) && subInsumoOrderList.length) {
        const insumoMap = new Map(subInsumoOrderList.map((id, idx) => [id, idx]));
        filteredAudit.sort((a, b) => {
          const ordA = insumoMap.has(a.insumo?.id) ? insumoMap.get(a.insumo?.id) : 9999;
          const ordB = insumoMap.has(b.insumo?.id) ? insumoMap.get(b.insumo?.id) : 9999;
          return ordA - ordB;
        });
      }

      return {
        ...sg,
        products: prods,
        insumosAudit: filteredAudit,
        allInsumosAudit: sg.insumosAudit || []
      };
    });

    return { ...cat, subgroups: subs };
  });

  // Apply audit insumo ordering & visibility
  let finalInventory = inventory.filter(inv => !hiddenAuditInsumos.has(inv.insumo.id));
  if (Array.isArray(vs.auditInsumoOrder) && vs.auditInsumoOrder.length) {
    const insumoOrderMap = new Map(vs.auditInsumoOrder.map((id, idx) => [id, idx]));
    finalInventory.sort((a, b) => {
      const ordA = insumoOrderMap.has(a.insumo.id) ? insumoOrderMap.get(a.insumo.id) : 9999;
      const ordB = insumoOrderMap.has(b.insumo.id) ? insumoOrderMap.get(b.insumo.id) : 9999;
      return ordA - ordB;
    });
  }

  return {
    inventory: finalInventory,
    allInventory: inventory,
    productBreakdown,
    categoryBreakdown: finalCategoryBreakdown,
    rawCategoryBreakdown: categoryBreakdown,
    salesTotal,
    expensesTotal,
    expectedCash: salesTotal - expensesTotal - platforms,
    reportedCash: Number(day.payments.cash || 0),
    cashDifference: Number(day.payments.cash || 0) - (salesTotal - expensesTotal - platforms),
    shortageValue: inventory.reduce((s, x) => s + Math.max(x.value, 0), 0)
  };
}

function parseSales(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets.T1 || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no contiene hojas.');
  const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const productHeader = /producto|nombre|art[ií]culo|descrip/i, quantityHeader = /cantidad|cant\.?/i;
  const headerIndex = grid.findIndex(row => row.some(cell => productHeader.test(normalize(cell))) && row.some(cell => quantityHeader.test(normalize(cell))));
  if (headerIndex < 0) throw new Error('No encontré las columnas Nombre/Producto y Cantidad. Verifica los encabezados de la tirilla.');
  const headers = grid[headerIndex];
  const productColumn = headers.findIndex(cell => productHeader.test(normalize(cell)));
  const quantityColumn = headers.findIndex(cell => quantityHeader.test(normalize(cell)));
  const valueColumn = headers.findIndex(cell => /^VALOR$|VALOR TOTAL/i.test(normalize(cell)));
  const quantity = value => {
    if (typeof value === 'number') return value;
    if (value == null) return 0;
    let raw = String(value).trim().replace(/[$€COP\s]/gi, '');
    if (!raw) return 0;
    // Format like 15.000 or 1.250.000 (thousands separators with dot, no decimals)
    if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) {
      return Number(raw.replace(/\./g, ''));
    }
    // Format like 15,000 or 1,250,000 (thousands separators with comma, no decimals)
    if (/^-?\d{1,3}(,\d{3})+$/.test(raw)) {
      return Number(raw.replace(/,/g, ''));
    }
    // Format with both dots and commas (e.g. 1.250,50 or 1,250.50)
    if (raw.includes(',') && raw.includes('.')) {
      const lastDot = raw.lastIndexOf('.');
      const lastComma = raw.lastIndexOf(',');
      if (lastDot > lastComma) {
        // 1,250.50 -> dot is decimal
        raw = raw.replace(/,/g, '');
      } else {
        // 1.250,50 -> comma is decimal
        raw = raw.replace(/\./g, '').replace(',', '.');
      }
      return Number(raw);
    }
    // If only comma exists, assume comma is decimal point (e.g. 1,5)
    return Number(raw.replace(',', '.'));
  };
  return grid.slice(headerIndex + 1).map(row => ({ name: String(row[productColumn] || '').trim(), quantity: quantity(row[quantityColumn]), value: valueColumn >= 0 ? quantity(row[valueColumn]) : 0 })).filter(x => x.name && Number.isFinite(x.quantity) && x.quantity > 0);
}

function parseExcelRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('El archivo no contiene hojas.');
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

function field(row, pattern) {
  const key = Object.keys(row).find(k => pattern.test(normalize(k)));
  return key ? row[key] : undefined;
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url, `http://${host}`);
  const db = readDb();
  try {
    if (url.pathname === '/api/bootstrap' && req.method === 'GET') {
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      return json(res, 200, { db: { insumos: db.insumos, products: db.products, settings: db.settings }, day: d, report: report(db, d) });
    }
    if (url.pathname === '/api/day' && req.method === 'POST') {
      const data = await body(req);
      const d = dayFor(db, data.date || today());
      if (data.patch) {
        if (data.patch.payments) d.payments = Object.assign(d.payments || {}, data.patch.payments);
        if (data.patch.physical) d.physical = Object.assign(d.physical || {}, data.patch.physical);
        if (data.patch.opening) d.opening = Object.assign(d.opening || {}, data.patch.opening);
        const { payments, physical, opening, ...other } = data.patch;
        Object.assign(d, other);
      }
      writeDb(db, { day: d });
      return json(res, 200, { day: d, report: report(db, d) });
    }
    if (url.pathname === '/api/movement' && req.method === 'POST') {
      const x = await body(req);
      const d = dayFor(db, x.date);
      d.movements.push({ id: id('m'), insumoId: x.insumoId, type: x.type, quantity: Number(x.quantity), note: x.note || '', createdAt: new Date().toISOString() });
      writeDb(db, { day: d });
      return json(res, 201, { day: d, report: report(db, d) });
    }
    if (url.pathname.startsWith('/api/movement/') && req.method === 'DELETE') {
      const movementId = url.pathname.split('/')[3];
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      d.movements = d.movements.filter(m => m.id !== movementId);
      writeDb(db, { day: d });
      return json(res, 200, { day: d, report: report(db, d) });
    }
    if (url.pathname === '/api/expense' && req.method === 'POST') {
      const x = await body(req);
      const d = dayFor(db, x.date);
      d.expenses.push({ id: id('e'), provider: x.provider, detail: x.detail || '', amount: Number(x.amount) });
      writeDb(db, { day: d });
      return json(res, 201, { day: d, report: report(db, d) });
    }
    if (url.pathname.startsWith('/api/expense/') && req.method === 'DELETE') {
      const expenseId = url.pathname.split('/')[3];
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      d.expenses = d.expenses.filter(e => e.id !== expenseId);
      writeDb(db, { day: d });
      return json(res, 200, { day: d, report: report(db, d) });
    }
    if (url.pathname === '/api/sales' && req.method === 'POST') {
      const x = await body(req);
      const d = dayFor(db, x.date);
      d.sales = x.sales.map(s => saleRecord(db, s.productId, s.quantity));
      writeDb(db, { day: d });
      return json(res, 200, { day: d, report: report(db, d) });
    }
    if (url.pathname === '/api/import-sales' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const rows = parseSales(Buffer.concat(chunks));
      const d = dayFor(db, url.searchParams.get('date') || today());
      const created = []; const aggregated = {};
      rows.forEach(r => {
        let p = db.products.find(p => matchKey(p.name) === matchKey(r.name));
        if (!p) {
          p = {
            id: id('p'),
            name: r.name,
            price: r.value && r.quantity ? Math.round(r.value / r.quantity) : 0,
            recipe: [],
            directSale: false,
            category: inferCategory(r.name),
            subgroup: inferSubgroup(r.name)
          };
          db.products.push(p);
          created.push(p.name);
        }
        aggregated[p.id] = (aggregated[p.id] || 0) + r.quantity;
      });
      d.sales = Object.entries(aggregated).map(([productId, quantity]) => saleRecord(db, productId, quantity));
      writeDb(db, { day: d });
      return json(res, 200, { day: d, report: report(db, d), products: db.products, created, imported: rows.length, matched: d.sales.length });
    }
    if (url.pathname === '/api/import-insumos' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const rows = parseExcelRows(Buffer.concat(chunks));
      let added = 0, updated = 0, removed = 0;
      const incomingNames = new Set();

      rows.forEach(row => {
        const name = String(field(row, /NOMBRE.*INSUMO|^INSUMO$|^NOMBRE$/i) || '').trim();
        if (!name) return;
        incomingNames.add(normalize(name));
        const unit = String(field(row, /UNIDAD/i) || 'unidad').trim() || 'unidad';
        const price = Number(field(row, /COSTO|PRECIO/i) || 0);
        const active = normalize(field(row, /ACTIVO/i) || 'SI') !== 'NO';
        const current = db.insumos.find(i => normalize(i.name) === normalize(name));
        if (current) { Object.assign(current, { unit, price, active }); updated++; }
        else { db.insumos.push({ id: id('i'), name, unit, price, active: true }); added++; }
      });

      if (!incomingNames.size) throw Error('La plantilla Excel no contiene insumos válidos.');

      // Retirar de la vista cualquier insumo activo que no esté en la plantilla importada
      db.insumos.forEach(i => {
        if (i.active !== false && !incomingNames.has(normalize(i.name))) {
          i.active = false;
          removed++;
        }
      });

      writeDb(db, { catalog: true });
      return json(res, 200, { insumos: db.insumos, products: db.products, added, updated, removed });
    }
    if (url.pathname === '/api/import-products' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const rows = parseExcelRows(Buffer.concat(chunks));
      const groups = {}; const missing = [];
      rows.forEach(row => {
        const name = String(field(row, /PRODUCTO/i) || '').trim();
        if (!name) return;
        const ingredient = String(field(row, /INSUMO/i) || '').trim();
        const direct = normalize(field(row, /TIPO|VENTA DIRECTA/i) || '').includes('DIRECT');
        const category = String(field(row, /CATEGOR[IÍ]A|GRUPO|SECCION/i) || '').trim() || inferCategory(name);
        const subgroup = String(field(row, /SUBGRUPO|TAMA[NÑ]O|SUBTIPO/i) || '').trim() || inferSubgroup(name);
        if (!groups[normalize(name)]) groups[normalize(name)] = { name, price: Number(field(row, /PRECIO/i) || 0), recipe: [], directSale: direct, category, subgroup };
        if (ingredient) {
          const insumo = db.insumos.find(i => normalize(i.name) === normalize(ingredient) && i.active !== false);
          if (insumo) groups[normalize(name)].recipe.push({ insumoId: insumo.id, quantity: Number(field(row, /CANTIDAD/i) || 1) });
          else missing.push(ingredient);
        }
      });
      const incoming = Object.values(groups);
      if (!incoming.length) throw Error('La plantilla Excel no contiene productos válidos; no se aplicaron cambios.');
      let added = 0, updated = 0;
      incoming.forEach(p => {
        const current = db.products.find(x => normalize(x.name) === normalize(p.name));
        if (current) { current.price = p.price; current.recipe = p.recipe; current.directSale = p.directSale; current.category = p.category; current.subgroup = p.subgroup; updated++; }
        else { db.products.push({ id: id('p'), ...p }); added++; }
      });

      // Retirar de la vista cualquier producto que no esté en la plantilla importada
      const keep = new Set(incoming.map(p => normalize(p.name)));
      const before = db.products.length;
      db.products = db.products.filter(p => keep.has(normalize(p.name)));
      const removed = before - db.products.length;

      writeDb(db, { catalog: true });
      return json(res, 200, { insumos: db.insumos, products: db.products, added, updated, removed, missing: [...new Set(missing)] });
    }
    if (url.pathname === '/api/catalog' && req.method === 'POST') {
      const date = url.searchParams.get('date') || today();
      const day = dayFor(db, date);
      const x = await body(req);
      let newEntity = null;
      if (x.kind === 'insumo') {
        newEntity = { id: id('i'), name: x.name, unit: x.unit || 'unidad', price: Number(x.price || 0), active: true };
        db.insumos.push(newEntity);
        writeDb(db, { insumo: newEntity });
      }
      if (x.kind === 'product') {
        newEntity = { id: id('p'), name: x.name, price: Number(x.price || 0), recipe: x.recipe || [], directSale: Boolean(x.directSale), category: String(x.category || '').trim() || inferCategory(x.name), subgroup: String(x.subgroup || '').trim() || inferSubgroup(x.name) };
        db.products.push(newEntity);
        writeDb(db, { product: newEntity });
      }
      return json(res, 201, { insumos: db.insumos, products: db.products, report: report(db, day) });
    }
    if (url.pathname.startsWith('/api/catalog/') && req.method === 'PUT') {
      const date = url.searchParams.get('date') || today();
      const day = dayFor(db, date);
      const [, , , kind, entityId] = url.pathname.split('/');
      const x = await body(req);
      const collection = kind === 'insumo' ? db.insumos : kind === 'product' ? db.products : null;
      const entity = collection?.find(i => i.id === entityId);
      if (!entity) return json(res, 404, { error: 'Registro no encontrado' });
      if (kind === 'insumo') {
        Object.assign(entity, { name: String(x.name || '').trim(), unit: String(x.unit || 'unidad').trim(), price: Number(x.price || 0), active: x.active !== false });
        writeDb(db, { insumo: entity });
      }
      if (kind === 'product') {
        Object.assign(entity, { name: String(x.name || '').trim(), price: Number(x.price || 0), recipe: Array.isArray(x.recipe) ? x.recipe : [], directSale: Boolean(x.directSale), category: String(x.category || '').trim() || inferCategory(x.name), subgroup: String(x.subgroup || '').trim() || inferSubgroup(x.name) });
        writeDb(db, { product: entity });
      }
      return json(res, 200, { insumos: db.insumos, products: db.products, report: report(db, day) });
    }
    if (url.pathname.startsWith('/api/catalog/') && req.method === 'DELETE') {
      const date = url.searchParams.get('date') || today();
      const day = dayFor(db, date);
      const [, , , kind, entityId] = url.pathname.split('/');
      if (kind === 'insumo') {
        const entity = db.insumos.find(i => i.id === entityId);
        if (!entity) return json(res, 404, { error: 'Insumo no encontrado' });
        entity.active = false;
        writeDb(db, { insumo: entity });
      }
      if (kind === 'product') {
        const before = db.products.length;
        db.products = db.products.filter(p => p.id !== entityId);
        if (before === db.products.length) return json(res, 404, { error: 'Producto no encontrado' });
        writeDb(db, { deleteProduct: entityId });
      }
      return json(res, 200, { insumos: db.insumos, products: db.products, report: report(db, day) });
    }
    if (url.pathname === '/api/subgroups/assign-products' && req.method === 'POST') {
      const x = await body(req);
      const category = String(x.category || '').trim();
      const subgroup = String(x.subgroup || '').trim();
      if (!category || !subgroup) return json(res, 400, { error: 'Categoría y Subgrupo son obligatorios' });

      // 1. Asignar productos existentes por ID a este subgrupo
      if (Array.isArray(x.productIdsToAdd)) {
        x.productIdsToAdd.forEach(pId => {
          const prod = db.products.find(p => p.id === pId);
          if (prod) {
            prod.category = category;
            prod.subgroup = subgroup;
          }
        });
      }

      // 2. Quitar productos de este subgrupo
      if (Array.isArray(x.productIdsToRemove)) {
        x.productIdsToRemove.forEach(pId => {
          const prod = db.products.find(p => p.id === pId);
          if (prod && prod.category === category && prod.subgroup === subgroup) {
            prod.subgroup = 'Otros';
          }
        });
      }

      // 3. Crear productos nuevos si se especifican (ej. Combo 5, Grande de llevar)
      if (Array.isArray(x.newProducts)) {
        x.newProducts.forEach(np => {
          const name = String(np.name || '').trim();
          if (!name) return;
          const existing = db.products.find(p => normalize(p.name) === normalize(name));
          if (existing) {
            existing.category = category;
            existing.subgroup = subgroup;
            if (np.price != null && Number(np.price) > 0) existing.price = Number(np.price);
          } else {
            db.products.push({
              id: id('p'),
              name,
              price: Number(np.price || 0),
              recipe: [],
              directSale: false,
              category,
              subgroup
            });
          }
        });
      }

      // 4. Si se especifican nombres de productos de tirilla para asignar o registrar
      if (Array.isArray(x.productNamesToAdd)) {
        x.productNamesToAdd.forEach(pName => {
          const name = String(pName || '').trim();
          if (!name) return;
          const existing = db.products.find(p => normalize(p.name) === normalize(name));
          if (existing) {
            existing.category = category;
            existing.subgroup = subgroup;
          } else {
            db.products.push({
              id: id('p'),
              name,
              price: 0,
              recipe: [],
              directSale: false,
              category,
              subgroup
            });
          }
        });
      }

      writeDb(db, { catalog: true, settings: true });
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      return json(res, 200, { insumos: db.insumos, products: db.products, report: report(db, d), settings: db.settings });
    }
    if (url.pathname === '/api/subgroups/rename' && req.method === 'POST') {
      const x = await body(req);
      const category = String(x.category || '').trim();
      const oldSubgroup = String(x.oldSubgroup || '').trim();
      const newSubgroup = String(x.newSubgroup || '').trim();
      if (!category || !oldSubgroup || !newSubgroup) {
        return json(res, 400, { error: 'Categoría, subgrupo actual y nuevo nombre son obligatorios' });
      }

      let count = 0;
      db.products.forEach(p => {
        if ((p.category || '').toLowerCase() === category.toLowerCase() &&
            (p.subgroup || '').toLowerCase() === oldSubgroup.toLowerCase()) {
          p.subgroup = newSubgroup;
          count++;
        }
      });

      // Update viewSettings
      if (!db.settings) db.settings = { businessName: 'Wander', currency: 'COP' };
      if (!db.settings.viewSettings) db.settings.viewSettings = {};
      const vs = db.settings.viewSettings;
      if (vs.subgroupOrder && Array.isArray(vs.subgroupOrder[category])) {
        vs.subgroupOrder[category] = vs.subgroupOrder[category].map(s =>
          s.toLowerCase() === oldSubgroup.toLowerCase() ? newSubgroup : s
        );
      }
      if (vs.subgroupInsumoOrder) {
        const oldKey = `${category}::${oldSubgroup}`;
        const newKey = `${category}::${newSubgroup}`;
        if (vs.subgroupInsumoOrder[oldKey]) {
          vs.subgroupInsumoOrder[newKey] = vs.subgroupInsumoOrder[oldKey];
          delete vs.subgroupInsumoOrder[oldKey];
        }
      }
      if (vs.productOrder) {
        const oldKey = `${category}::${oldSubgroup}`;
        const newKey = `${category}::${newSubgroup}`;
        if (vs.productOrder[oldKey]) {
          vs.productOrder[newKey] = vs.productOrder[oldKey];
          delete vs.productOrder[oldKey];
        }
      }
      if (vs.hiddenSubgroups && Array.isArray(vs.hiddenSubgroups[category])) {
        vs.hiddenSubgroups[category] = vs.hiddenSubgroups[category].map(s =>
          s.toLowerCase() === oldSubgroup.toLowerCase() ? newSubgroup : s
        );
      }

      writeDb(db, { catalog: true, settings: true });
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      return json(res, 200, { products: db.products, report: report(db, d), settings: db.settings, count });
    }
    if (url.pathname === '/api/subgroups/delete' && req.method === 'POST') {
      const x = await body(req);
      const category = String(x.category || '').trim();
      const subgroup = String(x.subgroup || '').trim();
      const targetSubgroup = String(x.targetSubgroup || 'Especiales / Otros').trim();
      if (!category || !subgroup) {
        return json(res, 400, { error: 'Categoría y subgrupo son obligatorios' });
      }

      let count = 0;
      db.products.forEach(p => {
        if ((p.category || '').toLowerCase() === category.toLowerCase() &&
            (p.subgroup || '').toLowerCase() === subgroup.toLowerCase()) {
          p.subgroup = targetSubgroup;
          count++;
        }
      });

      // Clean viewSettings
      if (!db.settings) db.settings = { businessName: 'Wander', currency: 'COP' };
      if (!db.settings.viewSettings) db.settings.viewSettings = {};
      const vs = db.settings.viewSettings;
      if (vs.subgroupOrder && Array.isArray(vs.subgroupOrder[category])) {
        vs.subgroupOrder[category] = vs.subgroupOrder[category].filter(s =>
          s.toLowerCase() !== subgroup.toLowerCase()
        );
      }
      const key = `${category}::${subgroup}`;
      if (vs.subgroupInsumoOrder) delete vs.subgroupInsumoOrder[key];
      if (vs.productOrder) delete vs.productOrder[key];
      if (vs.hiddenSubgroups && Array.isArray(vs.hiddenSubgroups[category])) {
        vs.hiddenSubgroups[category] = vs.hiddenSubgroups[category].filter(s =>
          s.toLowerCase() !== subgroup.toLowerCase()
        );
      }

      writeDb(db, { catalog: true, settings: true });
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      return json(res, 200, { products: db.products, report: report(db, d), settings: db.settings, count });
    }
    if (url.pathname === '/api/view-settings' && req.method === 'PUT') {
      const x = await body(req);
      if (!db.settings) db.settings = { businessName: 'Wander', currency: 'COP' };
      db.settings.viewSettings = Object.assign(db.settings.viewSettings || {}, x.viewSettings || {});
      writeDb(db, { settings: true });
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      return json(res, 200, { settings: db.settings, report: report(db, d) });
    }
    if (url.pathname === '/api/export-report' && req.method === 'GET') {
      const date = url.searchParams.get('date') || today();
      const d = dayFor(db, date);
      const rep = report(db, d);
      const wb = XLSX.utils.book_new();

      // Sheet 1: Resumen
      const summaryRows = [
        ['REPORTE DE CUADRE DIARIO - WANDER'],
        ['Fecha', date],
        ['Generado el', new Date().toLocaleString('es-CO')],
        [],
        ['MÉTRICAS PRINCIPALES', 'VALOR (COP)'],
        ['Ventas según tirilla', rep.salesTotal],
        ['Gastos de caja', rep.expensesTotal],
        ['Efectivo esperado', rep.expectedCash],
        ['Efectivo reportado (Caja)', rep.reportedCash],
        ['Diferencia de efectivo', rep.cashDifference],
        ['Valor faltante de inventario', rep.shortageValue]
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary['!cols'] = [{ wch: 30 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Cierre');

      // Sheet 2: Auditoria Insumos
      const auditRows = [
        ['Insumo', 'Unidad', 'Inicial', 'Entradas', 'Mermas/Consumos', 'Físico Final', 'Salida Real', 'Teórico Tirilla', 'Diferencia', 'Valor Diferencia COP']
      ];
      rep.inventory.forEach(r => {
        auditRows.push([
          r.insumo.name, r.insumo.unit, r.opening, r.entries, r.adjustments, r.physical, r.calculatedOut, r.theoretical, r.difference, r.value
        ]);
      });
      const wsAudit = XLSX.utils.aoa_to_sheet(auditRows);
      wsAudit['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsAudit, 'Auditoría Insumos');

      // Sheet 3: Ventas
      const salesRows = [['Producto', 'Cantidad Vendida', 'Precio Unitario', 'Subtotal']];
      d.sales.forEach(s => {
        const prod = db.products.find(p => p.id === s.productId);
        salesRows.push([s.productName || prod?.name || '', s.quantity, s.price, s.quantity * s.price]);
      });
      const wsSales = XLSX.utils.aoa_to_sheet(salesRows);
      wsSales['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsSales, 'Ventas Tirilla');

      // Sheet 4: Gastos
      const expenseRows = [['Proveedor', 'Detalle', 'Valor COP']];
      d.expenses.forEach(e => {
        expenseRows.push([e.provider, e.detail || '', e.amount]);
      });
      const wsExpenses = XLSX.utils.aoa_to_sheet(expenseRows);
      wsExpenses['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, wsExpenses, 'Gastos Caja');

      const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="cuadre-wander-${date}.xlsx"`
      });
      return res.end(content);
    }

    if (url.pathname === '/api/cloud-status' && req.method === 'GET') {
      const dbInstance = firestoreSync.getFirestore();
      return json(res, 200, {
        cloudConnected: Boolean(dbInstance),
        database: 'PostgreSQL Enterprise (Wander Cloud SQL)',
        provider: 'Google Cloud Platform',
        localCount: {
          insumos: db.insumos.length,
          products: db.products.length,
          days: db.days.length
        }
      });
    }
    if (url.pathname === '/api/sync-cloud' && req.method === 'POST') {
      await firestoreSync.saveAllToFirestore(db);
      return json(res, 200, { success: true, message: 'Copia de seguridad guardada en Cloud Firestore exitosamente.' });
    }
    if (url.pathname === '/api/cloud-restore' && req.method === 'POST') {
      const cloudRes = await firestoreSync.loadFromFirestore(3);
      if (cloudRes && cloudRes.success && (cloudRes.insumos?.length || cloudRes.products?.length)) {
        const cloudData = {
          settings: cloudRes.settings || { businessName: 'Wander', currency: 'COP' },
          insumos: cloudRes.insumos || [],
          products: cloudRes.products || [],
          days: cloudRes.days || []
        };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(cloudData, null, 2));
        const date = url.searchParams.get('date') || today();
        const d = dayFor(cloudData, date);
        return json(res, 200, {
          success: true,
          message: `Sincronizados ${cloudData.insumos.length} insumos y ${cloudData.products.length} productos desde Cloud Firestore`,
          db: { insumos: cloudData.insumos, products: cloudData.products, settings: cloudData.settings },
          day: d,
          report: report(cloudData, d)
        });
      }
      return json(res, 400, { error: 'No se pudieron recuperar datos de Cloud Firestore: ' + (cloudRes.reason || 'Sin datos') });
    }

    if (url.pathname === '/' || url.pathname === '/index.html') return serve(res, 'index.html', 'text/html');
    if (url.pathname === '/app.js') return serve(res, 'app.js', 'application/javascript');
    if (url.pathname === '/styles.css') return serve(res, 'styles.css', 'text/css');
    if (url.pathname === '/extra.css') return serve(res, 'extra.css', 'text/css');
    if (url.pathname === '/inventory.css') return serve(res, 'inventory.css', 'text/css');
    if (url.pathname === '/templates/plantilla-insumos.xlsx') return sendTemplate(res, 'plantilla-insumos.xlsx', 'Insumos', [['Nombre del insumo', 'Unidad de medida', 'Costo unitario COP', 'Activo (SI/NO)'], ...db.insumos.map(i => [i.name, i.unit, i.price, i.active === false ? 'NO' : 'SI'])], [30, 22, 22, 18]);
    if (url.pathname === '/templates/plantilla-productos-recetas.xlsx') {
      const rows = [['Producto de carta', 'Precio de venta COP', 'Insumo', 'Cantidad por venta', 'Unidad', 'Tipo', 'Nota opcional']];
      db.products.forEach(p => {
        if (p.recipe?.length) p.recipe.forEach(r => { const i = db.insumos.find(x => x.id === r.insumoId); rows.push([p.name, p.price, i?.name || '', r.quantity, i?.unit || '', p.directSale ? 'VENTA DIRECTA' : 'RECETA', '']); });
        else rows.push([p.name, p.price, '', '', '', p.directSale ? 'VENTA DIRECTA' : 'RECETA', 'Deje sin insumo solo si no descuenta inventario']);
      });
      return sendTemplate(res, 'plantilla-productos-recetas.xlsx', 'Productos y recetas', rows, [28, 20, 28, 20, 16, 18, 34]);
    }
    json(res, 404, { error: 'No encontrado' });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

function serve(res, file, type) {
  const content = fs.readFileSync(path.join(ROOT, 'public', file));
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(content);
}

function sendTemplate(res, name, sheetName, rows, widths) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.writeHead(200, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${name}"`
  });
  res.end(content);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] El puerto ${PORT} ya está en uso por otro proceso.`);
    console.error(`Si tienes otra consola o servidor Node abierto, ciérralo o ejecuta: npx kill-port ${PORT}\n`);
    process.exit(1);
  }
});

function startServer() {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Wander listo en http://0.0.0.0:${PORT}`);
    
    // Background cloud sync
    firestoreSync.loadFromFirestore(3).then(cloudRes => {
      if (cloudRes && cloudRes.success && (cloudRes.insumos?.length || cloudRes.products?.length || cloudRes.days?.length)) {
        console.log(`[Server] Sincronizando datos de Cloud Firestore a caché local (${cloudRes.insumos.length} insumos, ${cloudRes.products.length} productos)...`);
        const cloudData = {
          settings: cloudRes.settings || { businessName: 'Wander', currency: 'COP' },
          insumos: cloudRes.insumos || [],
          products: cloudRes.products || [],
          days: cloudRes.days || []
        };
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DB_FILE, JSON.stringify(cloudData, null, 2));
      } else if (cloudRes && cloudRes.isVirgin) {
        console.log('[Server] Cloud Firestore está completamente virgen. Inicializando base inicial...');
        const localDb = readDb();
        firestoreSync.saveAllToFirestore(localDb).catch(err => {
          console.error('[Server] Falló la subida inicial a la base de datos:', err.message);
        });
      } else {
        console.warn('[Server] Cloud Firestore no disponible o en espera; preservando datos locales sin sobreescribir la nube.');
      }
    }).catch(err => {
      console.warn('[Server] Error inicializando persistencia en la nube:', err.message);
    });
  });
}

startServer();
