let state = {};

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const num = n => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n || 0);

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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

  const pf = $('#paymentForm');
  if (pf) {
    pf.elements.cash.value = day.payments.cash || '';
    ['nequi', 'bancolombia', 'credit', 'vouchers'].forEach(k => {
      if (pf.elements[k]) pf.elements[k].value = day.payments[k] || '';
    });
  }

  const moveInsumo = $('#moveInsumo');
  if (moveInsumo) {
    moveInsumo.innerHTML = db.insumos.filter(i => i.active !== false)
      .map(i => `<option value="${i.id}">${i.name} (${i.unit})</option>`).join('');
  }

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

  const movements = $('#movements');
  if (movements) {
    movements.innerHTML = day.movements.length ? day.movements.slice().reverse().map(m => {
      const i = db.insumos.find(i => i.id === m.insumoId);
      const label = m.type === 'entry' ? 'Entrada' : m.type === 'waste' ? 'Merma' : m.type === 'employee' ? 'Trabajador' : 'Cortesía';
      return `<div class="row">
        <span><b>${label}</b> · ${i?.name || 'Insumo'} <small>${m.note || ''}</small></span>
        <div class="row-actions">
          <b>${num(m.quantity)}</b>
          <button class="btn danger-sm btn-delete-movement" data-id="${m.id}">✕</button>
        </div>
      </div>`;
    }).join('') : '<p class="hint">Sin movimientos registrados hoy.</p>';
  }

  const expenses = $('#expenses');
  if (expenses) {
    expenses.innerHTML = day.expenses.length ? day.expenses.slice().reverse().map(e => `
      <div class="row">
        <span><b>${e.provider}</b> <small>${e.detail || ''}</small></span>
        <div class="row-actions">
          <b>${money(e.amount)}</b>
          <button class="btn danger-sm btn-delete-expense" data-id="${e.id}">✕</button>
        </div>
      </div>
    `).join('') : '<p class="hint">Sin gastos de caja registrados.</p>';
  }

  renderInventoryForm();
  renderMetrics();
  renderImportAlerts();
  renderCategoryBreakdown();

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

  renderAuditTable();
  renderCatalogLists();
  renderCatalogEditor();
  bindDynamicEvents();
  bindProductDragAndDrop();
}

async function moveCategory(category, direction) {
  const categories = (state.report.categoryBreakdown || []).map(c => c.category);
  const idx = categories.indexOf(category);
  const swapIdx = idx + direction;
  if (idx === -1 || swapIdx < 0 || swapIdx >= categories.length) return;
  [categories[idx], categories[swapIdx]] = [categories[swapIdx], categories[idx]];
  await api('/api/settings?date=' + $('#date').value, 'POST', { patch: { categoryOrder: categories } });
  await load();
}

async function moveSubgroup(category, subgroup, direction) {
  const cat = state.report.categoryBreakdown.find(c => c.category === category);
  if (!cat) return;
  const subgroups = cat.subgroups.map(s => s.subgroup);
  const idx = subgroups.indexOf(subgroup);
  const swapIdx = idx + direction;
  if (idx === -1 || swapIdx < 0 || swapIdx >= subgroups.length) return;
  [subgroups[idx], subgroups[swapIdx]] = [subgroups[swapIdx], subgroups[idx]];
  if (!state.db.settings) state.db.settings = {};
  const subgroupOrder = { ...(state.db.settings.subgroupOrder || {}), [category]: subgroups };
  await api('/api/settings?date=' + $('#date').value, 'POST', { patch: { subgroupOrder } });
  await load();
}

async function moveProduct(category, subgroup, productId, direction) {
  const cat = state.report.categoryBreakdown.find(c => c.category === category);
  const sg = cat?.subgroups.find(s => s.subgroup === subgroup);
  if (!sg) return;
  const ids = sg.products.map(p => p.id).filter(Boolean);
  const idx = ids.indexOf(productId);
  const swapIdx = idx + direction;
  if (idx === -1 || swapIdx < 0 || swapIdx >= ids.length) return;
  [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];
  if (!state.db.settings) state.db.settings = {};
  const key = `${category}_${subgroup}`;
  const productOrder = { ...(state.db.settings.productOrder || {}), [key]: ids };
  await api('/api/settings?date=' + $('#date').value, 'POST', { patch: { productOrder } });
  await load();
}

