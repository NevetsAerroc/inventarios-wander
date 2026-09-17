let state = {};
let editViewMode = {
  inventory: false,
  category: false,
  audit: false
};

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const num = n => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(n || 0);

function getViewSettings() {
  if (!state.db) return {};
  if (!state.db.settings) state.db.settings = {};
  if (!state.db.settings.viewSettings) {
    state.db.settings.viewSettings = {
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
  }
  return state.db.settings.viewSettings;
}

async function saveViewSettings(newPartial) {
  const current = getViewSettings();
  const merged = Object.assign(current, newPartial);
  try {
    const date = $('#date').value;
    const res = await api(`/api/view-settings?date=${date}`, 'PUT', { viewSettings: merged });
    state.db.settings = res.settings;
    state.report = res.report;
    render();
    toast('Preferencia de orden y vista guardada');
  } catch (err) {
    toast('Error guardando configuración de vista: ' + err.message);
  }
}

// Drag and drop helper for list reordering
function setupDragAndDrop(container, itemSelector, onReorder) {
  let draggedEl = null;

  container.querySelectorAll(itemSelector).forEach(el => {
    el.setAttribute('draggable', 'true');

    el.addEventListener('dragstart', e => {
      if (itemSelector === '.subgroup-card-block' || itemSelector === '.category-list-card') {
        if (!e.target.closest('.drag-handle, .subgroup-card-header-bar, .category-list-header, h3')) {
          e.preventDefault();
          return;
        }
      }
      if (e.target.closest('button, input, select, a, .ctrl-btn')) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      draggedEl = el;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.dragId || '');
      setTimeout(() => el.classList.add('is-dragging'), 0);
    });

    el.addEventListener('dragend', e => {
      e.stopPropagation();
      document.querySelectorAll('.is-dragging, .drag-over-top, .drag-over-bottom, .drag-over-card').forEach(item => {
        item.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom', 'drag-over-card');
      });
      draggedEl = null;
    });
  });

  container.addEventListener('dragover', e => {
    if (!draggedEl || !container.contains(draggedEl)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    const targetItem = e.target.closest(itemSelector);
    container.querySelectorAll(itemSelector).forEach(item => {
      item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-card');
    });

    if (targetItem && targetItem !== draggedEl && container.contains(targetItem)) {
      const rect = targetItem.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        targetItem.classList.add('drag-over-top');
      } else {
        targetItem.classList.add('drag-over-bottom');
      }
    }
  });

  container.addEventListener('dragleave', e => {
    e.stopPropagation();
    if (!container.contains(e.relatedTarget)) {
      container.querySelectorAll(itemSelector).forEach(item => {
        item.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-card');
      });
    }
  });

  container.addEventListener('drop', e => {
    if (!draggedEl || !container.contains(draggedEl)) return;
    e.preventDefault();
    e.stopPropagation();

    const targetItem = e.target.closest(itemSelector);
    document.querySelectorAll('.is-dragging, .drag-over-top, .drag-over-bottom, .drag-over-card').forEach(item => {
      item.classList.remove('is-dragging', 'drag-over-top', 'drag-over-bottom', 'drag-over-card');
    });

    if (targetItem && targetItem !== draggedEl && container.contains(targetItem)) {
      const rect = targetItem.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const isTop = e.clientY < mid;

      if (isTop) {
        container.insertBefore(draggedEl, targetItem);
      } else {
        container.insertBefore(draggedEl, targetItem.nextSibling);
      }
    }

    const updatedOrder = Array.from(container.querySelectorAll(itemSelector))
      .map(item => item.dataset.dragId)
      .filter(Boolean);

    draggedEl = null;

    if (typeof onReorder === 'function') {
      onReorder(updatedOrder);
    }
  });
}


function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toast(t) {
  const e = $('#toast');
  if (!e) return;
  e.textContent = t;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), 2800);
}

