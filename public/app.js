let state = {};

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const num = n => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n || 0);

function toast(t) {
  const e = $('#toast');
  if (!e) return;
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2800);
}

async function api(url, method = 'GET', data) {
  const raw = data instanceof FormData || data instanceof ArrayBuffer || ArrayBuffer.isView(data);
  const r = await fetch(url, {
    method,
    headers: data && !raw ? { 'Content-Type': 'application/json' } : {},
    body: data && !raw ? JSON.stringify(data) : data
  });
  const x = await r.json();
  if (!r.ok) throw Error(x.error || 'Error en la solicitud');
  return x;
}

async function load() {
  const date = $('#date').value;
  state = await api('/api/bootstrap?date=' + date);
  render();
}

function render() {
  const { db, day, report } = state;

  // Payments form
  const pf = $('#paymentForm');
  if (pf) {
    pf.elements.cash.value = day.payments.cash || '';
    ['nequi', 'bancolombia', 'credit', 'vouchers'].forEach(k => {
      if (pf.elements[k]) pf.elements[k].value = day.payments[k] || '';
    });
  }

  // Movements Select
  const moveInsumo = $('#moveInsumo');
  if (moveInsumo) {
    moveInsumo.innerHTML = db.insumos.filter(i => i.active !== false)
      .map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');
  }

  // Sales List
  const salesList = $('#salesList');
  if (salesList) {
    salesList.innerHTML = day.sales.length ? day.sales.map(s => {
      const p = db.products.find(p => p.id === s.productId);
      return `<div class="row">
        <span><b>${s.productName || p?.name || 'Producto'}</b> <small>${num(s.quantity)} und.</small></span>
        <b>${money(s.quantity * (s.price ?? p?.price ?? 0))}</b>
      </div>`;
    }).join('') : '<p class="hint">Aún no hay ventas registradas en la tirilla.</p>';
  }

  // Movements List
  const movements = $('#movements');
  if (movements) {
    movements.innerHTML = day.movements.length ? day.movements.slice().reverse().map(m => {
      const i = db.insumos.find(i => i.id === m.insumoId);
      const label = m.type === 'entry' ? 'Entrada' : m.type === 'waste' ? 'Merma' : m.type === 'employee' ? 'Trabajador' : 'Cortesía';
      return `<div class="row">
        <span><b>${label}</b> · ${i?.name || 'Insumo'} <small>${m.note || ''}</small></span>
        <div class="row-actions">
          <b>${num(m.quantity)}</b>
          <button class="btn danger-sm" onclick="deleteMovement('${m.id}')">✕</button>
        </div>
      </div>`;
    }).join('') : '<p class="hint">Sin movimientos registrados hoy.</p>';
  }

  // Expenses List
  const expenses = $('#expenses');
  if (expenses) {
    expenses.innerHTML = day.expenses.length ? day.expenses.slice().reverse().map(e => `
      <div class="row">
        <span><b>${e.provider}</b> <small>${e.detail || ''}</small></span>
        <div class="row-actions">
          <b>${money(e.amount)}</b>
          <button class="btn danger-sm" onclick="deleteExpense('${e.id}')">✕</button>
        </div>
      </div>
    `).join('') : '<p class="hint">Sin gastos de caja registrados.</p>';
  }

  // Inventory Cards (Physical count)
  renderInventoryForm();

  // Metrics Cards Dashboard
  renderMetrics();

  // Category Breakdown Section
  renderCategoryBreakdown();

  // Product Breakdown Table
  const productBreakdown = $('#productBreakdown');
  if (productBreakdown) {
    productBreakdown.innerHTML = report.productBreakdown.length ? report.productBreakdown.map(p => `
      <tr>
        <td><b>${p.name}</b> <span class="badge badge-info">${p.category || 'Hamburguesas'}</span></td>
        <td>${num(p.quantity)}</td>
        <td>${p.directSale
          ? '<span class="badge badge-info">Venta directa · no descuenta inventario</span>'
          : p.ingredients.length
            ? p.ingredients.map(i => `<span class="ingredient-chip">${num(i.quantity)} ${i.unit} de ${i.name}</span>`).join(' ')
            : '<span class="badge badge-danger">Sin receta asignada</span>'
        }</td>
      </tr>
    `).join('') : '<tr><td colspan="3" class="hint">No hay ventas cargadas en la tirilla.</td></tr>';
  }

  // Audit Table
  renderAuditTable();

  // Catalog Lists
  renderCatalogLists();
  renderCatalogEditor();
}