function bindProductDragAndDrop() {
  let draggedId = null;

  document.querySelectorAll('.draggable-row[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', e => {
      draggedId = row.dataset.id;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      document.querySelectorAll('.draggable-row.drag-over').forEach(r => r.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', e => {
      e.preventDefault();
      // Solo permitir soltar dentro del mismo subgrupo
      if (row.dataset.cat !== undefined && draggedId && row.dataset.id !== draggedId) {
        row.classList.add('drag-over');
      }
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', async e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const targetId = row.dataset.id;
      const category = row.dataset.cat;
      const subgroup = row.dataset.sub;
      if (!draggedId || draggedId === targetId) return;

      const cat = state.report.categoryBreakdown.find(c => c.category === category);
      const sg = cat?.subgroups.find(s => s.subgroup === subgroup);
      if (!sg) return;

      const ids = sg.products.map(p => p.id).filter(Boolean);
      const fromIdx = ids.indexOf(draggedId);
      const toIdx = ids.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return;

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, draggedId);

      if (!state.db.settings) state.db.settings = {};
      const key = `${category}_${subgroup}`;
      const productOrder = { ...(state.db.settings.productOrder || {}), [key]: ids };

      try {
        await api('/api/settings?date=' + $('#date').value, 'POST', { patch: { productOrder } });
        await load();
        toast('Orden actualizado');
      } catch (err) {
        toast(err.message);
      }
    });
  });
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
          <h3>
            CATEGORÍA: ${cat.category.toUpperCase()}
            <button type="button" class="btn outline-sm btn-move-category" data-cat="${cat.category}" data-dir="-1" title="Subir categoría" style="padding:2px 6px; font-size:11px; cursor:pointer; margin-left:6px;">▲</button>
            <button type="button" class="btn outline-sm btn-move-category" data-cat="${cat.category}" data-dir="1" title="Bajar categoría" style="padding:2px 6px; font-size:11px; cursor:pointer;">▼</button>
          </h3>
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
                  <th style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
                    <span>${cat.category.toUpperCase()} ${sg.subgroup.toUpperCase()}</span>
                    <span style="display:flex; gap:4px;">
                      <button type="button" class="btn outline-sm btn-move-subgroup" data-cat="${cat.category}" data-sub="${sg.subgroup}" data-dir="-1" title="Subir subgrupo" style="padding: 2px 6px; font-size: 11px; cursor: pointer;">▲</button>
                      <button type="button" class="btn outline-sm btn-move-subgroup" data-cat="${cat.category}" data-sub="${sg.subgroup}" data-dir="1" title="Bajar subgrupo" style="padding: 2px 6px; font-size: 11px; cursor: pointer;">▼</button>
                      <button type="button" class="btn outline-sm btn-manage-subgroup" data-cat="${cat.category}" data-sub="${sg.subgroup}" style="padding: 2px 8px; font-size: 11px; cursor: pointer;">
                        ✏️ Gestionar Subgrupo
                      </button>
                    </span>
                  </th>
                  <th style="text-align:center; width:100px;">CANTIDAD</th>
                  <th style="text-align:right; width:140px;">VALOR ($)</th>
                  <th style="text-align:center; width:80px;">ACCIÓN</th>
                </tr>
              </thead>
              <tbody>
                ${sg.products.map(p => `
                  <tr class="${p.quantity > 0 ? 'sold-row' : 'zero-row'} draggable-row" ${p.id ? `draggable="true" data-id="${p.id}" data-cat="${cat.category}" data-sub="${sg.subgroup}"` : ''}>
                    <td>${p.id ? '<span class="drag-handle" title="Arrastrar para reordenar">⠿</span> ' : ''}<b>${p.name}</b></td>
                    <td style="text-align:center;"><b>${num(p.quantity)}</b></td>
                    <td style="text-align:right;">${p.quantity > 0 ? money(p.total) : '$ -'}</td>
                    <td style="text-align:center; white-space:nowrap;">
                      ${p.id ? `
                        <button type="button" class="btn outline-sm btn-move-product" data-cat="${cat.category}" data-sub="${sg.subgroup}" data-id="${p.id}" data-dir="-1" title="Subir" style="padding: 2px 5px; font-size: 11px; cursor: pointer;">▲</button>
                        <button type="button" class="btn outline-sm btn-move-product" data-cat="${cat.category}" data-sub="${sg.subgroup}" data-id="${p.id}" data-dir="1" title="Bajar" style="padding: 2px 5px; font-size: 11px; cursor: pointer;">▼</button>
                        <button type="button" class="btn outline-sm btn-edit-product-card" data-id="${p.id}" style="padding: 2px 6px; font-size: 11px; cursor: pointer;">✏ Editar</button>
                      ` : ''}
                    </td>
                  </tr>
                `).join('')}
                <tr class="excel-total-row">
                  <td><b>TOTAL SUBGRUPO ${sg.subgroup.toUpperCase()}</b></td>
                  <td style="text-align:center;"><b>${num(sg.totalUnits)}</b></td>
                  <td style="text-align:right;"><b>${money(sg.totalSalesValue)}</b></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="excel-audit-container">
            <table class="excel-like-table">
              <thead>
                <tr class="audit-subgroup-header">
                  <th style="display: flex; justify-content: space-between; align-items: center; padding-right: 12px;">
                    <span>AUDITORÍA DE INSUMOS DE ESTE TAMAÑO (${sg.subgroup.toUpperCase()})</span>
                    <button type="button" class="btn outline-sm btn-open-audit-filter" data-cat="${cat.category}" data-sub="${sg.subgroup}" style="padding: 2px 8px; font-size: 11px; cursor: pointer;">
                      ⚙ Editar Visibles
                    </button>
                  </th>
                  <th style="text-align:center; width:110px;">CANT. INVENTARIO</th>
                  <th style="text-align:center; width:110px;">CANT. TIRILLA</th>
                  <th style="text-align:right; width:160px;">CUADRE / DIFERENCIA</th>
                </tr>
              </thead>
              <tbody>
                ${(sg.insumosAudit || []).length ? (sg.insumosAudit || []).map(ia => {
                  if (!ia || !ia.insumo) return '';
                  const insName = String(ia.insumo.name || 'INSUMO').toUpperCase();
                  const diff = Number(ia.difference || 0);
                  const statusClass = diff === 0 ? 'status-ok' : diff > 0 ? 'status-diff-neg' : 'status-diff-pos';
                  const statusText = diff === 0 ? '0 (OK)' : diff > 0 ? `+${num(diff)} (Faltante físico)` : `${num(diff)} (Sobrante)`;
                  return `
                    <tr class="excel-cuadre-row">
                      <td><b>${insName}</b></td>
                      <td style="text-align:center;"><b>${num(ia.calculatedOut)}</b></td>
                      <td style="text-align:center;"><b>${num(ia.theoretical)}</b></td>
                      <td style="text-align:right;">
                        <span class="${statusClass}">${statusText}</span>
                      </td>
                    </tr>
                  `;
                }).join('') : `
                  <tr>
                    <td colspan="4" style="text-align:center; color: var(--muted); padding: 12px; font-size: 12px;">
                      No hay insumos visibles configurados para este subgrupo. Haz clic en "⚙ Editar Visibles" para activarlos.
                    </td>
                  </tr>
                `}
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