function showQuotaWarning() {
  if (document.getElementById('quota-warning-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'quota-warning-banner';
  banner.innerHTML = `⚠️ <b>Límite diario de la nube superado</b>. Los datos se guardan temporalmente en este dispositivo pero se <b>PERDERÁN</b> si publicas o reinicias la app hoy. El límite se reinicia a la medianoche.`;
  banner.style = 'position:fixed; bottom:0; left:0; right:0; background:#ef4444; color:white; padding:12px; text-align:center; z-index:99999; font-size:13px; font-weight:500; box-shadow:0 -4px 6px -1px rgba(0,0,0,0.1);';
  document.body.appendChild(banner);
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
  if (x.quotaWarning) showQuotaWarning();
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
    salesList.innerHTML = day.sales.length ? `
      <div class="sales-table-box">
        <div class="sales-table-header">
          <span class="sales-col-prod">PRODUCTO VENDIDO</span>
          <span class="sales-col-qty">CANTIDAD</span>
          <span class="sales-col-price">TOTAL VENTA</span>
        </div>
        <div class="sales-table-body">
          ${day.sales.map(s => {
            const p = db.products.find(p => p.id === s.productId);
            const total = s.quantity * (s.price ?? p?.price ?? 0);
            return `<div class="sales-row">
              <span class="sales-col-prod"><b>${s.productName || p?.name || 'Producto'}</b></span>
              <span class="sales-col-qty"><span class="badge badge-info">${num(s.quantity)} und.</span></span>
              <span class="sales-col-price"><b>${money(total)}</b></span>
            </div>`;
          }).join('')}
        </div>
      </div>
    ` : '<p class="hint">Aún no hay ventas registradas en la tirilla.</p>';
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

// Collapsible states for Categories and Subgroups
const collapsedCategories = new Set();
const collapsedSubgroups = new Set();

function toggleCategoryCollapse(catName) {
  if (collapsedCategories.has(catName)) {
    collapsedCategories.delete(catName);
  } else {
    collapsedCategories.add(catName);
  }
  const card = document.querySelector(`.category-list-card[data-drag-cat="${CSS.escape(catName)}"]`);
  if (card) {
    const isNow = collapsedCategories.has(catName);
    card.classList.toggle('is-collapsed', isNow);
    const chevron = card.querySelector('.category-chevron');
    if (chevron) chevron.classList.toggle('collapsed', isNow);
    const btn = card.querySelector('[data-toggle-cat-btn]');
    if (btn) {
      btn.title = isNow ? 'Desplegar categoría' : 'Plegar categoría';
      btn.setAttribute('aria-expanded', !isNow);
    }
  }
  updateGlobalCollapseButtonLabel();
}

function toggleSubgroupCollapse(subKey) {
  if (collapsedSubgroups.has(subKey)) {
    collapsedSubgroups.delete(subKey);
  } else {
    collapsedSubgroups.add(subKey);
  }
  const subBlock = document.querySelector(`.subgroup-card-block[data-subkey="${CSS.escape(subKey)}"]`);
  if (subBlock) {
    const isNow = collapsedSubgroups.has(subKey);
    subBlock.classList.toggle('is-collapsed', isNow);
    const chevron = subBlock.querySelector('.subgroup-chevron');
    if (chevron) chevron.classList.toggle('collapsed', isNow);
    const btn = subBlock.querySelector('[data-toggle-sub-btn]');
    if (btn) {
      btn.title = isNow ? 'Desplegar subgrupo' : 'Plegar subgrupo';
      btn.setAttribute('aria-expanded', !isNow);
    }
  }
  updateGlobalCollapseButtonLabel();
}

function toggleAllCategoriesAndSubgroups() {
  const breakdown = state.report?.categoryBreakdown || [];
  if (!breakdown.length) return;
  const allCollapsed = breakdown.every(c => collapsedCategories.has(c.category));

  if (allCollapsed) {
    // Expand all
    collapsedCategories.clear();
    collapsedSubgroups.clear();
  } else {
    // Collapse all
    breakdown.forEach(c => {
      collapsedCategories.add(c.category);
      (c.subgroups || []).forEach(sg => {
        collapsedSubgroups.add(`${c.category}::${sg.subgroup}`);
      });
    });
  }

  // Update DOM classes for instant visual response
  document.querySelectorAll('.category-list-card').forEach(card => {
    const cat = card.dataset.dragCat;
    const isCol = collapsedCategories.has(cat);
    card.classList.toggle('is-collapsed', isCol);
    const chevron = card.querySelector('.category-chevron');
    if (chevron) chevron.classList.toggle('collapsed', isCol);
    const btn = card.querySelector('[data-toggle-cat-btn]');
    if (btn) {
      btn.title = isCol ? 'Desplegar categoría' : 'Plegar categoría';
      btn.setAttribute('aria-expanded', !isCol);
    }
  });

  document.querySelectorAll('.subgroup-card-block').forEach(subBlock => {
    const subKey = subBlock.dataset.subkey;
    const isCol = collapsedSubgroups.has(subKey);
    subBlock.classList.toggle('is-collapsed', isCol);
    const chevron = subBlock.querySelector('.subgroup-chevron');
    if (chevron) chevron.classList.toggle('collapsed', isCol);
    const btn = subBlock.querySelector('[data-toggle-sub-btn]');
    if (btn) {
      btn.title = isCol ? 'Desplegar subgrupo' : 'Plegar subgrupo';
      btn.setAttribute('aria-expanded', !isCol);
    }
  });

  updateGlobalCollapseButtonLabel();
}

function updateGlobalCollapseButtonLabel() {
  const textEl = $('#toggleCollapseAllCatsText');
  const iconEl = $('#toggleCollapseAllCatsIcon');
  if (!textEl) return;
  const breakdown = state.report?.categoryBreakdown || [];
  const allCollapsed = breakdown.length > 0 && breakdown.every(c => collapsedCategories.has(c.category));
  if (allCollapsed) {
    textEl.textContent = 'Desplegar Todo';
    if (iconEl) iconEl.innerHTML = '<polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline>';
  } else {
    textEl.textContent = 'Plegar Todo';
    if (iconEl) iconEl.innerHTML = '<polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline>';
  }
}

function renderCategoryBreakdown() {
  const box = $('#categoryBreakdown');
  const banner = $('#categoryEditBanner');
  const btn = $('#toggleEditCategoryBtn');
  if (!box) return;

  const isEdit = editViewMode.category;
  if (btn) {
    btn.classList.toggle('active', isEdit);
    btn.querySelector('span').textContent = isEdit ? 'Terminar Edición' : 'Personalizar y Mover con Ratón';
  }

  const { report } = state;
  const vs = getViewSettings();
  const hiddenCategories = vs.hiddenCategories || [];
  const hiddenProducts = vs.hiddenProducts || [];
  const hiddenSubgroups = vs.hiddenSubgroups || {};
  const hiddenSubgroupInsumos = vs.hiddenSubgroupInsumos || {};

  // Render Edit Mode Banner if active
  if (banner) {
    if (isEdit) {
      banner.classList.remove('hidden');
      const allRaw = report.rawCategoryBreakdown || [];
      const hiddenCatItems = allRaw.filter(c => hiddenCategories.includes(c.category));

      banner.innerHTML = `
        <div class="edit-toolbar-left">
          <b><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Modo Reorganización con Ratón Activo</b>
          <span>Puede <b>arrastrar y soltar con el ratón</b> (icono <span style="cursor:grab; font-weight:800;">⠿</span>) los productos, subgrupos y categorías para fijar su orden exacto. Además, use el botón <b>Editar / Añadir Productos</b> en cada subgrupo para seleccionar o agregar qué productos van en él.</span>
          ${hiddenCatItems.length ? `
            <div class="hidden-items-list">
              <span style="font-size:11px; font-weight:700; color:#15803d;">Categorías Ocultas:</span>
              ${hiddenCatItems.map(c => `
                <span class="hidden-item-tag">
                  ${c.category}
                  <button type="button" data-restore-cat="${c.category}" title="Volver a mostrar">Mostrar</button>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="edit-toolbar-actions">
          <button type="button" id="resetCategoryViewBtn" class="btn outline" style="padding:4px 10px; font-size:12px;">Restablecer Todo</button>
          <button type="button" id="closeCategoryEditBtn" class="btn primary" style="padding:4px 12px; font-size:12px;">Guardar y Cerrar</button>
        </div>
      `;

      banner.querySelector('#resetCategoryViewBtn')?.addEventListener('click', () => {
        saveViewSettings({
          categoryOrder: [],
          hiddenCategories: [],
          subgroupOrder: {},
          hiddenSubgroups: {},
          productOrder: {},
          hiddenProducts: [],
          subgroupInsumoOrder: {},
          hiddenSubgroupInsumos: {}
        });
      });
      banner.querySelector('#closeCategoryEditBtn')?.addEventListener('click', () => {
        editViewMode.category = false;
        render();
      });
      banner.querySelectorAll('[data-restore-cat]').forEach(b => {
        b.onclick = () => {
          const cat = b.dataset.restoreCat;
          const next = hiddenCategories.filter(x => x !== cat);
          saveViewSettings({ hiddenCategories: next });
        };
      });
    } else {
      banner.classList.add('hidden');
    }
  }

  // Choose source data: In edit mode, show all categories (with dimming for hidden ones) so user can unhide them
  let breakdown = isEdit ? (report.rawCategoryBreakdown || report.categoryBreakdown || []) : (report.categoryBreakdown || []);
  const catOrder = vs.categoryOrder || [];
  if (catOrder.length) {
    const cMap = new Map(catOrder.map((c, i) => [c, i]));
    breakdown = [...breakdown].sort((a, b) => (cMap.has(a.category) ? cMap.get(a.category) : 999) - (cMap.has(b.category) ? cMap.get(b.category) : 999));
  }

  if (!breakdown.length) {
    box.innerHTML = '<p class="hint">Aún no hay productos registrados en el catálogo para realizar el arqueo por categoría.</p>';
    return;
  }

  box.innerHTML = breakdown.map((cat, catIdx) => {
    const isCatHidden = hiddenCategories.includes(cat.category);
    const subOrder = vs.subgroupOrder?.[cat.category] || [];
    const hiddenSubForCat = hiddenSubgroups[cat.category] || [];

    // Sort subgroups if customized
    let subs = [...(cat.subgroups || [])];
    if (subOrder.length) {
      const sMap = new Map(subOrder.map((s, i) => [s, i]));
      subs.sort((a, b) => (sMap.has(a.subgroup) ? sMap.get(a.subgroup) : 999) - (sMap.has(b.subgroup) ? sMap.get(b.subgroup) : 999));
    }

    const isCatCollapsed = collapsedCategories.has(cat.category);

    return `
    <div class="category-list-card ${isCatHidden ? 'dimmed-card' : ''} ${isCatCollapsed ? 'is-collapsed' : ''}" data-drag-cat="${cat.category}" style="${isCatHidden ? 'opacity:0.6; border:1px dashed #94a3b8;' : ''}">
      <div class="category-list-header ${isEdit ? 'in-edit-mode' : ''}" data-toggle-cat-header="${cat.category}">
        <div style="display:flex; align-items:center; gap:8px;">
          ${!isEdit ? `
            <button type="button" class="collapse-toggle-btn" data-toggle-cat-btn="${cat.category}" title="${isCatCollapsed ? 'Desplegar categoría' : 'Plegar categoría'}" aria-expanded="${!isCatCollapsed}">
              <svg class="chevron-icon category-chevron ${isCatCollapsed ? 'collapsed' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          ` : ''}
          ${isEdit ? `
            <div class="category-order-controls">
              <button type="button" class="ctrl-btn" data-move-cat="up" data-cat="${cat.category}" ${catIdx === 0 ? 'disabled' : ''} title="Mover categoría arriba">▲</button>
              <button type="button" class="ctrl-btn" data-move-cat="down" data-cat="${cat.category}" ${catIdx === breakdown.length - 1 ? 'disabled' : ''} title="Mover categoría abajo">▼</button>
              <button type="button" class="ctrl-btn hide-btn" data-toggle-hide-cat="${cat.category}" title="${isCatHidden ? 'Mostrar categoría' : 'Ocultar categoría'}">
                ${isCatHidden ? '👁+' : '👁‍🗨'}
              </button>
            </div>
          ` : ''}
          <div>
            <h3 style="margin:0; font-size:15px; display:flex; align-items:center; gap:6px;">
              <span>CATEGORÍA: ${cat.category.toUpperCase()}</span>
              ${isCatHidden ? '<span class="badge badge-danger" style="font-size:10px;">Oculta</span>' : ''}
            </h3>
            <span class="hint" style="font-size:11px;">${subs.length} subgrupo${subs.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-ok" style="font-size:11.5px;">Total: ${num(cat.totalUnits)} und.</span>
          <div style="font-size:15px; font-weight:800; color:var(--brand-teal); margin-top:2px;">${money(cat.totalSalesValue)}</div>
        </div>
      </div>

      <div class="category-collapsible-body">
        <div class="subgroups-container" data-cat-name="${cat.category}">
        ${subs.map((sg, subIdx) => {
          const isSubHidden = hiddenSubForCat.includes(sg.subgroup);
          if (!isEdit && isSubHidden) return '';

          const subKey = `${cat.category}::${sg.subgroup}`;
          const isSubCollapsed = collapsedSubgroups.has(subKey);
          const prodOrder = vs.productOrder?.[subKey] || [];
          const hiddenInsumosForSub = hiddenSubgroupInsumos[subKey] || [];

          let prods = [...(sg.products || [])];
          if (prodOrder.length) {
            const pMap = new Map(prodOrder.map((p, i) => [p, i]));
            prods.sort((a, b) => (pMap.has(a.id || a.name) ? pMap.get(a.id || a.name) : 999) - (pMap.has(b.id || b.name) ? pMap.get(b.id || b.name) : 999));
          }

          // Subgroup insumos audit list (in edit mode show all raw so user can reorder or toggle)
          const subAuditSource = isEdit ? (sg.allInsumosAudit || sg.insumosAudit || []) : (sg.insumosAudit || []);
          let subAuditList = [...subAuditSource];
          const subInsumoOrderList = vs.subgroupInsumoOrder?.[subKey];
          if (subInsumoOrderList && subInsumoOrderList.length) {
            const siaMap = new Map(subInsumoOrderList.map((id, i) => [id, i]));
            subAuditList.sort((a, b) => (siaMap.has(a.insumo?.id) ? siaMap.get(a.insumo?.id) : 999) - (siaMap.has(b.insumo?.id) ? siaMap.get(b.insumo?.id) : 999));
          }

          return `
          <div class="subgroup-card-block ${isSubCollapsed ? 'is-collapsed' : ''}" data-drag-sub="${sg.subgroup}" data-cat="${cat.category}" data-subkey="${subKey}" style="${isSubHidden ? 'opacity:0.55; border:1px dashed #cbd5e1;' : ''}">
            <div class="subgroup-card-header-bar" data-toggle-sub-header="${subKey}">
              <div style="display:flex; align-items:center; gap:8px;">
                ${!isEdit ? `
                  <button type="button" class="subgroup-collapse-btn" data-toggle-sub-btn="${subKey}" title="${isSubCollapsed ? 'Desplegar subgrupo' : 'Plegar subgrupo'}" aria-expanded="${!isSubCollapsed}">
                    <svg class="chevron-icon subgroup-chevron ${isSubCollapsed ? 'collapsed' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                ` : ''}
                ${isEdit ? `
                  <div class="ctrl-group">
                    <button type="button" class="ctrl-btn" data-move-sub="up" data-cat="${cat.category}" data-sub="${sg.subgroup}" ${subIdx === 0 ? 'disabled' : ''} title="Mover subgrupo arriba">▲</button>
                    <button type="button" class="ctrl-btn" data-move-sub="down" data-cat="${cat.category}" data-sub="${sg.subgroup}" ${subIdx === subs.length - 1 ? 'disabled' : ''} title="Mover subgrupo abajo">▼</button>
                    <button type="button" class="ctrl-btn" data-rename-sub data-cat="${cat.category}" data-sub="${sg.subgroup}" title="Cambiar o editar el nombre de este subgrupo">✏️</button>
                    <button type="button" class="ctrl-btn" data-delete-sub data-cat="${cat.category}" data-sub="${sg.subgroup}" title="Eliminar este subgrupo y reasignar sus productos" style="color:#ef4444;">🗑️</button>
                    <button type="button" class="ctrl-btn hide-btn" data-toggle-hide-sub="${sg.subgroup}" data-cat="${cat.category}" title="${isSubHidden ? 'Mostrar subgrupo' : 'Ocultar subgrupo'}">
                      ${isSubHidden ? '👁+' : '👁‍🗨'}
                    </button>
                  </div>
                ` : ''}
                <div>
                  <b style="font-size:13px; color:var(--brand-dark);">${cat.category.toUpperCase()} › ${sg.subgroup.toUpperCase()}</b>
                  ${isSubHidden ? '<small style="color:red; font-weight:700; margin-left:4px;">(Oculto)</small>' : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="subgroup-summary-pill">${num(sg.totalUnits)} und. &bull; ${money(sg.totalSalesValue)}</span>
                ${isEdit ? `
                  <button type="button" class="manage-subgroup-btn" data-open-subgroup-modal data-cat="${cat.category}" data-sub="${sg.subgroup}" title="Editar o agregar qué productos van en este subgrupo">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"></path></svg>
                    + Productos
                  </button>
                ` : ''}
              </div>
            </div>

            <div class="subgroup-collapsible-body">
              <div class="table-wrap subgroup-table-wrap">
                <table class="excel-like-table table-products-subgroup">
                  <thead>
                    <tr class="excel-subgroup-title-row">
                      <th class="th-prod-name">PRODUCTO VENDIDO</th>
                      <th class="th-prod-qty">CANTIDAD</th>
                      <th class="th-prod-val">VALOR ($)</th>
                    </tr>
                  </thead>
                  <tbody class="products-sortable-body" data-subkey="${subKey}">
                    ${prods.length === 0 ? `
                      <tr>
                        <td colspan="3" style="text-align:center; padding:12px; font-size:12.5px; color:var(--muted); background:#fafafa;">
                          Sin productos asignados a este subgrupo.
                          ${isEdit ? `
                            <button type="button" class="manage-subgroup-btn" data-open-subgroup-modal data-cat="${cat.category}" data-sub="${sg.subgroup}" style="margin-left:8px;">
                              + Seleccionar Productos
                            </button>
                          ` : ''}
                        </td>
                      </tr>
                    ` : prods.map((p, prodIdx) => {
                      const pKey = p.id || p.name;
                      const isProdHidden = hiddenProducts.includes(pKey);
                      if (!isEdit && isProdHidden) return '';

                      return `
                      <tr class="${p.quantity > 0 ? 'sold-row' : 'zero-row'}" data-drag-prod="${pKey}" style="${isProdHidden ? 'opacity:0.5;' : ''}">
                        <td class="td-prod-name">
                          <div class="prod-item-cell">
                            ${isEdit ? `
                              <div class="ctrl-group">
                                <span class="drag-handle" title="Arrastre con el ratón para poner este producto donde quiera">⠿</span>
                                <button type="button" class="ctrl-btn" data-move-prod="up" data-cat="${cat.category}" data-sub="${sg.subgroup}" data-prod="${pKey}" ${prodIdx === 0 ? 'disabled' : ''} title="Subir producto">▲</button>
                                <button type="button" class="ctrl-btn" data-move-prod="down" data-cat="${cat.category}" data-sub="${sg.subgroup}" data-prod="${pKey}" ${prodIdx === prods.length - 1 ? 'disabled' : ''} title="Bajar producto">▼</button>
                                <button type="button" class="ctrl-btn hide-btn" data-toggle-hide-prod="${pKey}" title="${isProdHidden ? 'Mostrar producto' : 'Ocultar producto'}">
                                  ${isProdHidden ? '👁+' : '👁‍🗨'}
                                </button>
                              </div>
                            ` : ''}
                            <span class="prod-name-label"><b>${p.name}</b></span> ${isProdHidden ? '<small style="color:red; margin-left:4px;">(oculto)</small>' : ''}
                          </div>
                        </td>
                        <td class="td-prod-qty"><b>${num(p.quantity)}</b></td>
                        <td class="td-prod-val">${p.quantity > 0 ? money(p.total) : '$ -'}</td>
                      </tr>
                      `;
                    }).join('')}
                    <tr class="excel-total-row">
                      <td class="td-prod-name"><b>TOTAL SUBGRUPO ${sg.subgroup.toUpperCase()}</b></td>
                      <td class="td-prod-qty"><b>${num(sg.totalUnits)}</b></td>
                      <td class="td-prod-val"><b>${money(sg.totalSalesValue)}</b></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              ${isEdit ? `
                <div style="display:flex; justify-content:flex-start; padding:4px 4px 8px 4px;">
                  <button type="button" class="add-products-subgroup-link" data-open-subgroup-modal data-cat="${cat.category}" data-sub="${sg.subgroup}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"></path></svg>
                    Adicionar productos a ${sg.subgroup}
                  </button>
                </div>
              ` : ''}

              <!-- Bloque de Auditoría del Subgrupo -->
              <div class="excel-audit-container">
                <div class="audit-subgroup-bar">
                  <div class="audit-bar-inner">
                    <span class="audit-bar-title">AUDITORÍA: INSUMOS (${sg.subgroup.toUpperCase()})</span>
                    ${isEdit ? `<span class="audit-edit-hint">Arrastrar o mover con ratón</span>` : ''}
                  </div>
                </div>
                <div class="audit-table-wrap">
                  <table class="excel-like-table table-audit-subgroup">
                    <thead>
                      <tr class="audit-subgroup-header">
                        <th class="th-insumo-name">INSUMO</th>
                        <th class="th-insumo-inv">FÍSICO<span class="th-sublabel"> (INV.)</span></th>
                        <th class="th-insumo-tirilla">TIRILLA<span class="th-sublabel"> (VTAS)</span></th>
                        <th class="th-insumo-diff">DIFERENCIA</th>
                      </tr>
                    </thead>
                    <tbody class="audit-insumos-sortable-body" data-subkey="${subKey}">
                      ${subAuditList.length ? subAuditList.map((ia, insIdx) => {
                        if (!ia || !ia.insumo) return '';
                        const insId = ia.insumo.id;
                        const isInsHidden = hiddenInsumosForSub.includes(insId);
                        if (!isEdit && isInsHidden) return '';

                        const insName = String(ia.insumo.name || 'INSUMO').toUpperCase();
                        const unit = ia.insumo.unit ? ` (${ia.insumo.unit})` : '';
                        const diff = Number(ia.difference || 0);
                        const statusClass = diff === 0 ? 'status-ok' : diff > 0 ? 'status-diff-neg' : 'status-diff-pos';
                        const diffText = diff === 0 ? '0 (OK)' : diff > 0 ? `+${num(diff)} (Falt.)` : `${num(diff)} (Sobr.)`;

                        return `
                          <tr class="subgroup-audit-item-row ${isEdit ? 'audit-row-edit-mode' : ''}" data-drag-audit-insumo="${insId}" style="${isInsHidden ? 'opacity:0.45; background:#f8fafc;' : ''}">
                            <td class="td-insumo-name">
                              <div class="insumo-item-cell">
                                ${isEdit ? `
                                  <div class="ctrl-group">
                                    <span class="drag-handle" title="Arrastre con el ratón para reordenar este insumo en la auditoría">⠿</span>
                                    <button type="button" class="ctrl-btn" data-move-sub-insumo="up" data-subkey="${subKey}" data-insumo="${insId}" ${insIdx === 0 ? 'disabled' : ''} title="Subir insumo en auditoría">▲</button>
                                    <button type="button" class="ctrl-btn" data-move-sub-insumo="down" data-subkey="${subKey}" data-insumo="${insId}" ${insIdx === subAuditList.length - 1 ? 'disabled' : ''} title="Bajar insumo en auditoría">▼</button>
                                    <button type="button" class="ctrl-btn hide-btn" data-toggle-hide-sub-insumo="${insId}" data-subkey="${subKey}" title="${isInsHidden ? 'Mostrar este insumo en auditoría' : 'Ocultar este insumo de la auditoría'}">
                                      ${isInsHidden ? '👁+' : '👁‍🗨'}
                                    </button>
                                  </div>
                                ` : ''}
                                <div class="insumo-title-group">
                                  <b class="insumo-name-text">${insName}</b> <small class="insumo-unit-text">${unit}</small>
                                  ${isInsHidden ? '<small style="color:red; font-weight:700; display:block;">(Oculto)</small>' : ''}
                                </div>
                              </div>
                            </td>
                            <td class="td-insumo-inv">
                              <b>${num(ia.calculatedOut)}</b>
                              <span class="sub-label-desktop">Salida Físico</span>
                            </td>
                            <td class="td-insumo-tirilla">
                              <b>${num(ia.theoretical)}</b>
                              <span class="sub-label-desktop">Exigido Ventas</span>
                            </td>
                            <td class="td-insumo-diff">
                              <span class="${statusClass}"><b>${diffText}</b></span>
                            </td>
                          </tr>
                        `;
                      }).join('') : `<tr><td colspan="4" class="hint" style="text-align:center; padding:8px;">No hay insumos vinculados para auditar en este tamaño.</td></tr>`}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          `;
        }).join('')}
        </div>

        <div class="excel-category-total-banner">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:14px; font-weight:800;">GRAN TOTAL CATEGORÍA ${cat.category.toUpperCase()}</span>
            <span style="font-size:16px; font-weight:800; color:var(--brand-accent);">${num(cat.totalUnits)} UND. | ${money(cat.totalSalesValue)}</span>
          </div>
        </div>
      </div>
    </div>
    `;
  }).join('');

  // Attach event handlers and Drag-and-Drop
  if (isEdit) {
    // 1. Drag & Drop for Category Cards
    setupDragAndDrop(box, '.category-list-card', (newOrder) => {
      saveViewSettings({ categoryOrder: newOrder });
    });
    box.querySelectorAll('.category-list-card').forEach(el => {
      el.dataset.dragId = el.dataset.dragCat;
    });

    // 2. Drag & Drop for Subgroups within each category
    box.querySelectorAll('.subgroups-container').forEach(subContainer => {
      const catName = subContainer.dataset.catName;
      subContainer.querySelectorAll('.subgroup-card-block').forEach(el => {
        el.dataset.dragId = el.dataset.dragSub;
      });
      setupDragAndDrop(subContainer, '.subgroup-card-block', (newSubOrder) => {
        const currentSubOrder = Object.assign({}, vs.subgroupOrder || {}, { [catName]: newSubOrder });
        saveViewSettings({ subgroupOrder: currentSubOrder });
      });
    });

    // 3. Drag & Drop for Products within each subgroup
    box.querySelectorAll('.products-sortable-body').forEach(tbody => {
      const subKey = tbody.dataset.subkey;
      tbody.querySelectorAll('tr[data-drag-prod]').forEach(tr => {
        tr.dataset.dragId = tr.dataset.dragProd;
      });
      setupDragAndDrop(tbody, 'tr[data-drag-prod]', (newProdOrder) => {
        const currentProdOrder = Object.assign({}, vs.productOrder || {}, { [subKey]: newProdOrder });
        saveViewSettings({ productOrder: currentProdOrder });
      });
    });

    // 4. Drag & Drop for Insumos within Subgroup Audit
    box.querySelectorAll('.audit-insumos-sortable-body').forEach(tbody => {
      const subKey = tbody.dataset.subkey;
      tbody.querySelectorAll('tr[data-drag-audit-insumo]').forEach(tr => {
        tr.dataset.dragId = tr.dataset.dragAuditInsumo;
      });
      setupDragAndDrop(tbody, 'tr[data-drag-audit-insumo]', (newInsumoOrder) => {
        const currentSubInsumoOrder = Object.assign({}, vs.subgroupInsumoOrder || {}, { [subKey]: newInsumoOrder });
        saveViewSettings({ subgroupInsumoOrder: currentSubInsumoOrder });
      });
    });

    // Button controls: Category Move
    box.querySelectorAll('[data-move-cat]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const dir = btn.dataset.moveCat;
        const catCards = Array.from(box.querySelectorAll('.category-list-card'));
        const allCats = catCards.map(c => c.dataset.dragCat).filter(Boolean);
        const idx = allCats.indexOf(catName);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= allCats.length) return;
        const temp = allCats[idx];
        allCats[idx] = allCats[swapIdx];
        allCats[swapIdx] = temp;
        saveViewSettings({ categoryOrder: allCats });
      };
    });

    // Category Toggle Hide
    box.querySelectorAll('[data-toggle-hide-cat]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.toggleHideCat;
        let list = [...hiddenCategories];
        if (list.includes(catName)) list = list.filter(c => c !== catName);
        else list.push(catName);
        saveViewSettings({ hiddenCategories: list });
      };
    });

    // Subgroup Move
    box.querySelectorAll('[data-move-sub]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const subName = btn.dataset.sub;
        const dir = btn.dataset.moveSub;
        const subContainer = btn.closest('.subgroups-container');
        if (!subContainer) return;
        const blocks = Array.from(subContainer.querySelectorAll('.subgroup-card-block'));
        const currentSubs = blocks.map(b => b.dataset.dragSub).filter(Boolean);
        const idx = currentSubs.indexOf(subName);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= currentSubs.length) return;
        const temp = currentSubs[idx];
        currentSubs[idx] = currentSubs[swapIdx];
        currentSubs[swapIdx] = temp;
        const subOrder = Object.assign({}, vs.subgroupOrder || {}, { [catName]: currentSubs });
        saveViewSettings({ subgroupOrder: subOrder });
      };
    });

    // Subgroup Rename
    box.querySelectorAll('[data-rename-sub]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const subName = btn.dataset.sub;
        promptRenameSubgroup(catName, subName);
      };
    });

    // Subgroup Delete
    box.querySelectorAll('[data-delete-sub]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const subName = btn.dataset.sub;
        promptDeleteSubgroup(catName, subName);
      };
    });

    // Subgroup Toggle Hide
    box.querySelectorAll('[data-toggle-hide-sub]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const subName = btn.dataset.toggleHideSub;
        const currentSubs = hiddenSubgroups[catName] || [];
        let next;
        if (currentSubs.includes(subName)) next = currentSubs.filter(s => s !== subName);
        else next = [...currentSubs, subName];
        const nextMap = Object.assign({}, hiddenSubgroups, { [catName]: next });
        saveViewSettings({ hiddenSubgroups: nextMap });
      };
    });

    // Product Move
    box.querySelectorAll('[data-move-prod]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const catName = btn.dataset.cat;
        const subName = btn.dataset.sub;
        const prodKey = btn.dataset.prod;
        const dir = btn.dataset.moveProd;
        const key = `${catName}::${subName}`;
        const tbody = btn.closest('tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr[data-drag-prod]'));
        const currentList = rows.map(r => r.dataset.dragProd).filter(Boolean);
        const idx = currentList.indexOf(prodKey);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= currentList.length) return;
        const temp = currentList[idx];
        currentList[idx] = currentList[swapIdx];
        currentList[swapIdx] = temp;
        const pOrder = Object.assign({}, vs.productOrder || {}, { [key]: currentList });
        saveViewSettings({ productOrder: pOrder });
      };
    });

    // Product Toggle Hide
    box.querySelectorAll('[data-toggle-hide-prod]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const prodKey = btn.dataset.toggleHideProd;
        let list = [...hiddenProducts];
        if (list.includes(prodKey)) list = list.filter(p => p !== prodKey);
        else list.push(prodKey);
        saveViewSettings({ hiddenProducts: list });
      };
    });

    // Subgroup Insumo Audit Move
    box.querySelectorAll('[data-move-sub-insumo]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const subKey = btn.dataset.subkey;
        const insId = btn.dataset.insumo;
        const dir = btn.dataset.moveSubInsumo;
        const tbody = btn.closest('tbody');
        if (!tbody) return;
        const rows = Array.from(tbody.querySelectorAll('tr[data-drag-audit-insumo]'));
        const allIds = rows.map(r => r.dataset.dragAuditInsumo).filter(Boolean);
        const idx = allIds.indexOf(insId);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= allIds.length) return;
        const temp = allIds[idx];
        allIds[idx] = allIds[swapIdx];
        allIds[swapIdx] = temp;
        const nextOrderMap = Object.assign({}, vs.subgroupInsumoOrder || {}, { [subKey]: allIds });
        saveViewSettings({ subgroupInsumoOrder: nextOrderMap });
      };
    });

    // Subgroup Insumo Audit Toggle Hide
    box.querySelectorAll('[data-toggle-hide-sub-insumo]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const subKey = btn.dataset.subkey;
        const insId = btn.dataset.toggleHideSubInsumo;
        const currentList = hiddenSubgroupInsumos[subKey] || [];
        let next;
        if (currentList.includes(insId)) next = currentList.filter(x => x !== insId);
        else next = [...currentList, insId];
        const nextMap = Object.assign({}, hiddenSubgroupInsumos, { [subKey]: next });
        saveViewSettings({ hiddenSubgroupInsumos: nextMap });
      };
    });
  }

  // Open Subgroup Products Modal (available in both normal and edit view)
  box.querySelectorAll('[data-open-subgroup-modal]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openSubgroupProductsModal(btn.dataset.cat, btn.dataset.sub);
    };
  });

  // Category and Subgroup Collapse Listeners
  box.querySelectorAll('[data-toggle-cat-header]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.ctrl-btn, .drag-handle, .manage-subgroup-btn, .collapse-toggle-btn, a, input, select')) return;
      const cat = header.dataset.toggleCatHeader;
      toggleCategoryCollapse(cat);
    });
  });

  box.querySelectorAll('[data-toggle-cat-btn]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cat = btn.dataset.toggleCatBtn;
      toggleCategoryCollapse(cat);
    });
  });

  box.querySelectorAll('[data-toggle-sub-header]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.ctrl-btn, .drag-handle, .manage-subgroup-btn, .subgroup-collapse-btn, a, input, select')) return;
      const subKey = header.dataset.toggleSubHeader;
      toggleSubgroupCollapse(subKey);
    });
  });

  box.querySelectorAll('[data-toggle-sub-btn]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const subKey = btn.dataset.toggleSubBtn;
      toggleSubgroupCollapse(subKey);
    });
  });

  updateGlobalCollapseButtonLabel();
}