function renderCategoryBreakdown() {
  const box = $('#categoryBreakdown');
  if (!box) return;
  const { report } = state;
  const breakdown = report.categoryBreakdown || [];

  if (!breakdown.length) {
    box.innerHTML = '<p class="hint">Aún no hay productos registrados en el catálogo para realizar el arqueo por categoría.</p>';
    return;
  }

  box.innerHTML = breakdown.map(cat => `
    <div class="category-list-card">
      <div class="category-list-header">
        <div>
          <h3>CATEGORÍA: ${cat.category.toUpperCase()}</h3>
          <span class="hint">Auditoría detallada por subgrupo y comparación con salida de inventario físico</span>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-ok" style="font-size:12px;">Total Categoría: ${num(cat.totalUnits)} und.</span>
          <div style="font-size:16px; font-weight:800; color:var(--brand-teal); margin-top:2px;">${money(cat.totalSalesValue)}</div>
        </div>
      </div>

      ${(cat.subgroups || []).map(sg => `
        <div class="subgroup-card-block">
          <div class="table-wrap">
            <table class="excel-like-table">
              <thead>
                <tr class="excel-subgroup-title-row">
                  <th>${cat.category.toUpperCase()} ${sg.subgroup.toUpperCase()}</th>
                  <th style="text-align:center; width:100px;">CANTIDAD</th>
                  <th style="text-align:right; width:140px;">VALOR ($)</th>
                </tr>
              </thead>
              <tbody>
                ${sg.products.map(p => `
                  <tr class="${p.quantity > 0 ? 'sold-row' : 'zero-row'}">
                    <td><b>${p.name}</b></td>
                    <td style="text-align:center;"><b>${num(p.quantity)}</b></td>
                    <td style="text-align:right;">${p.quantity > 0 ? money(p.total) : '$ -'}</td>
                  </tr>
                `).join('')}
                <tr class="excel-total-row">
                  <td><b>TOTAL SUBGRUPO ${sg.subgroup.toUpperCase()}</b></td>
                  <td style="text-align:center;"><b>${num(sg.totalUnits)}</b></td>
                  <td style="text-align:right;"><b>${money(sg.totalSalesValue)}</b></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="excel-audit-container">
            <table class="excel-like-table">
              <thead>
                <tr class="audit-subgroup-header">
                  <th>AUDITORÍA DE INSUMOS DE ESTE TAMAÑO (${sg.subgroup.toUpperCase()})</th>
                  <th style="text-align:center; width:100px;">CANTIDAD</th>
                  <th style="text-align:right; width:140px;">CUADRE / ESTADO</th>
                </tr>
              </thead>
              <tbody>
                ${(sg.insumosAudit || []).map(ia => {
                  if (!ia || !ia.insumo) return '';
                  const insName = String(ia.insumo.name || 'INSUMO').toUpperCase();
                  const diff = Number(ia.difference || 0);
                  const statusClass = diff === 0 ? 'status-ok' : diff > 0 ? 'status-diff-neg' : 'status-diff-pos';
                  const statusText = diff === 0 ? '0 (OK)' : diff > 0 ? `+${num(diff)} (Faltante físico)` : `${num(diff)} (Sobrante)`;
                  return `
                    <tr>
                      <td><b>${insName} - TOTAL INVENTARIO FÍSICO</b></td>
                      <td style="text-align:center;"><b>${num(ia.calculatedOut)}</b></td>
                      <td style="text-align:right; font-size:11px; color:var(--muted);">Salida Real Conteo</td>
                    </tr>
                    <tr>
                      <td><b>${insName} - TOTAL EXIGIDO TIRILLA</b></td>
                      <td style="text-align:center;"><b>${num(ia.theoretical)}</b></td>
                      <td style="text-align:right; font-size:11px; color:var(--muted);">Requerido Ventas</td>
                    </tr>
                    <tr class="excel-cuadre-row">
                      <td><b>${insName} - CUADRE / DIFERENCIA</b></td>
                      <td style="text-align:center;">
                        <b class="${diff > 0 ? 'negative' : diff < 0 ? 'positive' : ''}">${num(diff)}</b>
                      </td>
                      <td style="text-align:right;">
                        <span class="${statusClass}">${statusText}</span>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `).join('')}

      <div class="excel-category-total-banner">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:14px; font-weight:800;">GRAN TOTAL CATEGORÍA ${cat.category.toUpperCase()}</span>
          <span style="font-size:16px; font-weight:800; color:var(--brand-accent);">${num(cat.totalUnits)} UND. | ${money(cat.totalSalesValue)}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderInventoryForm() {
  const box = $('#inventoryForm');
  if (!box) return;
  const filter = ($('#inventorySearch')?.value || '').toLowerCase().trim();
  const { report, day } = state;

  const items = report.inventory.filter(r => r.insumo.name.toLowerCase().includes(filter));
  box.innerHTML = items.length ? items.map(r => `
    <div class="inventory-card">
      <div class="inventory-name">
        <b>${r.insumo.name}</b>
        <small>${r.insumo.unit}</small>
      </div>
      <span><small>Inicial</small><b>${num(r.opening)}</b></span>
      <span><small>Entrada</small><b style="color:var(--brand-teal);">${r.entries ? num(r.entries) : '—'}</b></span>
      <span><small>Salida</small><b style="color:var(--red);">${r.adjustments ? num(r.adjustments) : '—'}</b></span>
      <label>
        <small>Final Físico</small>
        <input data-insumo="${r.insumo.id}" aria-label="Final físico de ${r.insumo.name}" type="number" step="0.01" min="0" value="${day.physical[r.insumo.id] ?? 0}">
      </label>
    </div>
  `).join('') : '<p class="hint">No se encontraron insumos coincidentes.</p>';
}

function renderMetrics() {
  const box = $('#metrics');
  if (!box) return;
  const { report } = state;

  const list = [
    { label: 'Ventas Tirilla', val: report.salesTotal, type: 'neutral', icon: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
    { label: 'Gastos de Caja', val: report.expensesTotal, type: 'neutral', icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>' },
    { label: 'Efectivo Esperado', val: report.expectedCash, type: 'neutral', icon: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>' },
    { label: 'Diferencia Caja', val: report.cashDifference, type: report.cashDifference < 0 ? 'negative' : 'positive', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' },
    { label: 'Faltante Valorizado', val: report.shortageValue, type: report.shortageValue > 0 ? 'negative' : 'positive', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' }
  ];

  box.innerHTML = list.map(m => `
    <div class="metric-card ${m.type}">
      <div class="metric-card-header">
        <label>${m.label}</label>
        <div class="metric-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${m.icon}</svg>
        </div>
      </div>
      <strong>${money(m.val)}</strong>
    </div>
  `).join('');
}

function renderAuditTable() {
  const box = $('#auditTable');
  if (!box) return;
  const filter = ($('#auditSearch')?.value || '').toLowerCase().trim();
  const { report } = state;

  const items = report.inventory.filter(r => r.insumo.name.toLowerCase().includes(filter));
  box.innerHTML = items.length ? items.map(r => {
    const diff = r.difference;
    const badgeClass = diff > 0 ? 'badge-danger' : diff < 0 ? 'badge-info' : 'badge-ok';
    const badgeText = diff > 0 ? 'Faltante' : diff < 0 ? 'Sobrante' : 'OK';

    return `<tr>
      <td><b>${r.insumo.name}</b><br><small>${r.insumo.unit}</small></td>
      <td>${num(r.opening)}</td>
      <td>${num(r.entries)}</td>
      <td>${num(r.adjustments)}</td>
      <td><b>${num(r.physical)}</b></td>
      <td>${num(r.calculatedOut)}</td>
      <td>${num(r.theoretical)}</td>
      <td class="${diff > 0 ? 'negative' : diff < 0 ? 'positive' : ''}"><b>${num(diff)}</b></td>
      <td><span class="badge ${badgeClass}">${badgeText}</span></td>
      <td class="${r.value > 0 ? 'negative' : r.value < 0 ? 'positive' : ''}"><b>${money(r.value)}</b></td>
    </tr>`;
  }).join('') : '<tr><td colspan="10" class="hint">No hay insumos coincidentes con la búsqueda.</td></tr>';
}

function renderCatalogLists() {
  const { db } = state;
  const visibleInsumos = db.insumos.filter(i => i.active !== false);

  const insumosList = $('#insumosList');
  if (insumosList) {
    insumosList.innerHTML = `<div class="catalog-search margin-top">
      <input id="insumoSearch" list="insumoOptions" placeholder="Buscar insumo para editar...">
      <datalist id="insumoOptions">${visibleInsumos.map(i => `<option value="${i.name}"></option>`).join('')}</datalist>
      <button type="button" id="openInsumoEdit" class="btn outline">Editar Insumo</button>
    </div>` + visibleInsumos.map(i => `
      <div class="row" data-insumo-row="${i.id}">
        <span><b>${i.name}</b> <small>(${i.unit})</small></span>
        <div class="row-actions">
          <b>${money(i.price)}</b>
          <button class="edit-btn" data-edit-insumo="${i.id}">Editar</button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('[data-edit-insumo]').forEach(b => {
      b.onclick = () => { state.editing = { kind: 'insumo', id: b.dataset.editInsumo }; renderCatalogEditor(); };
    });

    const openEditBtn = $('#openInsumoEdit');
    if (openEditBtn) {
      openEditBtn.onclick = () => {
        const target = visibleInsumos.find(i => i.name.toLowerCase() === $('#insumoSearch').value.trim().toLowerCase());
        if (!target) return toast('Selecciona un insumo válido de la lista');
        state.editing = { kind: 'insumo', id: target.id };
        renderCatalogEditor();
      };
    }
  }

  const productsList = $('#productsList');
  if (productsList) {
    productsList.innerHTML = db.products.map(p => `
      <div class="row">
        <span><b>${p.name}</b> <span class="badge badge-info" style="margin-left: 6px;">${p.category || 'Hamburguesas'}</span><br><small>${p.recipe.map(r => `${db.insumos.find(i => i.id === r.insumoId)?.name || '?'} × ${r.quantity}`).join(' + ') || 'Sin insumos'}</small></span>
        <div class="row-actions">
          <b>${money(p.price)}</b>
          <button class="edit-btn" data-edit-product="${p.id}">Editar Receta</button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('[data-edit-product]').forEach(b => {
      b.onclick = () => { state.editing = { kind: 'product', id: b.dataset.editProduct }; renderCatalogEditor(); };
    });
  }

  renderRecipeLines();
}

function renderRecipeLines() {
  const box = $('#recipeLines');
  if (!box) return;
  const old = [...box.querySelectorAll('.recipe-line')].map(x => ({ id: x.querySelector('select')?.value, q: x.querySelector('input')?.value || 1 }));
  const rows = old.length ? old : [{ id: state.db.insumos[0]?.id, q: 1 }];
  box.innerHTML = rows.map(r => `
    <span class="recipe-line">
      <select>${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.id}" ${i.id === r.id ? 'selected' : ''}>${i.name}</option>`).join('')}</select>
      <input type="number" min="0.01" step="0.01" value="${r.q}">
      <button type="button" class="removeIngredient">×</button>
    </span>
  `).join('');

  box.querySelectorAll('.removeIngredient').forEach(b => {
    b.onclick = () => {
      if (box.children.length > 1) b.closest('.recipe-line').remove();
      else toast('La receta debe contener al menos un ingrediente');
    };
  });
}

function renderCatalogEditor() {
  const box = $('#catalogEditor');
  if (!box) return;
  if (!state.editing) { box.innerHTML = ''; return; }

  const entity = (state.editing.kind === 'insumo' ? state.db.insumos : state.db.products).find(x => x.id === state.editing.id);
  if (!entity) { state.editing = null; box.innerHTML = ''; return; }

  if (state.editing.kind === 'insumo') {
    box.innerHTML = `<article class="card editor">
      <div class="card-header">
        <h2>Editar Insumo: ${entity.name}</h2>
        <div>
          <button type="button" id="deleteEdit" class="btn danger-sm">Eliminar Insumo</button>
          <button type="button" id="cancelEdit" class="btn outline">Cerrar Editor</button>
        </div>
      </div>
      <form id="editInsumoForm" class="form inline-insumo">
        <input name="name" list="editInsumoOptions" value="${entity.name}" required>
        <datalist id="editInsumoOptions">${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.name}"></option>`).join('')}</datalist>
        <input name="unit" value="${entity.unit}" required>
        <input name="price" type="number" min="0" value="${entity.price}" required>
        <button type="submit" class="btn primary">Guardar Insumo</button>
      </form>
    </article>`;
    $('#editInsumoForm').onsubmit = saveEditedInsumo;
  } else {
    box.innerHTML = `<article class="card editor">
      <div class="card-header">
        <h2>Editar Producto y Receta: ${entity.name}</h2>
        <div>
          <button type="button" id="deleteEdit" class="btn danger-sm">Eliminar Producto</button>
          <button type="button" id="cancelEdit" class="btn outline">Cerrar Editor</button>
        </div>
      </div>
      <form id="editProductForm" class="form">
        <label>
          <span>Nombre del Producto</span>
          <input name="name" list="editProductOptions" value="${entity.name}" required>
          <datalist id="editProductOptions">${state.db.products.map(p => `<option value="${p.name}"></option>`).join('')}</datalist>
        </label>
        <label>
          <span>Categoría / Grupo General</span>
          <input name="category" list="editCategoryOptions" value="${entity.category || 'Hamburguesas'}" required>
          <datalist id="editCategoryOptions">
            <option value="Hamburguesas"></option>
            <option value="Perros"></option>
            <option value="Sándwiches"></option>
            <option value="Bebidas"></option>
            <option value="Adiciones y Entradas"></option>
          </datalist>
        </label>
        <label>
          <span>Subgrupo / Tamaño</span>
          <input name="subgroup" list="editSubgroupOptions" value="${entity.subgroup || 'Medianas / Normales'}" required>
          <datalist id="editSubgroupOptions">
            <option value="Grandes / Súper"></option>
            <option value="Medianas / Normales"></option>
            <option value="Pequeñas / Junior"></option>
            <option value="Especiales / Otros"></option>
          </datalist>
        </label>
        <label>
          <span>Precio de Venta COP</span>
          <input name="price" type="number" min="0" value="${entity.price}" required>
        </label>
        <label class="sync-toggle">
          <input name="directSale" type="checkbox" ${entity.directSale ? 'checked' : ''}>
          Venta directa: no descuenta insumos de inventario
        </label>
        <div class="recipe-wide">
          <div class="recipe-header">
            <span>Ingredientes de la Receta</span>
            <button type="button" id="addEditIngredient" class="btn text-btn">+ Añadir ingrediente</button>
          </div>
          <div id="editRecipeLines">${recipeLinesHtml(entity.recipe)}</div>
        </div>
        <button type="submit" class="btn primary">Guardar Producto y Receta</button>
      </form>
    </article>`;
    bindEditRecipe();
    $('#editProductForm').onsubmit = saveEditedProduct;
  }

  $('#cancelEdit').onclick = () => { state.editing = null; renderCatalogEditor(); };
  $('#deleteEdit').onclick = deleteEdited;
}

function recipeLinesHtml(recipe) {
  return recipe.map(r => `
    <span class="recipe-line">
      <select>${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.id}" ${i.id === r.insumoId ? 'selected' : ''}>${i.name}</option>`).join('')}</select>
      <input type="number" min="0.01" step="0.01" value="${r.quantity}">
      <button type="button" class="removeIngredient">×</button>
    </span>
  `).join('');
}

function bindEditRecipe() {
  const box = $('#editRecipeLines');
  if (!box) return;
  const remove = () => box.querySelectorAll('.removeIngredient').forEach(b => b.onclick = () => {
    if (box.children.length > 1) b.closest('.recipe-line').remove();
    else toast('La receta debe contener al menos un ingrediente');
  });
  remove();
  $('#addEditIngredient').onclick = () => {
    box.insertAdjacentHTML('beforeend', recipeLinesHtml([{ insumoId: state.db.insumos[0]?.id, quantity: 1 }]));
    remove();
  };
}

async function saveEditedInsumo(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const x = await api(`/api/catalog/insumo/${state.editing.id}`, 'PUT', Object.fromEntries(f));
  state.db.insumos = x.insumos;
  state.db.products = x.products;
  state.editing = null;
  render();
  toast('Insumo actualizado');
}

async function saveEditedProduct(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const recipe = [...$('#editRecipeLines').querySelectorAll('.recipe-line')].map(x => ({
    insumoId: x.querySelector('select').value,
    quantity: Number(x.querySelector('input').value)
  }));
  const x = await api(`/api/catalog/product/${state.editing.id}`, 'PUT', {
    name: f.get('name'),
    category: f.get('category'),
    subgroup: f.get('subgroup'),
    price: Number(f.get('price')),
    recipe,
    directSale: f.get('directSale') === 'on'
  });
  state.db.insumos = x.insumos;
  state.db.products = x.products;
  state.editing = null;
  render();
  toast('Producto y receta actualizados');
}

async function deleteEdited() {
  const label = state.editing.kind === 'insumo' ? 'insumo' : 'producto';
  if (!confirm(`¿Estás seguro de eliminar este ${label}?`)) return;
  try {
    const x = await api(`/api/catalog/${state.editing.kind}/${state.editing.id}`, 'DELETE');
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    state.editing = null;
    render();
    toast(`${label[0].toUpperCase() + label.slice(1)} eliminado correctamente`);
  } catch (e) {
    toast(e.message);
  }
}

async function deleteExpense(expenseId) {
  if (!confirm('¿Eliminar este gasto de caja?')) return;
  try {
    const date = $('#date').value;
    const x = await api(`/api/expense/${expenseId}?date=${date}`, 'DELETE');
    state.day = x.day;
    state.report = x.report;
    render();
    toast('Gasto eliminado');
  } catch (e) {
    toast(e.message);
  }
}

async function deleteMovement(movementId) {
  if (!confirm('¿Eliminar este movimiento de inventario?')) return;
  try {
    const date = $('#date').value;
    const x = await api(`/api/movement/${movementId}?date=${date}`, 'DELETE');
    state.day = x.day;
    state.report = x.report;
    render();
    toast('Movimiento eliminado');
  } catch (e) {
    toast(e.message);
  }
}

function bind() {
  // Navigation Tabs
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.nav-btn, .tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      $('#' + b.dataset.tab).classList.add('active');
    };
  });

  // Date Change
  $('#date').onchange = load;

  // Search Inputs Live Filter
  const invSearch = $('#inventorySearch');
  if (invSearch) invSearch.oninput = renderInventoryForm;

  const audSearch = $('#auditSearch');
  if (audSearch) audSearch.oninput = renderAuditTable;

  // Import Sales Tirilla
  $('#importBtn').onclick = async () => {
    const f = $('#xlsx').files[0];
    if (!f) return toast('Selecciona un archivo Excel de tirilla');
    try {
      const x = await api('/api/import-sales?date=' + $('#date').value, 'POST', await f.arrayBuffer());
      state.day = x.day;
      state.report = x.report;
      state.db.products = x.products;
      render();
      $('#importResult').innerHTML = `
        <span class="badge badge-ok">${x.imported} filas leídas · ${x.matched} productos cargados</span>
        ${x.created.length ? `<span class="badge badge-danger">Creados sin receta: ${x.created.join(', ')}</span>` : ''}
      `;
      toast('Tirilla importada correctamente');
    } catch (e) {
      toast(e.message);
    }
  };

  // Payment Form
  $('#paymentForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const p = Object.fromEntries([...f].map(([k, v]) => [k, Number(v || 0)]));
    const x = await api('/api/day', 'POST', { date: $('#date').value, patch: { payments: p } });
    state.day = x.day;
    state.report = x.report;
    render();
    toast('Registro de pagos guardado');
  };

  // Movement Form
  $('#movementForm').onsubmit = async e => {
    e.preventDefault();
    const x = await api('/api/movement', 'POST', { date: $('#date').value, ...Object.fromEntries(new FormData(e.target)) });
    state.day = x.day;
    state.report = x.report;
    render();
    e.target.reset();
    toast('Movimiento registrado');
  };

  // Expense Form
  $('#expenseForm').onsubmit = async e => {
    e.preventDefault();
    const x = await api('/api/expense', 'POST', { date: $('#date').value, ...Object.fromEntries(new FormData(e.target)) });
    state.day = x.day;
    state.report = x.report;
    render();
    e.target.reset();
    toast('Gasto registrado');
  };

  // Save Physical Inventory Count
  $('#saveInventory').onclick = async () => {
    const physical = {};
    document.querySelectorAll('[data-insumo]').forEach(i => physical[i.dataset.insumo] = Number(i.value || 0));
    const x = await api('/api/day', 'POST', { date: $('#date').value, patch: { physical } });
    state.day = x.day;
    state.report = x.report;
    render();
    toast('Conteo físico guardado correctamente');
  };

  // Add Insumo Form
  $('#insumoForm').onsubmit = async e => {
    e.preventDefault();
    const x = await api('/api/catalog', 'POST', { kind: 'insumo', ...Object.fromEntries(new FormData(e.target)) });
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    render();
    e.target.reset();
    toast('Nuevo insumo añadido');
  };

  // Import Insumos Excel
  $('#importInsumos').onclick = async () => {
    const f = $('#insumosXlsx').files[0];
    if (!f) return toast('Selecciona el archivo Excel de insumos');
    try {
      const x = await api('/api/import-insumos', 'POST', await f.arrayBuffer());
      state.db.insumos = x.insumos;
      state.db.products = x.products;
      render();
      $('#insumosImportResult').innerHTML = `
        <span class="badge badge-ok">${x.added} nuevos · ${x.updated} actualizados</span>
        ${x.removed ? `<span class="badge badge-danger">${x.removed} insumos retirados (borrados del Excel)</span>` : ''}
      `;
      toast('Catálogo de insumos sincronizado correctamente');
    } catch (e) {
      toast(e.message);
    }
  };

  // Import Products Excel
  $('#importProducts').onclick = async () => {
    const f = $('#productsXlsx').files[0];
    if (!f) return toast('Selecciona el archivo Excel de productos');
    try {
      const x = await api('/api/import-products', 'POST', await f.arrayBuffer());
      state.db.insumos = x.insumos;
      state.db.products = x.products;
      render();
      $('#productsImportResult').innerHTML = `
        <span class="badge badge-ok">${x.added} nuevos · ${x.updated} actualizados</span>
        ${x.removed ? `<span class="badge badge-danger">${x.removed} productos retirados (borrados del Excel)</span>` : ''}
        ${x.missing.length ? `<span class="badge badge-danger">Insumos no encontrados: ${x.missing.join(', ')}</span>` : ''}
      `;
      toast('Carta y recetas sincronizadas correctamente');
    } catch (e) {
      toast(e.message);
    }
  };

  // Add Ingredient Button in Product Form
  $('#addIngredient').onclick = () => {
    const box = $('#recipeLines');
    const line = document.createElement('span');
    line.className = 'recipe-line';
    line.innerHTML = `
      <select>${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select>
      <input type="number" min="0.01" step="0.01" value="1">
      <button type="button" class="removeIngredient">×</button>
    `;
    line.querySelector('button').onclick = () => line.remove();
    box.append(line);
  };

  // Add Product Form
  $('#productForm').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const recipe = [...$('#recipeLines').querySelectorAll('.recipe-line')].map(x => ({
      insumoId: x.querySelector('select').value,
      quantity: Number(x.querySelector('input').value)
    }));
    const x = await api('/api/catalog', 'POST', {
      kind: 'product',
      name: f.get('name'),
      category: f.get('category'),
      subgroup: f.get('subgroup'),
      price: Number(f.get('price')),
      recipe
    });
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    e.target.reset();
    render();
    toast('Producto y receta guardados');
  };

  // Export Excel Report
  const exportBtn = $('#exportReportBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const date = $('#date').value;
      window.location.href = `/api/export-report?date=${date}`;
      toast('Descargando reporte Excel...');
    };
  }

  // Print PDF Report
  const printBtn = $('#printReportBtn');
  if (printBtn) {
    printBtn.onclick = () => {
      window.print();
    };
  }
}

// Initializer
$('#date').value = new Date().toISOString().slice(0, 10);
bind();
load().catch(e => toast(e.message));