function bindDynamicEvents() {
  document.querySelectorAll('.btn-edit-product-card').forEach(b => {
    b.onclick = () => {
      state.editing = { kind: 'product', id: b.dataset.id };
      renderCatalogEditor();
    };
  });

  document.querySelectorAll('.btn-manage-subgroup').forEach(b => {
    b.onclick = () => openSubgroupManagerModal(b.dataset.cat, b.dataset.sub);
  });

  document.querySelectorAll('.btn-open-audit-filter').forEach(b => {
    b.onclick = () => openAuditFilterModal(b.dataset.cat, b.dataset.sub);
  });

  document.querySelectorAll('.btn-delete-movement').forEach(b => {
    b.onclick = () => deleteMovement(b.dataset.id);
  });

  document.querySelectorAll('.btn-delete-expense').forEach(b => {
    b.onclick = () => deleteExpense(b.dataset.id);
  });

  // NUEVO: reordenar
  document.querySelectorAll('.btn-move-category').forEach(b => {
    b.onclick = () => moveCategory(b.dataset.cat, Number(b.dataset.dir));
  });

  document.querySelectorAll('.btn-move-subgroup').forEach(b => {
    b.onclick = () => moveSubgroup(b.dataset.cat, b.dataset.sub, Number(b.dataset.dir));
  });

  document.querySelectorAll('.btn-move-product').forEach(b => {
    b.onclick = () => moveProduct(b.dataset.cat, b.dataset.sub, b.dataset.id, Number(b.dataset.dir));
  });
}