let currentSubgroupModalTarget = { category: '', subgroup: '' };

function openSubgroupProductsModal(category, subgroup) {
  currentSubgroupModalTarget = { category, subgroup };
  const modal = $('#subgroupProductsModal');
  if (!modal) return;

  const titleEl = $('#subgroupModalTitle');
  if (titleEl) titleEl.textContent = `Gestionar Productos: ${category} › ${subgroup}`;

  const subtitleEl = $('#subgroupModalSubtitle');
  if (subtitleEl) subtitleEl.textContent = `Seleccione qué productos de la carta o tirilla van en "${subgroup}" o cree uno nuevo.`;

  const searchInput = $('#modalProductSearchInput');
  if (searchInput) searchInput.value = '';
  $('#clearModalSearchBtn')?.classList.add('hidden');
  const availSearchInputInit = $('#modalAvailableSearchInput');
  if (availSearchInputInit) availSearchInputInit.value = '';
  $('#clearModalAvailableSearchBtn')?.classList.add('hidden');
  $('#modalNewProductForm')?.classList.add('hidden');
  $('#modalCreateProductPrompt')?.classList.add('hidden');

  renderSubgroupModalContent('');
  modal.classList.remove('hidden');

  setTimeout(() => {
    searchInput?.focus();
  }, 80);
}

function closeSubgroupProductsModal() {
  const modal = $('#subgroupProductsModal');
  if (modal) modal.classList.add('hidden');
}

function renderSubgroupModalContent(searchTerm = '') {
  const term = (searchTerm || '').trim().toLowerCase();
  const { category, subgroup } = currentSubgroupModalTarget;
  const allDbProducts = state.db?.products || [];

  // 1. Productos asignados a este subgrupo
  const currentProducts = allDbProducts.filter(p =>
    (p.category || '').toLowerCase() === category.toLowerCase() &&
    (p.subgroup || '').toLowerCase() === subgroup.toLowerCase()
  );

  const currentCountBadge = $('#modalCurrentCountBadge');
  if (currentCountBadge) {
    currentCountBadge.textContent = `${currentProducts.length} producto${currentProducts.length === 1 ? '' : 's'}`;
  }

  const currentBox = $('#modalCurrentProductsList');
  if (currentBox) {
    if (currentProducts.length === 0) {
      currentBox.innerHTML = `<div style="padding:10px; color:var(--muted); font-size:12.5px; text-align:center;">No hay productos asignados a este subgrupo todavía.</div>`;
    } else {
      currentBox.innerHTML = currentProducts.map(p => `
        <div class="modal-product-item">
          <div>
            <b>${p.name}</b>
            <span style="font-size:12px; color:var(--muted); margin-left:8px;">${money(p.price)}</span>
            ${p.recipe && p.recipe.length > 0 ? `<span class="badge badge-info" style="font-size:10.5px; margin-left:6px;">${p.recipe.length} insumos</span>` : ''}
          </div>
          <button type="button" class="btn danger-sm remove-sub-prod-btn" data-id="${p.id}" data-name="${p.name}" style="padding:4px 10px; font-size:12px;" title="Quitar de este subgrupo">
            ✕ Quitar
          </button>
        </div>
      `).join('');

      currentBox.querySelectorAll('.remove-sub-prod-btn').forEach(b => {
        b.onclick = () => removeProductFromSubgroup(b.dataset.id, b.dataset.name);
      });
    }
  }

  // 2. Otros productos disponibles para agregar
  const existingProductNames = new Set(allDbProducts.map(p => (p.name || '').trim().toLowerCase()));
  const salesProducts = [];
  (state.day?.sales || []).forEach(s => {
    const sName = (s.productName || '').trim();
    if (sName && !existingProductNames.has(sName.toLowerCase())) {
      existingProductNames.add(sName.toLowerCase());
      salesProducts.push({
        id: null,
        name: sName,
        price: Number(s.price || 0),
        category: 'Tirilla',
        subgroup: 'Sin registrar en catálogo',
        isFromSales: true
      });
    }
  });

  let available = [
    ...allDbProducts.filter(p => !(
      (p.category || '').toLowerCase() === category.toLowerCase() &&
      (p.subgroup || '').toLowerCase() === subgroup.toLowerCase()
    )),
    ...salesProducts
  ];

  const availSearchInput = $('#modalAvailableSearchInput');
  const availTerm = (availSearchInput?.value || '').trim().toLowerCase();
  if (availTerm) {
    available = available.filter(p => (p.name || '').toLowerCase().includes(availTerm));
  }

  const availCountBadge = $('#modalAvailableCountBadge');
  if (availCountBadge) {
    availCountBadge.textContent = `${available.length} disponible${available.length === 1 ? '' : 's'}`;
  }

  const availBox = $('#modalAvailableProductsList');
  if (availBox) {
    if (available.length === 0) {
      availBox.innerHTML = `<div style="padding:10px; color:var(--muted); font-size:12.5px; text-align:center;">${term ? `No se encontraron otros productos con "${term}".` : 'No hay otros productos disponibles.'}</div>`;
    } else {
      availBox.innerHTML = available.map(p => `
        <div class="modal-product-item">
          <div>
            <b>${p.name}</b>
            <span style="font-size:11px; color:var(--muted); margin-left:6px;">(${p.category || 'General'} › ${p.subgroup || 'Sin tamaño'})</span>
            <span style="font-size:12px; color:#0f766e; margin-left:8px; font-weight:600;">${money(p.price)}</span>
          </div>
          <button type="button" class="btn secondary add-sub-prod-btn" data-id="${p.id || ''}" data-name="${p.name}" style="padding:4px 10px; font-size:12px;" title="Agregar a ${subgroup}">
            + Agregar
          </button>
        </div>
      `).join('');

      availBox.querySelectorAll('.add-sub-prod-btn').forEach(b => {
        b.onclick = () => addProductToSubgroup(b.dataset.id, b.dataset.name);
      });
    }
  }

  // 3. Si el término de búsqueda no coincide exactamente con ningún producto existente, sugerir crearlo
  const promptEl = $('#modalCreateProductPrompt');
  const exactMatch = allDbProducts.some(p => (p.name || '').trim().toLowerCase() === term);
  if (term && term.length >= 2 && !exactMatch) {
    promptEl?.classList.remove('hidden');
    const promptText = $('#createPromptText');
    if (promptText) promptText.textContent = `Crear "${term.toUpperCase()}" y agregarlo a ${subgroup}`;
  } else {
    promptEl?.classList.add('hidden');
  }
}

async function addProductToSubgroup(id, name) {
  const { category, subgroup } = currentSubgroupModalTarget;
  try {
    const date = $('#date').value;
    const payload = {
      category,
      subgroup,
      productIdsToAdd: id ? [id] : [],
      productNamesToAdd: !id ? [name] : []
    };
    const res = await api(`/api/subgroups/assign-products?date=${date}`, 'POST', payload);
    state.db.products = res.products;
    state.report = res.report;
    render();
    renderSubgroupModalContent($('#modalProductSearchInput')?.value || '');
    toast(`"${name}" agregado al subgrupo ${subgroup}`);
  } catch (err) {
    toast('Error al agregar producto: ' + err.message);
  }
}

async function removeProductFromSubgroup(id, name) {
  const { category, subgroup } = currentSubgroupModalTarget;
  try {
    const date = $('#date').value;
    const payload = {
      category,
      subgroup,
      productIdsToRemove: id ? [id] : []
    };
    const res = await api(`/api/subgroups/assign-products?date=${date}`, 'POST', payload);
    state.db.products = res.products;
    state.report = res.report;
    render();
    renderSubgroupModalContent($('#modalProductSearchInput')?.value || '');
    toast(`"${name}" retirado de ${subgroup}`);
  } catch (err) {
    toast('Error al retirar producto: ' + err.message);
  }
}