function openSubgroupManagerModal(category, subgroup) {
  let activeProductIds = state.db.products
    .filter(p => (p.category || '') === category && (p.subgroup || '') === subgroup)
    .map(p => p.id);

  const container = $('#catalogEditor');
  if (!container) return;

  // Forzar visibilidad y estilo modal sobre el contenedor
  container.style.display = 'flex';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  container.style.zIndex = '9999';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';

  const closeModal = () => {
    container.innerHTML = '';
    container.style.display = 'none';
  };

  const renderModalContent = () => {
    const activeProducts = state.db.products.filter(p => activeProductIds.includes(p.id));

    const rows = activeProducts.map(p => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #eee;">
        <span style="font-weight:600;">${p.name} <small style="color:#777;">(${money(p.price)})</small></span>
        <button type="button" class="btn danger-sm btn-remove-from-subgroup" data-id="${p.id}" style="font-size:11px; padding:2px 8px; cursor:pointer;">Quitar</button>
      </div>
    `).join('') || '<p style="color:#888; text-align:center; padding:10px;">Sin productos en este subgrupo.</p>';

    container.innerHTML = `
      <article class="card editor" style="background:#fff; padding:20px; border-radius:8px; max-width:500px; width:90%; max-height:85vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
        <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
          <h2 style="margin:0; font-size:1.2em;">Gestionar: ${category.toUpperCase()} (${subgroup.toUpperCase()})</h2>
          <button type="button" id="closeSubgroupModal" class="btn outline" style="cursor:pointer;">✕</button>
        </div>

        <div style="margin-bottom:15px;">
          <h4 style="margin-bottom:6px;">Agregar un producto a este subgrupo:</h4>
          <div style="display:flex; gap:8px;">
            <input type="text" id="addSearchInput" list="allProductsOptions" placeholder="🔍 Buscar producto en la carta..." style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px;" />
            <datalist id="allProductsOptions">
              ${state.db.products.filter(p => !activeProductIds.includes(p.id)).map(p => `<option value="${p.name}"></option>`).join('')}
            </datalist>
            <button type="button" id="btnAddProductToSubgroup" class="btn primary" style="padding:6px 12px; cursor:pointer;">+ Agregar</button>
          </div>
        </div>

        <h4 style="margin-bottom:6px;">Productos actuales en este subgrupo:</h4>
        <div style="max-height:220px; overflow-y:auto; margin-bottom:15px; border:1px solid #e2e8f0; border-radius:6px; padding:8px;">
          ${rows}
        </div>

        <button type="button" id="saveSubgroupBatch" class="btn primary" style="width:100%; cursor:pointer;">Guardar Cambios de Subgrupo</button>
      </article>
    `;

    $('#closeSubgroupModal').onclick = closeModal;

    container.querySelectorAll('.btn-remove-from-subgroup').forEach(btn => {
      btn.onclick = () => {
        activeProductIds = activeProductIds.filter(id => id !== btn.dataset.id);
        renderModalContent();
      };
    });

    $('#btnAddProductToSubgroup').onclick = () => {
      const val = ($('#addSearchInput').value || '').trim().toLowerCase();
      const match = state.db.products.find(p => p.name.toLowerCase() === val);
      if (!match) return toast('Selecciona un producto válido del buscador');
      if (!activeProductIds.includes(match.id)) {
        activeProductIds.push(match.id);
        renderModalContent();
      }
    };

    $('#saveSubgroupBatch').onclick = async () => {
      const x = await api('/api/catalog/batch-subgroup', 'POST', {
        category,
        subgroup,
        productIds: activeProductIds
      });
      state.db.insumos = x.insumos;
      state.db.products = x.products;
      closeModal();
      await load();
      toast('Subgrupo actualizado correctamente');
    };
  };

  renderModalContent();
}

function openAuditFilterModal(category, subgroup) {
  const key = `${category}_${subgroup}`;
  const currentAudited = state.db.settings?.auditedInsumos?.[key];
  const categoryProducts = state.db.products.filter(p => (p.category || '') === category && (p.subgroup || '') === subgroup);
  const insumoIds = new Set();
  categoryProducts.forEach(p => (p.recipe || []).forEach(r => insumoIds.add(r.insumoId)));
  const subgroupInsumos = Array.from(insumoIds).map(id => state.db.insumos.find(i => i.id === id)).filter(Boolean);
  if (!subgroupInsumos.length) {
    return toast('No hay insumos asociados a los productos de este subgrupo.');
  }
  const container = $('#catalogEditor');
  if (!container) return;
  // Forzar visibilidad y estilo modal sobre el contenedor
  container.style.display = 'flex';
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  container.style.zIndex = '9999';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  const closeModal = () => {
    container.innerHTML = '';
    container.style.display = 'none';
  };
  const rows = subgroupInsumos.map(i => {
    const isChecked = !currentAudited || currentAudited.includes(i.id);
    return `
      <label style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid #eee; cursor:pointer;">
        <input type="checkbox" class="audit-insumo-chk" data-id="${i.id}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px;" />
        <span style="font-weight:600; font-size: 0.9em;">${i.name}</span>
        <small style="color:#666;">(${i.unit})</small>
      </label>
    `;
  }).join('');
  container.innerHTML = `
    <article class="card editor" style="background:#fff; padding:20px; border-radius:8px; max-width:450px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
      <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h2 style="margin:0; font-size:1.1em;">Filtrar Auditoría: ${category.toUpperCase()} (${subgroup.toUpperCase()})</h2>
        <button type="button" id="closeFilterModal" class="btn outline" style="cursor:pointer;">✕</button>
      </div>
      <p style="font-size:0.85em; color:#555; margin-bottom:12px;">
        Desmarca los insumos que no deseas monitorear en la auditoría de este subgrupo:
      </p>
      <div style="max-height:250px; overflow-y:auto; margin-bottom:15px; padding-right:5px;">
        ${rows}
      </div>
      <button type="button" id="saveAuditFilter" class="btn primary" style="width:100%; cursor:pointer;">Guardar Preferencia</button>
    </article>
  `;
  $('#closeFilterModal').onclick = closeModal;
  $('#saveAuditFilter').onclick = async () => {
    const selected = Array.from(document.querySelectorAll('.audit-insumo-chk'))
      .filter(chk => chk.checked)
      .map(chk => chk.dataset.id);
    if (!state.db.settings) state.db.settings = {};
    if (!state.db.settings.auditedInsumos) state.db.settings.auditedInsumos = {};
    state.db.settings.auditedInsumos[key] = selected;

    await api('/api/settings?date=' + $('#date').value, 'POST', {
      patch: { auditedInsumos: state.db.settings.auditedInsumos }
    });

    closeModal();
    await load();
    toast('Filtro de auditoría actualizado');
  };
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

function renderImportAlerts() {
  let box = $('#importAlerts');
  if (!box) {
    const cuadre = $('#cuadre');
    if (!cuadre) return;
    box = document.createElement('div');
    box.id = 'importAlerts';
    box.className = 'import-alerts';
    cuadre.insertBefore(box, cuadre.firstChild);
  }

  const meta = state.importMeta || { created: [], priceMismatches: [] };
    let html = '';
  const unregistered = (state.db?.products || []).filter(p => {
    const soldToday = state.day?.sales?.some(s => s.productId === p.id);
    if (!soldToday) return false;
    if (p.directSale) return false; // ← ya lo señalaste: solo tirilla
    if (Array.isArray(p.recipe) && p.recipe.length > 0) return false;
    return true;
  });

  const listUnreg = unregistered;
  if (listUnreg.length) {
    html += `
      <article class="card" style="border-left:4px solid #c0392b;">
        <div class="card-header">
          <div>
            <h2>Productos no registrados</h2>
            <p class="hint">Aparecieron en la tirilla y no tienen receta completa en el catálogo. Regístralos para que el cuadre de insumos sea correcto.</p>
          </div>
        </div>
        <div class="list">
          ${listUnreg.map(p => {
            const sale = state.day.sales.find(s => s.productId === p.id);
            return `
              <div class="row">
                <span>
                  <b>${esc(p.name)}</b>
                  <small>${sale ? num(sale.quantity) + ' und. · ' + money(sale.quantity * (sale.price || p.price || 0)) : ''}</small>
                </span>
                <div class="row-actions">
                  <button class="btn primary" data-register-product="${p.id}">Registrar producto</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      </article>`;
  }

  if ((meta.priceMismatches || []).length) {
    html += `
      <article class="card" style="border-left:4px solid #d68910;">
        <div class="card-header">
          <div>
            <h2>Precios distintos a la tirilla</h2>
            <p class="hint">El valor unitario de la tirilla no coincide con el precio del catálogo. Puedes actualizar el catálogo o dejarlo como está (la venta del día ya usa el de la tirilla).</p>
          </div>
        </div>
        <div class="list">
          ${(meta.priceMismatches || []).map(m => `
            <div class="row">
              <span>
                <b>${esc(m.name)}</b>
                <small>Catálogo: ${money(m.catalogPrice)} · Tirilla: ${money(m.tirillaPrice)}</small>
              </span>
              <div class="row-actions">
                <button class="btn secondary" data-apply-tirilla-price="${m.id}" data-price="${m.tirillaPrice}">Usar precio tirilla</button>
                <button class="btn outline" data-dismiss-price="${m.id}">Mantener catálogo</button>
              </div>
            </div>`).join('')}
        </div>
      </article>`;
  }

  box.innerHTML = html || '';

  box.querySelectorAll('[data-register-product]').forEach(btn => {
    btn.onclick = () => {
      state.editing = { kind: 'product', id: btn.dataset.registerProduct };
      document.querySelectorAll('.nav-btn, .tab').forEach(el => el.classList.remove('active'));
      document.querySelector('.nav-btn[data-tab="catalogo"]')?.classList.add('active');
      $('#catalogo')?.classList.add('active');
      renderCatalogEditor();
      toast('Completa categoría, precio y receta, luego guarda');
    };
  });

  box.querySelectorAll('[data-apply-tirilla-price]').forEach(btn => {
    btn.onclick = async () => {
      try {
        const x = await api('/api/catalog/price', 'POST', {
          productId: btn.dataset.applyTirillaPrice,
          price: Number(btn.dataset.price)
        });
        state.db.products = x.products;
        if (state.importMeta) {
          state.importMeta.priceMismatches = state.importMeta.priceMismatches.filter(
            m => m.id !== btn.dataset.applyTirillaPrice
          );
        }
        render();
        toast('Precio del catálogo actualizado con el de la tirilla');
      } catch (e) {
        toast(e.message);
      }
    };
  });

  box.querySelectorAll('[data-dismiss-price]').forEach(btn => {
    btn.onclick = () => {
      if (state.importMeta) {
        state.importMeta.priceMismatches = state.importMeta.priceMismatches.filter(
          m => m.id !== btn.dataset.dismissPrice
        );
      }
      render();
    };
  });
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
          <button class="edit-btn btn-edit-insumo-item" data-id="${i.id}">Editar</button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.btn-edit-insumo-item').forEach(b => {
      b.onclick = () => { state.editing = { kind: 'insumo', id: b.dataset.id }; renderCatalogEditor(); };
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
          <button class="edit-btn btn-edit-product-item" data-id="${p.id}">Editar Receta</button>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.btn-edit-product-item').forEach(b => {
      b.onclick = () => { state.editing = { kind: 'product', id: b.dataset.id }; renderCatalogEditor(); };
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
      <button type="button" class="removeIngredient">✕</button>
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

  const clearModalStyles = () => {
    box.innerHTML = '';
    box.style.display = 'none';
    box.style.position = '';
    box.style.top = '';
    box.style.left = '';
    box.style.width = '';
    box.style.height = '';
    box.style.backgroundColor = '';
    box.style.zIndex = '';
    box.style.justifyContent = '';
    box.style.alignItems = '';
    box.style.overflowY = '';
    box.style.padding = '';
  };

  if (!state.editing) { clearModalStyles(); return; }

  const entity = (state.editing.kind === 'insumo' ? state.db.insumos : state.db.products).find(x => x.id === state.editing.id);
  if (!entity) { state.editing = null; clearModalStyles(); return; }

  // Forzar visibilidad como modal flotante sobre CUALQUIER pestaña activa
  // (igual que openSubgroupManagerModal y openAuditFilterModal), ya que este
  // contenedor puede estar oculto por CSS si el usuario no está en la pestaña Catálogo.
  box.style.display = 'flex';
  box.style.position = 'fixed';
  box.style.top = '0';
  box.style.left = '0';
  box.style.width = '100vw';
  box.style.height = '100vh';
  box.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  box.style.zIndex = '9999';
  box.style.justifyContent = 'center';
  box.style.alignItems = 'center';
  box.style.overflowY = 'auto';
  box.style.padding = '20px';

  if (state.editing.kind === 'insumo') {
    window._assignedProducts = state.db.products.map(p => {
      const existing = (p.recipe || []).find(r => r.insumoId === entity.id);
      return {
        id: p.id,
        name: p.name,
        category: p.category || 'General',
        checked: Boolean(existing && existing.quantity > 0),
        quantity: existing ? existing.quantity : 1
      };
    });

    box.innerHTML = `<article class="card editor" style="background:#fff; max-width:600px; width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.25); border-radius:8px;">
      <div class="card-header">
        <h2>Editar Insumo: ${entity.name}</h2>
        <div>
          <button type="button" id="deleteEdit" class="btn danger-sm">Eliminar Insumo</button>
          <button type="button" id="cancelEdit" class="btn outline">Cerrar Editor</button>
        </div>
      </div>
      <form id="editInsumoForm" class="form inline-insumo">
        <label>
          <span>Nombre del Insumo</span>
          <input name="name" list="editInsumoOptions" value="${entity.name}" required>
          <datalist id="editInsumoOptions">${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.name}"></option>`).join('')}</datalist>
        </label>
        <label>
          <span>Unidad</span>
          <input name="unit" value="${entity.unit}" required>
        </label>
        <label>
          <span>Costo COP</span>
          <input name="price" type="number" min="0" value="${entity.price}" required>
        </label>

        <div style="grid-column: 1 / -1; margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px;">
          <h4 style="margin-bottom: 5px;">Asignar este insumo a Productos / Recetas</h4>
          <p style="font-size: 0.8em; color: #666; margin-bottom: 8px;">Busca un producto y chuléalo para asignarlo (por defecto 1 und, editable):</p>
          
          <input type="text" id="productSearchInput" placeholder="🔍 Buscar producto por nombre..." style="width: 100%; padding: 8px; margin-bottom: 10px; border: 1px solid #ccc; border-radius: 4px;" />
          <div id="productAssignList" style="max-height: 220px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px;"></div>
        </div>

        <button type="submit" class="btn primary" style="grid-column: 1 / -1; margin-top: 12px;">Guardar Insumo y Recetas</button>
      </form>
    </article>`;

    const renderAssignList = () => {
      const filter = ($('#productSearchInput')?.value || '').toLowerCase().trim();
      const filtered = window._assignedProducts.filter(p => p.name.toLowerCase().includes(filter));
      const listContainer = $('#productAssignList');

      if (!filtered.length) {
        listContainer.innerHTML = '<p style="color:#888; font-size:0.85em; text-align:center; padding:10px;">No hay productos coincidentes.</p>';
        return;
      }

      listContainer.innerHTML = filtered.map(p => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid #f1f5f9; background: ${p.checked ? '#f0fdf4' : 'transparent'};">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; max-width: 70%;">
            <input type="checkbox" class="chk-assign" data-id="${p.id}" ${p.checked ? 'checked' : ''} style="width: 18px; height: 18px;" />
            <span style="font-size: 0.9em; font-weight: ${p.checked ? '600' : '400'};">${p.name} <small style="color:#777;">(${p.category})</small></span>
          </label>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="font-size: 0.75em; color: #666;">Cant:</span>
            <input type="number" step="0.01" min="0.01" class="qty-assign" data-id="${p.id}" value="${p.quantity}" ${!p.checked ? 'disabled' : ''} style="width: 65px; text-align: right; padding: 3px; border: 1px solid #cbd5e1; border-radius: 4px;" />
          </div>
        </div>
      `).join('');

      listContainer.querySelectorAll('.chk-assign').forEach(chk => {
        chk.onchange = (e) => {
          const prod = window._assignedProducts.find(x => x.id === e.target.dataset.id);
          if (prod) {
            prod.checked = e.target.checked;
            renderAssignList();
          }
        };
      });

      listContainer.querySelectorAll('.qty-assign').forEach(input => {
        input.oninput = (e) => {
          const prod = window._assignedProducts.find(x => x.id === e.target.dataset.id);
          if (prod) prod.quantity = parseFloat(e.target.value) || 1;
        };
      });
    };

    renderAssignList();
    $('#productSearchInput').oninput = renderAssignList;
    $('#editInsumoForm').onsubmit = saveEditedInsumo;
  } else {
    const defaultCategories = ['Hamburguesas', 'Perros', 'Sándwiches', 'Bebidas', 'Adiciones y Entradas', 'Combos'];
    const existingCategories = state.db.products.map(p => p.category).filter(Boolean);
    const allCategories = [...new Set([...defaultCategories, ...existingCategories])];

    const defaultSubgroups = ['Grandes / Súper', 'Medianas / Normales', 'Pequeñas / Junior', 'Especiales / Otros'];
    const existingSubgroups = state.db.products.map(p => p.subgroup).filter(Boolean);
    const allSubgroups = [...new Set([...defaultSubgroups, ...existingSubgroups])];

    box.innerHTML = `<article class="card editor" style="background:#fff; max-width:600px; width:95%; max-height:90vh; overflow-y:auto; box-shadow:0 10px 25px rgba(0,0,0,0.25); border-radius:8px;">
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
          <input name="category" list="editCategoryOptions" value="${entity.category || 'Hamburguesas'}" required autocomplete="off">
          <datalist id="editCategoryOptions">
            ${allCategories.map(c => `<option value="${c}"></option>`).join('')}
          </datalist>
        </label>
        <label>
          <span>Subgrupo / Tamaño</span>
          <input name="subgroup" list="editSubgroupOptions" value="${entity.subgroup || 'Medianas / Normales'}" required autocomplete="off">
          <datalist id="editSubgroupOptions">
            ${allSubgroups.map(s => `<option value="${s}"></option>`).join('')}
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

  box.onclick = (e) => {
    if (e.target === box) {
      state.editing = null;
      clearModalStyles();
    }
  };

  $('#cancelEdit').onclick = () => { state.editing = null; clearModalStyles(); };
  $('#deleteEdit').onclick = deleteEdited;
}

function recipeLinesHtml(recipe) {
  return recipe.map(r => `
    <span class="recipe-line">
      <select>${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.id}" ${i.id === r.insumoId ? 'selected' : ''}>${i.name}</option>`).join('')}</select>
      <input type="number" min="0.01" step="0.01" value="${r.quantity}">
      <button type="button" class="removeIngredient">✕</button>
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

  const productAssignments = window._assignedProducts
    .filter(p => p.checked)
    .map(p => ({
      productId: p.id,
      quantity: p.quantity > 0 ? p.quantity : 1
    }));

  const payload = {
    name: f.get('name'),
    unit: f.get('unit'),
    price: Number(f.get('price')),
    productAssignments
  };

  const x = await api(`/api/catalog/insumo/${state.editing.id}`, 'PUT', payload);
  state.db.insumos = x.insumos;
  state.db.products = x.products;
  state.editing = null;
  render();
  toast('Insumo y recetas actualizadas');
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
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.nav-btn, .tab').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      $('#' + b.dataset.tab).classList.add('active');
    };
  });

  $('#date').onchange = load;

  const invSearch = $('#inventorySearch');
  if (invSearch) invSearch.oninput = renderInventoryForm;

  const audSearch = $('#auditSearch');
  if (audSearch) audSearch.oninput = renderAuditTable;

  $('#importBtn').onclick = async () => {
    const f = $('#xlsx').files[0];
    if (!f) return toast('Selecciona un archivo Excel de tirilla');
    try {
      const x = await api('/api/import-sales?date=' + $('#date').value, 'POST', await f.arrayBuffer());
      state.day = x.day;
      state.report = x.report;
      state.db.products = x.products;
      state.importMeta = {
        created: x.created || [],
        priceMismatches: x.priceMismatches || []
      };
      render();
      $('#importResult').innerHTML = `
        <span class="badge badge-ok">${x.imported} filas leídas · ${x.matched} productos cargados</span>
        ${x.created.length ? `<span class="badge badge-danger">${x.created.length} sin registrar en catálogo</span>` : ''}
        ${x.priceMismatches.length ? `<span class="badge badge-danger">${x.priceMismatches.length} con precio distinto a la tirilla</span>` : ''}
      `;
      if (x.created.length || x.priceMismatches.length) {
        // Llevar al usuario a la pestaña de cuadre para resolver
        document.querySelectorAll('.nav-btn, .tab').forEach(el => el.classList.remove('active'));
        document.querySelector('.nav-btn[data-tab="cuadre"]')?.classList.add('active');
        $('#cuadre')?.classList.add('active');
      }
      toast('Tirilla importada correctamente');
    } catch (e) {
      toast(e.message);
    }
  };

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

  $('#movementForm').onsubmit = async e => {
    e.preventDefault();
    const x = await api('/api/movement', 'POST', { date: $('#date').value, ...Object.fromEntries(new FormData(e.target)) });
    state.day = x.day;
    state.report = x.report;
    render();
    e.target.reset();
    toast('Movimiento registrado');
  };

  $('#expenseForm').onsubmit = async e => {
    e.preventDefault();
    const x = await api('/api/expense', 'POST', { date: $('#date').value, ...Object.fromEntries(new FormData(e.target)) });
    state.day = x.day;
    state.report = x.report;
    render();
    e.target.reset();
    toast('Gasto registrado');
  };

  $('#saveInventory').onclick = async () => {
    const physical = {};
    document.querySelectorAll('[data-insumo]').forEach(i => physical[i.dataset.insumo] = Number(i.value || 0));
    const x = await api('/api/day', 'POST', { date: $('#date').value, patch: { physical } });
    state.day = x.day;
    state.report = x.report;
    render();
    toast('Conteo físico guardado correctamente');
  };

  $('#insumoForm').onsubmit = async e => {
    e.preventDefault();
    const x = await api('/api/catalog', 'POST', { kind: 'insumo', ...Object.fromEntries(new FormData(e.target)) });
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    render();
    e.target.reset();
    toast('Nuevo insumo añadido');
  };

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

  $('#addIngredient').onclick = () => {
    const box = $('#recipeLines');
    const line = document.createElement('span');
    line.className = 'recipe-line';
    line.innerHTML = `
      <select>${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.id}">${i.name}</option>`).join('')}</select>
      <input type="number" min="0.01" step="0.01" value="1">
      <button type="button" class="removeIngredient">✕</button>
    `;
    line.querySelector('button').onclick = () => line.remove();
    box.append(line);
  };

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

  const exportBtn = $('#exportReportBtn');
  if (exportBtn) {
    exportBtn.onclick = () => {
      const date = $('#date').value;
      window.location.href = `/api/export-report?date=${date}`;
      toast('Descargando reporte Excel...');
    };
  }

  const printBtn = $('#printReportBtn');
  if (printBtn) {
    printBtn.onclick = () => {
      window.print();
    };
  }
}

// Initializer
$('#date').value = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
// Salvaguarda: si #catalogEditor quedó anidado dentro de una sección .tab
// (oculta por CSS cuando no está activa), lo movemos a body para que el
// modal siempre pueda mostrarse sin importar la pestaña activa.
(function ensureCatalogEditorIsTopLevel() {
  const el = document.getElementById('catalogEditor');
  if (el && el.parentElement !== document.body) {
    document.body.appendChild(el);
  }
})();

bind();
load().catch(e => toast(e.message));