async function saveSubgroupNewProduct(name, price) {
  const { category, subgroup } = currentSubgroupModalTarget;
  if (!name) return;
  try {
    const date = $('#date').value;
    const payload = {
      category,
      subgroup,
      newProducts: [{ name, price }]
    };
    const res = await api(`/api/subgroups/assign-products?date=${date}`, 'POST', payload);
    state.db.products = res.products;
    state.report = res.report;
    render();
    $('#modalNewProductForm')?.classList.add('hidden');
    const sInput = $('#modalProductSearchInput');
    if (sInput) sInput.value = '';
    $('#clearModalSearchBtn')?.classList.add('hidden');
    renderSubgroupModalContent('');
    toast(`"${name}" creado y asignado a ${subgroup}`);
  } catch (err) {
    toast('Error al crear producto: ' + err.message);
  }
}

function showActionDialog({ title, message, inputLabel, inputValue, confirmText = 'Confirmar', isDanger = false }) {
  return new Promise((resolve) => {
    const modal = $('#actionPromptModal');
    const titleEl = $('#actionPromptTitle');
    const msgEl = $('#actionPromptMessage');
    const inputWrap = $('#actionPromptInputWrap');
    const inputEl = $('#actionPromptInput');
    const inputLabelEl = $('#actionPromptInputLabel');
    const cancelBtn = $('#cancelActionPromptBtn');
    const confirmBtn = $('#confirmActionPromptBtn');
    const closeBtn = $('#closeActionPromptBtn');

    if (!modal) {
      resolve(null);
      return;
    }

    titleEl.textContent = title;
    msgEl.innerHTML = message;

    if (inputValue !== undefined) {
      inputWrap.classList.remove('hidden');
      inputLabelEl.textContent = inputLabel || '';
      inputEl.value = inputValue;
    } else {
      inputWrap.classList.add('hidden');
      inputEl.value = '';
    }

    confirmBtn.textContent = confirmText;
    if (isDanger) {
      confirmBtn.className = 'btn danger';
    } else {
      confirmBtn.className = 'btn primary';
    }

    modal.classList.remove('hidden');
    if (inputValue !== undefined) {
      setTimeout(() => {
        inputEl.focus();
        inputEl.select();
      }, 50);
    }

    function cleanup(result) {
      modal.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
      inputEl.onkeydown = null;
      resolve(result);
    }

    confirmBtn.onclick = () => {
      if (inputValue !== undefined) {
        cleanup(inputEl.value.trim());
      } else {
        cleanup(true);
      }
    };

    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmBtn.click();
      } else if (e.key === 'Escape') {
        cleanup(null);
      }
    };

    cancelBtn.onclick = () => cleanup(null);
    closeBtn.onclick = () => cleanup(null);
  });
}

async function promptRenameSubgroup(category, oldSubgroup) {
  if (!category || !oldSubgroup) return;
  const newName = await showActionDialog({
    title: 'Renombrar Subgrupo',
    message: `Categoría: <b>${category}</b><br>Modifique el nombre del subgrupo para todos sus productos:`,
    inputLabel: 'Nuevo nombre del subgrupo:',
    inputValue: oldSubgroup,
    confirmText: 'Guardar Nombre'
  });

  if (!newName || newName.toLowerCase() === oldSubgroup.toLowerCase()) return;

  try {
    const date = $('#date').value || today();
    const res = await api(`/api/subgroups/rename?date=${date}`, 'POST', {
      category,
      oldSubgroup,
      newSubgroup: newName
    });
    if (res.products) state.db.products = res.products;
    if (res.report) state.report = res.report;
    if (res.settings) state.db.settings = res.settings;
    render();
    if (!$('#subgroupProductsModal')?.classList.contains('hidden')) {
      openSubgroupProductsModal(category, newName);
    }
    toast(`Subgrupo cambiado a "${newName}" (${res.count || 0} productos actualizados)`);
  } catch (err) {
    toast('Error al renombrar subgrupo: ' + err.message);
  }
}

async function promptDeleteSubgroup(category, subgroup) {
  if (!category || !subgroup) return;
  const currentProds = (state.db?.products || []).filter(p =>
    (p.category || '').toLowerCase() === category.toLowerCase() &&
    (p.subgroup || '').toLowerCase() === subgroup.toLowerCase()
  );

  const confirmed = await showActionDialog({
    title: 'Eliminar Subgrupo',
    message: currentProds.length > 0
      ? `¿Está seguro de eliminar el subgrupo <b>"${subgroup}"</b> de la categoría <b>${category}</b>?<br><br><span style="color:#d97706; font-size:12.5px;">⚠️ Los <b>${currentProds.length} productos</b> asignados pasarán automáticamente al subgrupo "Especiales / Otros" para conservar sus ventas e historial.</span>`
      : `¿Está seguro de eliminar el subgrupo <b>"${subgroup}"</b>?`,
    confirmText: 'Eliminar Subgrupo',
    isDanger: true
  });

  if (!confirmed) return;

  try {
    const date = $('#date').value || today();
    const res = await api(`/api/subgroups/delete?date=${date}`, 'POST', {
      category,
      subgroup,
      targetSubgroup: 'Especiales / Otros'
    });
    if (res.products) state.db.products = res.products;
    if (res.report) state.report = res.report;
    if (res.settings) state.db.settings = res.settings;
    render();
    closeSubgroupProductsModal();
    toast(`Subgrupo "${subgroup}" eliminado`);
  } catch (err) {
    toast('Error al eliminar subgrupo: ' + err.message);
  }
}

function initSubgroupProductsModal() {
  const modal = $('#subgroupProductsModal');
  if (!modal) return;

  $('#closeSubgroupModalBtn')?.addEventListener('click', closeSubgroupProductsModal);
  $('#doneSubgroupModalBtn')?.addEventListener('click', closeSubgroupProductsModal);

  $('#modalRenameSubgroupBtn')?.addEventListener('click', () => {
    promptRenameSubgroup(currentSubgroupModalTarget.category, currentSubgroupModalTarget.subgroup);
  });

  $('#modalDeleteSubgroupBtn')?.addEventListener('click', () => {
    promptDeleteSubgroup(currentSubgroupModalTarget.category, currentSubgroupModalTarget.subgroup);
  });

  // Backdrop click disabled so clicking outside does not accidentally close the modal


  const searchInput = $('#modalProductSearchInput');
  const clearBtn = $('#clearModalSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const val = searchInput.value;
      if (val) clearBtn?.classList.remove('hidden');
      else clearBtn?.classList.add('hidden');
      renderSubgroupModalContent(val);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearBtn.classList.add('hidden');
      renderSubgroupModalContent('');
      searchInput?.focus();
    });
  }

  const availSearchInput = $('#modalAvailableSearchInput');
  const clearAvailBtn = $('#clearModalAvailableSearchBtn');

  if (availSearchInput) {
    availSearchInput.addEventListener('input', () => {
      const val = availSearchInput.value;
      if (val) clearAvailBtn?.classList.remove('hidden');
      else clearAvailBtn?.classList.add('hidden');
      renderSubgroupModalContent($('#modalProductSearchInput')?.value || '');
    });
  }

  if (clearAvailBtn) {
    clearAvailBtn.addEventListener('click', () => {
      if (availSearchInput) availSearchInput.value = '';
      clearAvailBtn.classList.add('hidden');
      renderSubgroupModalContent($('#modalProductSearchInput')?.value || '');
      availSearchInput?.focus();
    });
  }

  $('#openCreateInModalBtn')?.addEventListener('click', () => {
    $('#modalCreateProductPrompt')?.classList.add('hidden');
    const form = $('#modalNewProductForm');
    if (form) {
      form.classList.remove('hidden');
      const nameInput = $('#modalNewProdName');
      if (nameInput) {
        nameInput.value = searchInput?.value.trim().toUpperCase() || '';
      }
      $('#modalNewProdPrice')?.focus();
    }
  });

  $('#cancelModalNewProdBtn')?.addEventListener('click', () => {
    $('#modalNewProductForm')?.classList.add('hidden');
  });

  $('#modalNewProductForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#modalNewProdName')?.value.trim();
    const price = Number($('#modalNewProdPrice')?.value || 0);
    saveSubgroupNewProduct(name, price);
  });
}

function renderInventoryForm() {
  const box = $('#inventoryForm');
  const banner = $('#inventoryEditBanner');
  const btn = $('#toggleEditInventoryBtn');
  if (!box) return;

  const isEdit = editViewMode.inventory;
  if (btn) {
    btn.classList.toggle('active', isEdit);
    btn.querySelector('span').textContent = isEdit ? 'Terminar Edición' : 'Personalizar Vista';
  }

  const { report, day } = state;
  const vs = getViewSettings();
  const hiddenInsumos = vs.hiddenAuditInsumos || [];
  const filter = ($('#inventorySearch')?.value || '').toLowerCase().trim();

  // Banner in edit mode
  if (banner) {
    if (isEdit) {
      banner.classList.remove('hidden');
      const allInvs = report.allInventory || report.inventory || [];
      const hiddenList = allInvs.filter(r => hiddenInsumos.includes(r.insumo.id));

      banner.innerHTML = `
        <div class="edit-toolbar-left">
          <b><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Modo Personalización de Inventario</b>
          <span>Mueva los insumos de lugar con <b>▲ ▼</b> para ordenar su conteo físico diario, u oculte los que no usa con <b>👁</b>.</span>
          ${hiddenList.length ? `
            <div class="hidden-items-list">
              <span style="font-size:11px; font-weight:700; color:#15803d;">Insumos Ocultos (${hiddenList.length}):</span>
              ${hiddenList.map(r => `
                <span class="hidden-item-tag">
                  ${r.insumo.name}
                  <button type="button" data-restore-insumo="${r.insumo.id}" title="Volver a mostrar">Mostrar</button>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="edit-toolbar-actions">
          <button type="button" id="resetInventoryOrderBtn" class="btn outline" style="padding:4px 10px; font-size:12px;">Restablecer Orden</button>
          <button type="button" id="closeInventoryEditBtn" class="btn primary" style="padding:4px 12px; font-size:12px;">Listo</button>
        </div>
      `;

      banner.querySelector('#resetInventoryOrderBtn')?.addEventListener('click', () => {
        saveViewSettings({ auditInsumoOrder: [], hiddenAuditInsumos: [] });
      });
      banner.querySelector('#closeInventoryEditBtn')?.addEventListener('click', () => {
        editViewMode.inventory = false;
        render();
      });
      banner.querySelectorAll('[data-restore-insumo]').forEach(b => {
        b.onclick = () => {
          const id = b.dataset.restoreInsumo;
          const next = hiddenInsumos.filter(x => x !== id);
          saveViewSettings({ hiddenAuditInsumos: next });
        };
      });
    } else {
      banner.classList.add('hidden');
    }
  }

  // Source items: in edit mode show all so user can reorder or unhide
  const source = isEdit ? (report.allInventory || report.inventory || []) : (report.inventory || []);
  const items = source.filter(r => r.insumo.name.toLowerCase().includes(filter));

  box.innerHTML = items.length ? items.map((r, idx) => {
    const isHidden = hiddenInsumos.includes(r.insumo.id);
    return `
    <div class="inventory-card" data-drag-insumo="${r.insumo.id}" style="${isHidden ? 'opacity:0.55; border:1px dashed #cbd5e1; background:#f8fafc;' : ''}">
      <div class="inventory-name">
        <div style="display:flex; align-items:center; gap:6px;">
          ${isEdit ? `
            <div class="ctrl-group">
              <span class="drag-handle" title="Arrastre con el ratón para reordenar este insumo">⠿</span>
              <button type="button" class="ctrl-btn" data-move-insumo="up" data-insumo="${r.insumo.id}" ${idx === 0 ? 'disabled' : ''} title="Mover insumo arriba">▲</button>
              <button type="button" class="ctrl-btn" data-move-insumo="down" data-insumo="${r.insumo.id}" ${idx === items.length - 1 ? 'disabled' : ''} title="Mover insumo abajo">▼</button>
              <button type="button" class="ctrl-btn hide-btn" data-toggle-hide-insumo="${r.insumo.id}" title="${isHidden ? 'Mostrar insumo' : 'Ocultar insumo'}">
                ${isHidden ? '👁+' : '👁‍🗨'}
              </button>
            </div>
          ` : ''}
          <div>
            <b>${r.insumo.name}</b> ${isHidden ? '<small style="color:red;">(oculto)</small>' : ''}
            <div><small>${r.insumo.unit}</small></div>
          </div>
        </div>
      </div>
      <span><small>Inicial</small><b>${num(r.opening)}</b></span>
      <span><small>Entrada</small><b style="color:var(--brand-teal);">${r.entries ? num(r.entries) : '—'}</b></span>
      <span><small>Salida</small><b style="color:var(--red);">${r.adjustments ? num(r.adjustments) : '—'}</b></span>
      <label>
        <small>Final Físico</small>
        <input data-insumo="${r.insumo.id}" aria-label="Final físico de ${r.insumo.name}" type="number" step="0.01" min="0" value="${day.physical[r.insumo.id] ?? 0}">
      </label>
    </div>
    `;
  }).join('') : '<p class="hint">No se encontraron insumos coincidentes.</p>';

  // Sync typed physical values immediately
  box.querySelectorAll('[data-insumo]').forEach(input => {
    input.oninput = () => {
      day.physical[input.dataset.insumo] = Number(input.value || 0);
    };
  });

  // Reorder & visibility handlers in edit mode
  if (isEdit) {
    box.querySelectorAll('.inventory-card').forEach(el => {
      el.dataset.dragId = el.dataset.dragInsumo;
    });
    setupDragAndDrop(box, '.inventory-card', (newIds) => {
      saveViewSettings({ auditInsumoOrder: newIds });
    });

    box.querySelectorAll('[data-move-insumo]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.insumo;
        const dir = btn.dataset.moveInsumo;
        const allIds = source.map(r => r.insumo.id);
        const idx = allIds.indexOf(id);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= allIds.length) return;
        const temp = allIds[idx];
        allIds[idx] = allIds[swapIdx];
        allIds[swapIdx] = temp;
        saveViewSettings({ auditInsumoOrder: allIds });
      };
    });

    box.querySelectorAll('[data-toggle-hide-insumo]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.toggleHideInsumo;
        let list = [...hiddenInsumos];
        if (list.includes(id)) list = list.filter(x => x !== id);
        else list.push(id);
        saveViewSettings({ hiddenAuditInsumos: list });
      };
    });
  }
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
  const banner = $('#auditEditBanner');
  const btn = $('#toggleEditAuditBtn');
  if (!box) return;

  const isEdit = editViewMode.audit;
  if (btn) {
    btn.classList.toggle('active', isEdit);
    btn.querySelector('span').textContent = isEdit ? 'Terminar Edición' : 'Personalizar Insumos Visibles';
  }

  const filter = ($('#auditSearch')?.value || '').toLowerCase().trim();
  const { report } = state;
  const vs = getViewSettings();
  const hiddenInsumos = vs.hiddenAuditInsumos || [];

  // Edit banner
  if (banner) {
    if (isEdit) {
      banner.classList.remove('hidden');
      const allInvs = report.allInventory || report.inventory || [];
      const hiddenList = allInvs.filter(r => hiddenInsumos.includes(r.insumo.id));

      banner.innerHTML = `
        <div class="edit-toolbar-left">
          <b><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> Modo Personalización de Auditoría</b>
          <span>Ordene los insumos de la tabla con <b>▲ ▼</b> u oculte con <b>👁</b> los insumos que no requiera auditar hoy.</span>
          ${hiddenList.length ? `
            <div class="hidden-items-list">
              <span style="font-size:11px; font-weight:700; color:#15803d;">Insumos Ocultos en Auditoría (${hiddenList.length}):</span>
              ${hiddenList.map(r => `
                <span class="hidden-item-tag">
                  ${r.insumo.name}
                  <button type="button" data-restore-audit-insumo="${r.insumo.id}" title="Volver a mostrar">Mostrar</button>
                </span>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="edit-toolbar-actions">
          <button type="button" id="resetAuditOrderBtn" class="btn outline" style="padding:4px 10px; font-size:12px;">Restablecer Orden</button>
          <button type="button" id="closeAuditEditBtn" class="btn primary" style="padding:4px 12px; font-size:12px;">Listo</button>
        </div>
      `;

      banner.querySelector('#resetAuditOrderBtn')?.addEventListener('click', () => {
        saveViewSettings({ auditInsumoOrder: [], hiddenAuditInsumos: [] });
      });
      banner.querySelector('#closeAuditEditBtn')?.addEventListener('click', () => {
        editViewMode.audit = false;
        render();
      });
      banner.querySelectorAll('[data-restore-audit-insumo]').forEach(b => {
        b.onclick = () => {
          const id = b.dataset.restoreAuditInsumo;
          const next = hiddenInsumos.filter(x => x !== id);
          saveViewSettings({ hiddenAuditInsumos: next });
        };
      });
    } else {
      banner.classList.add('hidden');
    }
  }

  // Source list: in edit mode show all so user can reorder or unhide
  const source = isEdit ? (report.allInventory || report.inventory || []) : (report.inventory || []);
  const items = source.filter(r => r.insumo.name.toLowerCase().includes(filter));

  box.innerHTML = items.length ? items.map((r, idx) => {
    const isHidden = hiddenInsumos.includes(r.insumo.id);
    const diff = r.difference;
    const badgeClass = diff > 0 ? 'badge-danger' : diff < 0 ? 'badge-info' : 'badge-ok';
    const badgeText = diff > 0 ? 'Faltante' : diff < 0 ? 'Sobrante' : 'OK';

    return `<tr class="${isEdit ? 'audit-row-edit-mode' : ''}" data-drag-audit="${r.insumo.id}" style="${isHidden ? 'opacity:0.5; background:#f8fafc;' : ''}">
      <td>
        <div style="display:flex; align-items:center;">
          ${isEdit ? `
            <div class="table-row-controls">
              <span class="drag-handle" title="Arrastre con el ratón para reordenar este insumo">⠿</span>
              <button type="button" class="ctrl-btn" data-move-audit="up" data-insumo="${r.insumo.id}" ${idx === 0 ? 'disabled' : ''} title="Subir insumo">▲</button>
              <button type="button" class="ctrl-btn" data-move-audit="down" data-insumo="${r.insumo.id}" ${idx === items.length - 1 ? 'disabled' : ''} title="Bajar insumo">▼</button>
              <button type="button" class="ctrl-btn hide-btn" data-toggle-hide-audit="${r.insumo.id}" title="${isHidden ? 'Mostrar insumo' : 'Ocultar insumo'}">
                ${isHidden ? '👁+' : '👁‍🗨'}
              </button>
            </div>
          ` : ''}
          <div>
            <b>${r.insumo.name}</b> ${isHidden ? '<small style="color:red;">(oculto)</small>' : ''}<br>
            <small>${r.insumo.unit}</small>
          </div>
        </div>
      </td>
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

  // Event handlers in edit mode
  if (isEdit) {
    box.querySelectorAll('tr[data-drag-audit]').forEach(tr => {
      tr.dataset.dragId = tr.dataset.dragAudit;
    });
    setupDragAndDrop(box, 'tr[data-drag-audit]', (newIds) => {
      saveViewSettings({ auditInsumoOrder: newIds });
    });

    box.querySelectorAll('[data-move-audit]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.insumo;
        const dir = btn.dataset.moveAudit;
        const allIds = source.map(r => r.insumo.id);
        const idx = allIds.indexOf(id);
        if (idx === -1) return;
        const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= allIds.length) return;
        const temp = allIds[idx];
        allIds[idx] = allIds[swapIdx];
        allIds[swapIdx] = temp;
        saveViewSettings({ auditInsumoOrder: allIds });
      };
    });

    box.querySelectorAll('[data-toggle-hide-audit]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.toggleHideAudit;
        let list = [...hiddenInsumos];
        if (list.includes(id)) list = list.filter(x => x !== id);
        else list.push(id);
        saveViewSettings({ hiddenAuditInsumos: list });
      };
    });
  }
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
    </div>
    <div class="catalog-items-scroll">
      ${visibleInsumos.map(i => `
        <div class="row" data-insumo-row="${i.id}">
          <span class="catalog-item-name"><b>${i.name}</b> <small>(${i.unit})</small></span>
          <div class="row-actions">
            <b class="catalog-item-price">${money(i.price)}</b>
            <button class="edit-btn" data-edit-insumo="${i.id}">Editar</button>
          </div>
        </div>
      `).join('')}
    </div>`;

    document.querySelectorAll('[data-edit-insumo]').forEach(b => {
      b.onclick = () => openCatalogEditorModal('insumo', b.dataset.editInsumo);
    });

    const openEditBtn = $('#openInsumoEdit');
    if (openEditBtn) {
      openEditBtn.onclick = () => {
        const target = visibleInsumos.find(i => i.name.toLowerCase() === $('#insumoSearch').value.trim().toLowerCase());
        if (!target) return toast('Selecciona un insumo válido de la lista');
        openCatalogEditorModal('insumo', target.id);
      };
    }
  }

  const productsList = $('#productsList');
  if (productsList) {
    productsList.innerHTML = `
      <div class="catalog-items-scroll">
        ${db.products.map(p => `
          <div class="row">
            <span class="catalog-item-name">
              <b>${p.name}</b> <span class="badge badge-info" style="margin-left: 6px;">${p.category || 'Hamburguesas'}</span>
              <br><small>${p.recipe.map(r => `${db.insumos.find(i => i.id === r.insumoId)?.name || '?'} × ${r.quantity}`).join(' + ') || 'Sin insumos'}</small>
            </span>
            <div class="row-actions">
              <b class="catalog-item-price">${money(p.price)}</b>
              <button class="edit-btn" data-edit-product="${p.id}">Editar Receta</button>
            </div>
          </div>
        `).join('')}
      </div>`;

    document.querySelectorAll('[data-edit-product]').forEach(b => {
      b.onclick = () => openCatalogEditorModal('product', b.dataset.editProduct);
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
    <div class="recipe-line">
      <select>${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.id}" ${i.id === r.id ? 'selected' : ''}>${i.name}</option>`).join('')}</select>
      <input type="number" min="0.01" step="0.01" value="${r.q}">
      <button type="button" class="removeIngredient">×</button>
    </div>
  `).join('');

  box.querySelectorAll('.removeIngredient').forEach(b => {
    b.onclick = () => {
      if (box.children.length > 1) b.closest('.recipe-line').remove();
      else toast('La receta debe contener al menos un ingrediente');
    };
  });
}

function openCatalogEditorModal(kind, id) {
  state.editing = { kind, id };
  renderCatalogEditor();
}

function closeCatalogEditorModal() {
  state.editing = null;
  const modal = $('#catalogEditorModal');
  if (modal) modal.classList.add('hidden');
  const box = $('#catalogModalBox');
  if (box) box.innerHTML = '';
  document.body.style.overflow = '';
}

function initCatalogEditorModal() {
  const modal = $('#catalogEditorModal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = 'true';
  // Backdrop click disabled so clicking outside does not accidentally close the modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeCatalogEditorModal();
    }
  });
}

function renderCatalogEditor() {
  const modal = $('#catalogEditorModal');
  const box = $('#catalogModalBox');
  if (!modal || !box) return;
  if (!state.editing) {
    modal.classList.add('hidden');
    box.innerHTML = '';
    document.body.style.overflow = '';
    return;
  }
  
  const entity = (state.editing.kind === 'insumo' ? state.db.insumos : state.db.products).find(x => x.id === state.editing.id);
  if (!entity) {
    closeCatalogEditorModal();
    return;
  }

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  
  if (state.editing.kind === 'insumo') {
    const usingProducts = state.db.products.filter(p => p.recipe.some(r => r.insumoId === entity.id));
    
    box.innerHTML = `
      <div class="modal-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 id="catalogModalTitle" style="margin:0; font-size:17px; font-weight:800; color:var(--text);">Editar Insumo: ${entity.name}</h3>
            <span class="badge badge-teal">Insumo</span>
          </div>
          <p class="hint" style="margin:3px 0 0 0; font-size:12px;">Modifica el costo, unidad y qué productos descuentan este insumo del inventario.</p>
        </div>
        <button type="button" class="modal-close-btn" id="closeCatalogModalBtn" title="Cerrar ventana (Esc)">&times;</button>
      </div>

      <form id="editInsumoForm" class="form inline-insumo" style="display:flex; flex-direction:column; flex:1; min-height:0; margin:0;">
        <div class="modal-body">
          <div class="catalog-inputs-row-responsive">
            <label>
              <span>Nombre del Insumo</span>
              <input name="name" list="editInsumoOptions" value="${entity.name}" required>
              <datalist id="editInsumoOptions">${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.name}"></option>`).join('')}</datalist>
            </label>
            <label>
              <span>Unidad de Medida</span>
              <input name="unit" value="${entity.unit}" required>
            </label>
            <label>
              <span>Costo COP ($)</span>
              <input name="price" type="number" min="0" value="${entity.price}" required>
            </label>
          </div>
          
          <div class="catalog-editor-stack">
            <!-- Recuadro 1 (Arriba): Recetas que usan este insumo - crece verticalmente -->
            <div class="catalog-editor-section-box">
              <div class="section-header">
                <h4>
                  <span>📋 Recetas y Productos que usan este insumo</span>
                  <span class="badge badge-info" id="usingProductsCount">${usingProducts.length} recetas</span>
                </h4>
                <span class="section-desc">Indica la cantidad que se descuenta del inventario por cada unidad vendida de estos productos</span>
              </div>
              
              <div id="insumoRecipesList" class="editor-items-container">
                ${usingProducts.length ? usingProducts.map(p => {
                  const r = p.recipe.find(x => x.insumoId === entity.id);
                  return `
                    <div class="insumo-recipe-line editor-item-row" data-pid="${p.id}">
                      <div class="item-title">
                        <b>${p.name}</b>
                        <small style="color:var(--muted); margin-left:6px;">(${p.category || 'Producto'})</small>
                      </div>
                      <div class="recipe-line-controls item-ctrls">
                        <span style="font-size:12px; font-weight:600; color:#475569;">Descuenta:</span>
                        <input type="number" class="quantity-input" min="0.01" step="0.01" value="${r.quantity}" required style="width:80px; text-align:center;">
                        <span style="font-size:12px; color:var(--muted);">${entity.unit}</span>
                        <button type="button" class="btn danger-sm remove-insumo-from-recipe">Quitar</button>
                      </div>
                    </div>
                  `;
                }).join('') : '<p class="hint" style="text-align:center; padding:16px;">Ningún producto tiene vinculado este insumo todavía. Usa el buscador de abajo para agregarlo.</p>'}
              </div>
            </div>

            <!-- Recuadro 2 (Abajo): Buscar y añadir a receta - ancho completo -->
            <div class="catalog-editor-section-box">
              <div class="section-header">
                <h4>
                  <span>🔍 Buscar y añadir a producto o receta</span>
                </h4>
                <span class="section-desc">Escribe el nombre del producto para agregarlo a la lista superior</span>
              </div>
              <input type="text" id="productSearchInput" placeholder="Escribe el nombre del producto..." autocomplete="off" style="width:100%; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:13.5px; margin-bottom:8px; box-sizing:border-box;">
              <div id="availableProductsList" class="editor-search-results"></div>
            </div>
          </div>
        </div>

        <div class="modal-footer modal-footer-horizontal">
          <button type="submit" class="btn primary btn-modal-action">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Guardar
          </button>
          <button type="button" id="cancelEditBtn" class="btn outline btn-modal-action">Cancelar</button>
          <button type="button" id="deleteEdit" class="btn danger-sm btn-modal-action">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Eliminar
          </button>
        </div>
      </form>
    `;
    $('#editInsumoForm').onsubmit = saveEditedInsumo;
    bindEditInsumoProducts();
  } else {
    box.innerHTML = `
      <div class="modal-header">
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 id="catalogModalTitle" style="margin:0; font-size:17px; font-weight:800; color:var(--text);">Editar Producto y Receta: ${entity.name}</h3>
            <span class="badge badge-teal">Producto</span>
          </div>
          <p class="hint" style="margin:3px 0 0 0; font-size:12px;">Ajusta el precio, categoría y la lista de insumos que componen la receta de este producto.</p>
        </div>
        <button type="button" class="modal-close-btn" id="closeCatalogModalBtn" title="Cerrar ventana (Esc)">&times;</button>
      </div>

      <datalist id="allInsumosList">
        ${state.db.insumos.filter(i => i.active !== false).map(i => `<option value="${i.name}"></option>`).join('')}
      </datalist>

      <form id="editProductForm" class="form" style="display:flex; flex-direction:column; flex:1; min-height:0; margin:0;">
        <div class="modal-body">
          <div class="catalog-inputs-row-responsive">
            <label>
              <span>Nombre del Producto</span>
              <input name="name" list="editProductOptions" value="${entity.name}" required>
              <datalist id="editProductOptions">${state.db.products.map(p => `<option value="${p.name}"></option>`).join('')}</datalist>
            </label>
            <label>
              <span>Precio de Venta COP ($)</span>
              <input name="price" type="number" min="0" value="${entity.price}" required>
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
          </div>
          
          <label class="sync-toggle" style="margin:10px 0 4px 0;">
            <input name="directSale" type="checkbox" ${entity.directSale ? 'checked' : ''}>
            Venta directa: no descuenta insumos de inventario
          </label>
          
          <div class="catalog-editor-stack">
            <!-- Recuadro 1 (Arriba): Ingredientes actuales - crece verticalmente -->
            <div class="catalog-editor-section-box">
              <div class="section-header">
                <h4>
                  <span>📋 Ingredientes de la Receta</span>
                  <span class="badge badge-info" id="recipeItemsCount">${entity.recipe.length} insumos</span>
                </h4>
                <span class="section-desc">Insumos que se descontarán automáticamente por cada unidad vendida</span>
              </div>
              
              <div id="editRecipeLines" class="editor-items-container">
                ${recipeLinesHtml(entity.recipe)}
              </div>
            </div>

            <!-- Recuadro 2 (Abajo): Buscar y añadir insumo - ancho completo -->
            <div class="catalog-editor-section-box">
              <div class="section-header">
                <h4>
                  <span>🔍 Buscar y añadir insumo a la receta</span>
                </h4>
                <span class="section-desc">Escribe el nombre del insumo para agregarlo a los ingredientes</span>
              </div>
              <input type="text" id="insumoSearchInput" placeholder="Escribe el nombre del insumo..." autocomplete="off" style="width:100%; padding:9px 12px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:13.5px; margin-bottom:8px; box-sizing:border-box;">
              <div id="availableInsumosList" class="editor-search-results"></div>
            </div>
          </div>
        </div>

        <div class="modal-footer modal-footer-horizontal">
          <button type="submit" class="btn primary btn-modal-action">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Guardar
          </button>
          <button type="button" id="cancelEditBtn" class="btn outline btn-modal-action">Cancelar</button>
          <button type="button" id="deleteEdit" class="btn danger-sm btn-modal-action">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:4px;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Eliminar
          </button>
        </div>
      </form>
    `;
    bindEditRecipe();
    $('#editProductForm').onsubmit = saveEditedProduct;
  }
  
  const closeBtn = $('#closeCatalogModalBtn');
  if (closeBtn) closeBtn.onclick = closeCatalogEditorModal;
  const cancelBtn = $('#cancelEditBtn');
  if (cancelBtn) cancelBtn.onclick = closeCatalogEditorModal;
  const deleteBtn = $('#deleteEdit');
  if (deleteBtn) deleteBtn.onclick = deleteEdited;
}

function recipeLinesHtml(recipe) {
  if (!recipe || recipe.length === 0) {
    return '<p class="hint" style="text-align:center; padding:16px;">Este producto no tiene ingredientes aún. Usa el buscador de abajo para agregarlos.</p>';
  }
  return recipe.map(r => {
    const insumo = state.db.insumos.find(i => i.id === r.insumoId);
    if (!insumo) return '';
    return `
    <div class="recipe-line editor-item-row" data-id="${insumo.id}">
      <div class="item-title">
        <b>${insumo.name}</b>
        <small style="color:var(--muted); margin-left:4px;">(${insumo.unit})</small>
      </div>
      <div class="recipe-line-controls item-ctrls">
        <span style="font-size:12px; font-weight:600; color:#475569;">Descuenta:</span>
        <input type="number" class="quantity-input" min="0.01" step="0.01" value="${r.quantity}" required style="width:80px; text-align:center;">
        <span style="font-size:12px; color:var(--muted);">${insumo.unit}</span>
        <button type="button" class="btn danger-sm removeIngredient">Quitar</button>
      </div>
    </div>
  `}).join('');
}

function bindEditRecipe() {
  const box = $('#editRecipeLines');
  const searchInput = $('#insumoSearchInput');
  const listContainer = $('#availableInsumosList');
  if (!box || !listContainer) return;

  const updateList = () => {
    const term = (searchInput.value || '').toLowerCase().trim();
    const existingIds = [...box.querySelectorAll('.recipe-line')].map(x => x.dataset.id);
    const available = state.db.insumos.filter(i => i.active !== false && !existingIds.includes(i.id) && i.name.toLowerCase().includes(term));
    
    if (available.length === 0) {
      listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:12px; text-align:center;">No hay más insumos disponibles para añadir.</div>';
      return;
    }

    listContainer.innerHTML = available.map(i => `
      <div class="available-item editor-item-row">
        <div class="item-title">
          <b>${i.name}</b>
          <small style="color:var(--muted); margin-left:4px;">(${i.unit})</small>
        </div>
        <button type="button" class="btn outline addAvailableInsumo" data-id="${i.id}" style="padding:6px 12px; font-size:12.5px; flex-shrink:0;">+ Añadir</button>
      </div>
    `).join('');
    
    listContainer.querySelectorAll('.addAvailableInsumo').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const emptyMsg = box.querySelector('p.hint');
        if (emptyMsg) emptyMsg.remove();

        box.insertAdjacentHTML('afterbegin', recipeLinesHtml([{ insumoId: id, quantity: 1 }]));
        bindRemoves();
        updateList();
        const counter = $('#recipeItemsCount');
        if (counter) {
          const count = box.querySelectorAll('.recipe-line').length;
          counter.textContent = `${count} insumos`;
        }
        searchInput.focus({ preventScroll: true });
      };
    });
  };

  const bindRemoves = () => {
    box.querySelectorAll('.removeIngredient').forEach(b => b.onclick = () => {
      b.closest('.recipe-line').remove();
      if (box.querySelectorAll('.recipe-line').length === 0) {
        box.innerHTML = '<p class="hint" style="text-align:center; padding:16px;">Este producto no tiene ingredientes aún. Usa el buscador de abajo para agregarlos.</p>';
      }
      updateList();
      const counter = $('#recipeItemsCount');
      if (counter) {
        const count = box.querySelectorAll('.recipe-line').length;
        counter.textContent = `${count} insumos`;
      }
    });
  };

  searchInput.oninput = updateList;
  bindRemoves();
  updateList();
}

function bindEditInsumoProducts() {
  const box = $('#insumoRecipesList');
  const searchInput = $('#productSearchInput');
  const listContainer = $('#availableProductsList');
  if (!box || !listContainer) return;

  const currentInsumoUnit = (state.editing && state.editing.kind === 'insumo')
    ? (state.db.insumos.find(i => i.id === state.editing.id)?.unit || '')
    : '';

  const updateList = () => {
    const term = (searchInput.value || '').toLowerCase().trim();
    const existingIds = [...box.querySelectorAll('.insumo-recipe-line')].map(x => x.dataset.pid);
    const available = state.db.products.filter(p => !existingIds.includes(p.id) && p.name.toLowerCase().includes(term));
    
    if (available.length === 0) {
      listContainer.innerHTML = '<div style="font-size:12px; color:#94a3b8; padding:12px; text-align:center;">No hay más productos para añadir.</div>';
      return;
    }

    listContainer.innerHTML = available.map(p => `
      <div class="available-item editor-item-row">
        <div class="item-title">
          <b>${p.name}</b>
          <small class="badge badge-info" style="margin-left:4px;">${p.category || 'Producto'}</small>
        </div>
        <button type="button" class="btn outline addAvailableProduct" data-pid="${p.id}" data-name="${p.name}" style="padding:6px 12px; font-size:12.5px; flex-shrink:0;">+ Añadir</button>
      </div>
    `).join('');
    
    listContainer.querySelectorAll('.addAvailableProduct').forEach(btn => {
      btn.onclick = () => {
        const pid = btn.dataset.pid;
        const pname = btn.dataset.name;
        // Remove empty state message if present
        const emptyMsg = box.querySelector('p.hint');
        if (emptyMsg) emptyMsg.remove();

        box.insertAdjacentHTML('afterbegin', `
          <div class="insumo-recipe-line editor-item-row" data-pid="${pid}">
            <div class="item-title">
              <b>${pname}</b>
            </div>
            <div class="recipe-line-controls item-ctrls">
              <span style="font-size:12px; font-weight:600; color:#475569;">Descuenta:</span>
              <input type="number" class="quantity-input" min="0.01" step="0.01" value="1" required style="width:80px; text-align:center;">
              <span style="font-size:12px; color:var(--muted);">${currentInsumoUnit}</span>
              <button type="button" class="btn danger-sm remove-insumo-from-recipe">Quitar</button>
            </div>
          </div>
        `);
        bindRemoves();
        updateList();
        const counter = $('#usingProductsCount');
        if (counter) {
          const count = box.querySelectorAll('.insumo-recipe-line').length;
          counter.textContent = `${count} recetas`;
        }
        searchInput.focus({ preventScroll: true });
      };
    });
  };

  const bindRemoves = () => {
    box.querySelectorAll('.remove-insumo-from-recipe').forEach(b => b.onclick = () => {
      b.closest('.insumo-recipe-line').remove();
      if (box.querySelectorAll('.insumo-recipe-line').length === 0) {
        box.innerHTML = '<p class="hint" style="text-align:center; padding:16px;">Ningún producto tiene vinculado este insumo todavía. Usa el buscador de abajo para agregarlo.</p>';
      }
      updateList();
      const counter = $('#usingProductsCount');
      if (counter) {
        const count = box.querySelectorAll('.insumo-recipe-line').length;
        counter.textContent = `${count} recetas`;
      }
    });
  };

  searchInput.oninput = updateList;
  bindRemoves();
  updateList();
}

async function saveEditedInsumo(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  const date = $('#date')?.value || today();
  
  const currentProductIds = [...$('#insumoRecipesList').querySelectorAll('.insumo-recipe-line')].map(el => ({
    id: el.dataset.pid,
    qty: Number(el.querySelector('.quantity-input').value)
  }));
  
  const productsToUpdate = [];
  state.db.products.forEach(p => {
    const hasNow = currentProductIds.find(c => c.id === p.id);
    const hadBefore = p.recipe.find(r => r.insumoId === state.editing.id);
    
    let changed = false;
    let newRecipe = [...p.recipe];
    
    if (hasNow && hadBefore) {
      if (hasNow.qty !== hadBefore.quantity) {
        newRecipe = newRecipe.map(r => r.insumoId === state.editing.id ? { ...r, quantity: hasNow.qty } : r);
        changed = true;
      }
    } else if (hasNow && !hadBefore) {
      newRecipe.push({ insumoId: state.editing.id, quantity: hasNow.qty });
      changed = true;
    } else if (!hasNow && hadBefore) {
      newRecipe = newRecipe.filter(r => r.insumoId !== state.editing.id);
      changed = true;
    }
    
    if (changed) {
      productsToUpdate.push({ ...p, recipe: newRecipe });
    }
  });
  
  for (const p of productsToUpdate) {
    await api(`/api/catalog/product/${p.id}?date=${date}`, 'PUT', p);
  }
  
  const x = await api(`/api/catalog/insumo/${state.editing.id}?date=${date}`, 'PUT', Object.fromEntries(f));
  state.db.insumos = x.insumos;
  state.db.products = x.products;
  if (x.report) state.report = x.report;
  closeCatalogEditorModal();
  render();
  toast('Insumo y recetas actualizados');
}

async function saveEditedProduct(e) {
  e.preventDefault();
  const date = $('#date')?.value || today();
  const f = new FormData(e.target);
  const recipe = [...$('#editRecipeLines').querySelectorAll('.recipe-line')].map(x => ({
    insumoId: x.dataset.id,
    quantity: Number(x.querySelector('.quantity-input').value)
  })).filter(r => r.insumoId);
  const x = await api(`/api/catalog/product/${state.editing.id}?date=${date}`, 'PUT', {
    name: f.get('name'),
    category: f.get('category'),
    subgroup: f.get('subgroup'),
    price: Number(f.get('price')),
    recipe,
    directSale: f.get('directSale') === 'on'
  });
  state.db.insumos = x.insumos;
  state.db.products = x.products;
  if (x.report) state.report = x.report;
  closeCatalogEditorModal();
  render();
  toast('Producto y receta actualizados');
}

async function deleteEdited() {
  const label = state.editing.kind === 'insumo' ? 'insumo' : 'producto';
  const confirmed = await showActionDialog({
    title: `Eliminar ${label}`,
    message: `¿Estás seguro de eliminar este ${label} del catálogo?`,
    confirmText: 'Eliminar',
    isDanger: true
  });
  if (!confirmed) return;
  try {
    const date = $('#date')?.value || today();
    const x = await api(`/api/catalog/${state.editing.kind}/${state.editing.id}?date=${date}`, 'DELETE');
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    if (x.report) state.report = x.report;
    closeCatalogEditorModal();
    render();
    toast(`${label[0].toUpperCase() + label.slice(1)} eliminado correctamente`);
  } catch (e) {
    toast(e.message);
  }
}

async function deleteExpense(expenseId) {
  const confirmed = await showActionDialog({
    title: 'Eliminar Gasto',
    message: '¿Estás seguro de eliminar este gasto de caja?',
    confirmText: 'Eliminar Gasto',
    isDanger: true
  });
  if (!confirmed) return;
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
  const confirmed = await showActionDialog({
    title: 'Eliminar Movimiento',
    message: '¿Estás seguro de eliminar este movimiento de inventario?',
    confirmText: 'Eliminar Movimiento',
    isDanger: true
  });
  if (!confirmed) return;
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
    const physical = { ...(state.day?.physical || {}) };
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
    const date = $('#date')?.value || today();
    const x = await api(`/api/catalog?date=${date}`, 'POST', { kind: 'insumo', ...Object.fromEntries(new FormData(e.target)) });
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    if (x.report) state.report = x.report;
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
    const date = $('#date')?.value || today();
    const f = new FormData(e.target);
    const recipe = [...$('#recipeLines').querySelectorAll('.recipe-line')].map(x => ({
      insumoId: x.querySelector('select').value,
      quantity: Number(x.querySelector('input').value)
    }));
    const x = await api(`/api/catalog?date=${date}`, 'POST', {
      kind: 'product',
      name: f.get('name'),
      category: f.get('category'),
      subgroup: f.get('subgroup'),
      price: Number(f.get('price')),
      directSale: f.get('directSale') === 'on',
      recipe
    });
    state.db.insumos = x.insumos;
    state.db.products = x.products;
    if (x.report) state.report = x.report;
    e.target.reset();
    $('#recipeLines').innerHTML = '';
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

  // Toggle View Customization Modes
  const toggleInvBtn = $('#toggleEditInventoryBtn');
  if (toggleInvBtn) {
    toggleInvBtn.onclick = () => {
      editViewMode.inventory = !editViewMode.inventory;
      renderInventoryForm();
    };
  }

  const toggleCatBtn = $('#toggleEditCategoryBtn');
  if (toggleCatBtn) {
    toggleCatBtn.onclick = () => {
      editViewMode.category = !editViewMode.category;
      renderCategoryBreakdown();
    };
  }

  const collapseAllBtn = $('#toggleCollapseAllCatsBtn');
  if (collapseAllBtn) {
    collapseAllBtn.onclick = () => {
      toggleAllCategoriesAndSubgroups();
    };
  }

  const toggleAuditBtn = $('#toggleEditAuditBtn');
  if (toggleAuditBtn) {
    toggleAuditBtn.onclick = () => {
      editViewMode.audit = !editViewMode.audit;
      renderAuditTable();
    };
  }

  // Cloud Sync Handler
  const syncBtn = $('#btnCloudSync');
  if (syncBtn) {
    syncBtn.onclick = async () => {
      const originalHtml = syncBtn.innerHTML;
      try {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          <span>Sincronizando...</span>
        `;
        const date = $('#date').value || today();
        const res = await api(`/api/cloud-restore?date=${date}`, 'POST');
        if (res.success) {
          state.db = res.db;
          state.day = res.day;
          state.report = res.report;
          render();
          toast(`☁️ ${res.message}`);
        } else {
          toast(res.error || 'No se pudo sincronizar');
        }
      } catch (err) {
        toast(`Error de sincronización: ${err.message}`);
      } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = originalHtml;
      }
    };
  }

  // Backup Export/Import Handlers
  const exportBackupBtn = $('#btnExportBackup');
  if (exportBackupBtn) {
    exportBackupBtn.onclick = () => {
      window.location.href = '/api/backup-export';
      toast('Descargando respaldo completo de la base de datos...');
    };
  }

  const importBackupInput = $('#inputImportBackup');
  if (importBackupInput) {
    importBackupInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('⚠️ ¿Estás seguro de restaurar este respaldo? Los datos actuales serán reemplazados por el contenido del archivo JSON.')) {
        e.target.value = '';
        return;
      }
      try {
        const text = await file.text();
        const jsonObj = JSON.parse(text);
        const res = await api('/api/backup-import', 'POST', jsonObj);
        if (res.success) {
          toast(res.message);
          setTimeout(() => window.location.reload(), 1500);
        } else {
          toast(res.error || 'Error al restaurar el respaldo');
        }
      } catch (err) {
        toast(`Error al procesar el archivo JSON: ${err.message}`);
      } finally {
        e.target.value = '';
      }
    };
  }

  // Subgroup Products Manager Modal
  initSubgroupProductsModal();

  // Catalog Editor Modal (Ventana Emergente)
  initCatalogEditorModal();
}

// Initializer
$('#date').value = getLocalDateStr();
bind();
load().catch(e => toast(e.message));
