/**
 * SmartPark 3D - Sincronización en Tiempo Real Multidispositivo
 * Se comunica con el servidor central (server.js) vía REST y Polling activo
 */

let appState = null;
let currentLevelFilter = 'all';
let activeInspectorTab = 'heap';

// Elementos DOM
const elHudTime = document.getElementById('hud-sim-time');
const elHudRevenue = document.getElementById('hud-revenue');
const elHudOccupancy = document.getElementById('hud-occupancy');
const elHudWaitlist = document.getElementById('hud-waitlist');
const elFloorsView = document.getElementById('parking-floors-view');
const elWaitlistContainer = document.getElementById('waitlist-container');
const elReservationsContainer = document.getElementById('reservations-container');
const elQueueBadge = document.getElementById('queue-count-badge');
const elResBadge = document.getElementById('reservations-count-badge');
const elPredBadge = document.getElementById('pred-risk-badge');
const elPredBar = document.getElementById('pred-bar');
const elPredDelta = document.getElementById('pred-delta-rate');
const elInspectorContent = document.getElementById('inspector-content');

// Modal Elements
const elModal = document.getElementById('slot-modal');
const elModalClose = document.getElementById('modal-close-btn');
const elModalTitle = document.getElementById('modal-slot-title');
const elModalStatus = document.getElementById('modal-slot-status');
const elModalBody = document.getElementById('modal-slot-body');
const elModalActions = document.getElementById('modal-actions');

// Helpers de conexión
async function fetchState() {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      appState = await res.json();
      renderUI();
    }
  } catch (err) {
    console.error('Error sincronizando estado:', err);
  }
}

async function postAction(action, payload = {}) {
  try {
    const res = await fetch(`/api/action/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.state) {
      appState = data.state;
      renderUI();
    }
    return data;
  } catch (err) {
    console.error(`Error al ejecutar accion ${action}:`, err);
    return { success: false, error: err.message };
  }
}

function renderUI() {
  if (!appState) return;

  // 1. HUD
  elHudTime.textContent = appState.simTimeFormatted;
  elHudRevenue.textContent = `S/ ${appState.totalRevenue.toFixed(2)}`;
  const occ = appState.occupiedCount;
  const occPct = Math.round((occ / 60) * 100);
  elHudOccupancy.textContent = `${occ}/60 (${occPct}%)`;
  elHudWaitlist.textContent = appState.waitQueue.length;

  // 2. Predicción de Saturación
  const pred = appState.saturation;
  elPredBadge.textContent = `${pred.level} (${pred.minutesToFull})`;
  elPredBadge.className = `px-2 py-0.5 text-[11px] font-bold rounded-full font-mono bg-${pred.color}-500/20 text-${pred.color}-400 border border-${pred.color}-500/30`;
  elPredBar.style.width = `${Math.min(100, Math.max(5, pred.percentage))}%`;
  elPredBar.className = `h-full rounded-full transition-all duration-500 bg-${pred.color}-500`;
  elPredDelta.textContent = `${pred.netFlowRate >= 0 ? '+' : ''}${pred.netFlowRate} autos/min`;

  // 3. Render Parking Floors
  renderFloors();

  // 4. Render Waitlist & Reservations
  renderWaitQueue();
  renderReservations();

  // 5. Inspector Tabs
  renderInspector();

  // 6. Sustentation Benchmark Table
  renderMetricsTable();

  // Actualizar botones de política según estado central
  const polFF = document.getElementById('pol-first-fit');
  const polMC = document.getElementById('pol-min-cost');
  if (appState.activePolicy === 'first-fit') {
    polFF.className = 'py-2 px-3 text-xs font-semibold rounded-lg transition bg-indigo-600 text-white shadow flex items-center justify-center gap-1.5';
    polMC.className = 'py-2 px-3 text-xs font-medium rounded-lg transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5';
  } else {
    polMC.className = 'py-2 px-3 text-xs font-semibold rounded-lg transition bg-indigo-600 text-white shadow flex items-center justify-center gap-1.5';
    polFF.className = 'py-2 px-3 text-xs font-medium rounded-lg transition text-slate-400 hover:text-white flex items-center justify-center gap-1.5';
  }
}

function renderFloors() {
  elFloorsView.innerHTML = '';
  const levelsToRender = currentLevelFilter === 'all' ? [1, 2, 3] : [parseInt(currentLevelFilter, 10)];

  levelsToRender.forEach(lvlNum => {
    const levelSpots = appState.matrix[lvlNum - 1];
    const occupiedInLevel = levelSpots.filter(s => s.state === 'occupied').length;

    const floorContainer = document.createElement('div');
    floorContainer.className = 'bg-slate-950/70 border border-slate-800/90 rounded-2xl p-4 shadow-sm';
    
    floorContainer.innerHTML = `
      <div class="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <span class="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold font-mono flex items-center justify-center text-xs">
            L${lvlNum}
          </span>
          <span class="text-xs font-semibold text-slate-200">
            ${lvlNum === 1 ? 'Nivel 1 (Planta Baja - Acceso Directo)' : lvlNum === 2 ? 'Nivel 2 (Piso Intermedio)' : 'Nivel 3 (Piso Superior)'}
          </span>
        </div>
        <div class="text-[11px] font-mono text-slate-400">
          Ocupación: <b class="text-slate-200">${occupiedInLevel}/20</b> (${Math.round((occupiedInLevel/20)*100)}%)
        </div>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-5 sm:grid-cols-10 gap-2';

    levelSpots.forEach(spot => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `slot-card relative p-2 rounded-xl border flex flex-col items-center justify-between text-left h-24 text-[10px] cursor-pointer transition ${getSlotStyleClasses(spot)}`;
      
      let icon = 'fa-square-parking';
      let title = 'Libre';
      let badge = '';

      if (spot.state === 'occupied') {
        icon = getVehicleIcon(spot.vehicle ? spot.vehicle.type : 'Auto');
        title = spot.vehicle ? spot.vehicle.plate : 'Ocupado';
      } else if (spot.state === 'reserved') {
        icon = 'fa-bookmark';
        title = spot.reservation ? spot.reservation.plate : 'Reservado';
      } else if (spot.state === 'blocked') {
        icon = 'fa-ban';
        title = 'Bloqueado';
      } else {
        if (spot.specialType === 'discapacitado') badge = '<i class="fa-solid fa-wheelchair text-purple-400" title="PMR"></i>';
        if (spot.specialType === 'electrico') badge = '<i class="fa-solid fa-bolt text-teal-400" title="EV"></i>';
      }

      card.innerHTML = `
        <div class="w-full flex justify-between items-center font-mono">
          <span class="font-bold text-[10px] text-slate-300">${spot.id}</span>
          ${badge}
        </div>
        <div class="text-center my-auto">
          <i class="fa-solid ${icon} text-lg mb-0.5"></i>
          <p class="font-mono font-semibold truncate max-w-[55px] text-[10px]">${title}</p>
        </div>
        <div class="w-full text-right text-[9px] font-mono text-slate-400">
          ${spot.distance}m
        </div>
      `;

      card.onclick = () => openSlotModal(spot);
      grid.appendChild(card);
    });

    floorContainer.appendChild(grid);
    elFloorsView.appendChild(floorContainer);
  });
}

function getSlotStyleClasses(spot) {
  if (spot.state === 'occupied') return 'bg-sky-950/40 border-sky-500/60 text-sky-300 hover:border-sky-400';
  if (spot.state === 'reserved') return 'bg-amber-950/40 border-amber-500/60 text-amber-300 hover:border-amber-400';
  if (spot.state === 'blocked') return 'bg-rose-950/40 border-rose-500/60 text-rose-300 hover:border-rose-400 opacity-80';
  if (spot.specialType === 'discapacitado') return 'bg-purple-950/20 border-purple-500/40 text-purple-300 hover:border-purple-300';
  if (spot.specialType === 'electrico') return 'bg-teal-950/20 border-teal-500/40 text-teal-300 hover:border-teal-300';
  return 'bg-slate-900 border-slate-700/60 text-slate-400 hover:border-indigo-400 hover:text-white';
}

function getVehicleIcon(type) {
  switch (type) {
    case 'Moto': return 'fa-motorcycle';
    case 'Camioneta': return 'fa-truck-pickup';
    case 'Electrico': return 'fa-charging-station';
    case 'Discapacitado': return 'fa-wheelchair';
    default: return 'fa-car';
  }
}

function renderWaitQueue() {
  const items = appState.waitQueue || [];
  elQueueBadge.textContent = items.length;
  if (items.length === 0) {
    elWaitlistContainer.innerHTML = '<p class="text-slate-600 italic text-[11px] p-2 text-center">No hay vehículos en espera</p>';
    return;
  }
  elWaitlistContainer.innerHTML = items.map((c, i) => `
    <div class="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
      <div class="flex items-center gap-1.5">
        <span class="text-slate-500 font-bold">#${i+1}</span>
        <span class="font-bold text-slate-200">${c.plate}</span>
        <span class="text-[10px] text-slate-400">(${c.type})</span>
      </div>
      <span class="text-[9px] bg-rose-500/20 text-rose-400 px-1 rounded">${c.durationMinutes}m</span>
    </div>
  `).join('');
}

function renderReservations() {
  const items = appState.reservations || [];
  elResBadge.textContent = items.length;
  if (items.length === 0) {
    elReservationsContainer.innerHTML = '<p class="text-slate-600 italic text-[11px] p-2 text-center">Sin reservas activas</p>';
    return;
  }
  elReservationsContainer.innerHTML = items.map(r => `
    <div class="flex items-center justify-between p-1.5 rounded bg-slate-900 border border-slate-800">
      <div>
        <div class="font-bold text-amber-300">${r.code} - ${r.plate}</div>
        <div class="text-[9px] text-slate-400">Espacio ${r.slotId}</div>
      </div>
      <span class="text-[9px] font-mono bg-amber-500/20 text-amber-400 px-1 rounded">Exp: ${Math.max(0, r.expiresAt - appState.simTimeMinutes)}m</span>
    </div>
  `).join('');
}

function renderInspector() {
  if (activeInspectorTab === 'heap') {
    const heapItems = appState.heapTop || [];
    if (heapItems.length === 0) {
      elInspectorContent.innerHTML = '<span class="text-slate-500 italic">Heap vacío.</span>';
      return;
    }
    elInspectorContent.innerHTML = `
      <div class="text-indigo-400 font-semibold mb-1">Heap Top 5 (Menor Costo en Servidor):</div>
      ${heapItems.map((item, idx) => `
        <div class="flex justify-between py-0.5 border-b border-slate-900">
          <span>#${idx+1} [Root] <b>${item.slot.id}</b> (Nivel ${item.slot.level})</span>
          <span class="text-emerald-400 font-bold">Costo: ${item.cost.toFixed(1)} (Dist: ${item.slot.distance}m)</span>
        </div>
      `).join('')}
    `;
  } else if (activeInspectorTab === 'stack') {
    const stackItems = appState.undoStack || [];
    if (stackItems.length === 0) {
      elInspectorContent.innerHTML = '<span class="text-slate-500 italic">Pila vacía.</span>';
      return;
    }
    elInspectorContent.innerHTML = `
      <div class="text-emerald-400 font-semibold mb-1">Pila LIFO Sincronizada (Últimos ${stackItems.length}):</div>
      ${stackItems.map((m) => `
        <div class="py-0.5 border-b border-slate-900 text-slate-300">
          <span class="text-indigo-400 font-bold">[${m.action.toUpperCase()}]</span> en ${m.slotId} ${m.vehicle ? `(${m.vehicle.plate})` : ''}
        </div>
      `).join('')}
    `;
  } else {
    const logs = appState.logs || [];
    elInspectorContent.innerHTML = logs.map(l => `
      <div class="py-0.5 border-b border-slate-900">
        <span class="text-slate-500">[${l.time}]</span> <span class="${l.type === 'warning' ? 'text-rose-400' : 'text-slate-300'}">${l.text}</span>
      </div>
    `).join('');
  }
}

function renderMetricsTable() {
  const m = appState.metrics;
  document.getElementById('stat-ff-count').textContent = m.ff.assignedCount;
  document.getElementById('stat-mc-count').textContent = m.mc.assignedCount;
  
  const ffAvg = m.ff.assignedCount > 0 ? (m.ff.totalDist / m.ff.assignedCount).toFixed(1) : (m.ff.avgDist || 0);
  const mcAvg = m.mc.assignedCount > 0 ? (m.mc.totalDist / m.mc.assignedCount).toFixed(1) : (m.mc.avgDist || 0);

  document.getElementById('stat-ff-dist').textContent = `${ffAvg} m`;
  document.getElementById('stat-mc-dist').textContent = `${mcAvg} m`;

  const ffTime = m.ff.assignedCount > 0 ? (m.ff.totalSearchTime / m.ff.assignedCount).toFixed(1) : (m.ff.avgTime || 0);
  const mcTime = m.mc.assignedCount > 0 ? (m.mc.totalSearchTime / m.mc.assignedCount).toFixed(1) : (m.mc.avgTime || 0);

  document.getElementById('stat-ff-time').textContent = `${ffTime} s`;
  document.getElementById('stat-mc-time').textContent = `${mcTime} s`;

  document.getElementById('stat-ff-peak').textContent = `${m.ff.peakOccupancy}%`;
  document.getElementById('stat-mc-peak').textContent = `${m.mc.peakOccupancy}%`;

  const impEl = document.getElementById('stat-improvement');
  if (parseFloat(ffAvg) > 0 && parseFloat(mcAvg) > 0) {
    const diff = ((parseFloat(ffAvg) - parseFloat(mcAvg)) / parseFloat(ffAvg)) * 100;
    if (diff > 0) {
      impEl.innerHTML = `✨ <b>Menor Costo (Heap)</b> reduce la distancia de búsqueda en un <b class="text-emerald-300">${diff.toFixed(1)}%</b>`;
      impEl.className = 'py-2 font-bold text-center text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 rounded';
    } else {
      impEl.innerHTML = `Distancias equiparables en la carga actual.`;
    }
  }
}

// Modal Interactivo
function openSlotModal(spot) {
  elModalTitle.textContent = `Espacio ${spot.id} (Nivel ${spot.level})`;
  elModalStatus.textContent = `Estado: ${spot.state.toUpperCase()}`;
  
  let details = `
    <div><b>Distancia a entrada:</b> ${spot.distance} metros</div>
    <div><b>Tipo de espacio:</b> ${spot.specialType.toUpperCase()}</div>
  `;

  elModalActions.innerHTML = '';

  if (spot.state === 'occupied' && spot.vehicle) {
    const v = spot.vehicle;
    const durSoFar = Math.max(5, appState.simTimeMinutes - v.entryTime);
    const estCost = Math.max(2.0, (durSoFar / 60) * v.tariffRate).toFixed(2);
    details += `
      <div class="pt-2 border-t border-slate-800 text-sky-400">
        <div><b>Placa:</b> ${v.plate}</div>
        <div><b>Tipo:</b> ${v.type} (S/ ${v.tariffRate}/h)</div>
        <div><b>Tiempo en cochera:</b> ${durSoFar} min</div>
        <div><b>Monto acumulado:</b> S/ ${estCost}</div>
      </div>
    `;

    const btnExit = document.createElement('button');
    btnExit.className = 'w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition';
    btnExit.innerHTML = '<i class="fa-solid fa-receipt"></i> Cobrar y Emitir Ticket (POS58)';
    btnExit.onclick = async () => {
      btnExit.disabled = true;
      btnExit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
      await postAction('exit', { level: spot.level, spotIndex: spot.spotIndex });
      elModal.classList.add('hidden');
    };
    elModalActions.appendChild(btnExit);

  } else if (spot.state === 'reserved' && spot.reservation) {
    const r = spot.reservation;
    details += `
      <div class="pt-2 border-t border-slate-800 text-amber-400">
        <div><b>Código Reserva:</b> ${r.code}</div>
        <div><b>Placa:</b> ${r.plate}</div>
        <div><b>Expira en:</b> ${Math.max(0, r.expiresAt - appState.simTimeMinutes)} min</div>
      </div>
    `;

    const btnClaim = document.createElement('button');
    btnClaim.className = 'flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1 transition';
    btnClaim.innerHTML = '<i class="fa-solid fa-key"></i> Ocupar por Reserva';
    btnClaim.onclick = async () => {
      await postAction('park', { plate: r.plate, type: 'Auto', duration: 45, reserveCode: r.code });
      elModal.classList.add('hidden');
    };
    elModalActions.appendChild(btnClaim);

  } else if (spot.state === 'blocked') {
    details += `
      <div class="pt-2 border-t border-slate-800 text-rose-400">
        <div><b>Motivo Bloqueo:</b> ${spot.blockReason}</div>
      </div>
    `;
    const btnUnblock = document.createElement('button');
    btnUnblock.className = 'w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition';
    btnUnblock.innerHTML = '<i class="fa-solid fa-unlock"></i> Desbloquear Espacio';
    btnUnblock.onclick = async () => {
      await postAction('block', { level: spot.level, spotIndex: spot.spotIndex });
      elModal.classList.add('hidden');
    };
    elModalActions.appendChild(btnUnblock);

  } else {
    details += `
      <div class="pt-2 border-t border-slate-800 text-emerald-400">
        <div>Espacio disponible para asignación.</div>
      </div>
    `;
    const btnBlock = document.createElement('button');
    btnBlock.className = 'w-full py-2 bg-slate-800 hover:bg-rose-900/60 text-rose-300 border border-slate-700 rounded-xl text-xs font-semibold transition';
    btnBlock.innerHTML = '<i class="fa-solid fa-ban"></i> Bloquear por Mantenimiento';
    btnBlock.onclick = async () => {
      await postAction('block', { level: spot.level, spotIndex: spot.spotIndex, reason: 'Mantenimiento' });
      elModal.classList.add('hidden');
    };
    elModalActions.appendChild(btnBlock);
  }

  elModalBody.innerHTML = details;
  elModal.classList.remove('hidden');
}

// Event Listeners y Formularios
const tabBtnEntry = document.getElementById('tab-btn-entry');
const tabBtnReserve = document.getElementById('tab-btn-reserve');
const tabBtnBlock = document.getElementById('tab-btn-block');
const formEntry = document.getElementById('form-entry');
const formReserve = document.getElementById('form-reserve');
const formBlock = document.getElementById('form-block');

function switchFormTab(activeBtn, activeForm) {
  [tabBtnEntry, tabBtnReserve, tabBtnBlock].forEach(b => {
    b.className = 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-slate-950 text-slate-400 hover:text-slate-200 border border-transparent flex items-center gap-1.5';
  });
  activeBtn.className = 'text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5';
  [formEntry, formReserve, formBlock].forEach(f => f.classList.add('hidden'));
  activeForm.classList.remove('hidden');
}

tabBtnEntry.onclick = () => switchFormTab(tabBtnEntry, formEntry);
tabBtnReserve.onclick = () => switchFormTab(tabBtnReserve, formReserve);
tabBtnBlock.onclick = () => switchFormTab(tabBtnBlock, formBlock);

// Cambio de política
document.getElementById('pol-first-fit').onclick = async () => {
  await postAction('policy', { policy: 'first-fit' });
};
document.getElementById('pol-min-cost').onclick = async () => {
  await postAction('policy', { policy: 'min-cost' });
};

// Formulario de entrada
formEntry.onsubmit = async (e) => {
  e.preventDefault();
  const plate = document.getElementById('entry-plate').value;
  const type = document.getElementById('entry-type').value;
  const duration = parseInt(document.getElementById('entry-duration').value, 10) || 45;
  const reserveCode = document.getElementById('entry-reserve-code').value;

  const res = await postAction('park', { plate, type, duration, reserveCode });
  if (!res.success && !res.queued) alert(res.message);
  document.getElementById('entry-plate').value = '';
  document.getElementById('entry-reserve-code').value = '';
};

// Auto Rápido
document.getElementById('btn-quick-random-car').onclick = async () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randPlate = `${letters[Math.floor(Math.random()*letters.length)]}${letters[Math.floor(Math.random()*letters.length)]}${letters[Math.floor(Math.random()*letters.length)]}-${Math.floor(100 + Math.random()*900)}`;
  const types = ['Auto', 'Camioneta', 'Moto', 'Electrico', 'Discapacitado'];
  const randType = types[Math.floor(Math.random()*types.length)];
  const dur = Math.floor(15 + Math.random() * 90);
  await postAction('park', { plate: randPlate, type: randType, duration: dur });
};

// Generar placa aleatoria en input
document.getElementById('btn-rand-plate').onclick = () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  document.getElementById('entry-plate').value = `${letters[Math.floor(Math.random()*letters.length)]}${letters[Math.floor(Math.random()*letters.length)]}${letters[Math.floor(Math.random()*letters.length)]}-${Math.floor(100 + Math.random()*900)}`;
};

// Formulario Reserva
formReserve.onsubmit = async (e) => {
  e.preventDefault();
  const plate = document.getElementById('reserve-plate').value;
  const level = document.getElementById('reserve-level').value;
  const expiryMin = parseInt(document.getElementById('reserve-expiry-min').value, 10) || 20;

  const res = await postAction('reserve', { plate, level, expiryMin });
  if (!res.success) alert(res.message);
  else alert(`¡Reserva Exitosa!\nCódigo: ${res.reservation.code}\nEspacio: ${res.reservation.slotId}`);
  document.getElementById('reserve-plate').value = '';
};

// Formulario Bloqueo
document.getElementById('btn-apply-block').onclick = async () => {
  const level = parseInt(document.getElementById('block-level').value, 10);
  const spotIndex = parseInt(document.getElementById('block-spot').value, 10);
  const reason = document.getElementById('block-reason').value || 'Mantenimiento';
  const res = await postAction('block', { level, spotIndex, reason });
  if (!res.success) alert(res.message);
};

document.getElementById('btn-remove-block').onclick = async () => {
  const level = parseInt(document.getElementById('block-level').value, 10);
  const spotIndex = parseInt(document.getElementById('block-spot').value, 10);
  const res = await postAction('block', { level, spotIndex });
  if (!res.success) alert(res.message);
};

// Deshacer (Undo)
document.getElementById('tab-btn-undo').onclick = async () => {
  const res = await postAction('undo');
  if (!res.success) alert(res.message);
};

// Avance de tiempo
document.getElementById('btn-advance-time').onclick = async () => {
  await postAction('advance-time', { minutes: 5 });
};

// Imprimir Prueba POS58
const btnPrintTest = document.getElementById('btn-print-test');
if (btnPrintTest) {
  btnPrintTest.onclick = async () => {
    btnPrintTest.disabled = true;
    btnPrintTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Imprimiendo...';
    await postAction('print-test');
    alert('Comprobante enviado a la impresora térmica POS58.');
    btnPrintTest.disabled = false;
    btnPrintTest.innerHTML = '<i class="fa-solid fa-print"></i> Imprimir Prueba';
  };
}

// Prueba Sustentación
document.getElementById('btn-run-sustentation').onclick = async () => {
  if (confirm('¿Ejecutar la prueba oficial de 80 movimientos, 10 reservas y 5 bloqueos?')) {
    const res = await postAction('benchmark');
    if (res.resFF && res.resMC) {
      const diff = (((res.resFF.avgDist - res.resMC.avgDist) / res.resFF.avgDist) * 100).toFixed(1);
      alert(`¡Prueba de Sustentación Completada!\n\n• Primer Espacio Libre (FF):\n   Distancia Promedio: ${res.resFF.avgDist} m\n\n• Menor Costo (Min-Heap):\n   Distancia Promedio: ${res.resMC.avgDist} m\n\n🎯 Reducción de recorrido: ${diff}% con Menor Costo.`);
    }
  }
};

// Reset
document.getElementById('btn-reset-system').onclick = async () => {
  if (confirm('¿Reiniciar todo el estacionamiento sincronizado a su estado inicial?')) {
    await postAction('reset');
  }
};

// Filtro niveles
['all', '1', '2', '3'].forEach(lvl => {
  const btn = document.getElementById(`view-level-${lvl}`);
  if (btn) {
    btn.onclick = () => {
      ['all', '1', '2', '3'].forEach(x => {
        document.getElementById(`view-level-${x}`).className = 'px-3 py-1.5 text-xs font-medium rounded-t-lg text-slate-400 hover:text-white bg-slate-950';
      });
      btn.className = 'px-3 py-1.5 text-xs font-semibold rounded-t-lg bg-indigo-600 text-white';
      currentLevelFilter = lvl;
      renderFloors();
    };
  }
});

// Inspector Tabs
document.getElementById('inspect-tab-heap').onclick = () => {
  activeInspectorTab = 'heap';
  document.getElementById('inspect-tab-heap').className = 'px-2.5 py-1 bg-slate-800 text-indigo-300 rounded font-mono font-medium';
  document.getElementById('inspect-tab-stack').className = 'px-2.5 py-1 bg-slate-950 text-slate-400 rounded font-mono';
  document.getElementById('inspect-tab-log').className = 'px-2.5 py-1 bg-slate-950 text-slate-400 rounded font-mono';
  renderInspector();
};

document.getElementById('inspect-tab-stack').onclick = () => {
  activeInspectorTab = 'stack';
  document.getElementById('inspect-tab-stack').className = 'px-2.5 py-1 bg-slate-800 text-indigo-300 rounded font-mono font-medium';
  document.getElementById('inspect-tab-heap').className = 'px-2.5 py-1 bg-slate-950 text-slate-400 rounded font-mono';
  document.getElementById('inspect-tab-log').className = 'px-2.5 py-1 bg-slate-950 text-slate-400 rounded font-mono';
  renderInspector();
};

document.getElementById('inspect-tab-log').onclick = () => {
  activeInspectorTab = 'log';
  document.getElementById('inspect-tab-log').className = 'px-2.5 py-1 bg-slate-800 text-indigo-300 rounded font-mono font-medium';
  document.getElementById('inspect-tab-heap').className = 'px-2.5 py-1 bg-slate-950 text-slate-400 rounded font-mono';
  document.getElementById('inspect-tab-stack').className = 'px-2.5 py-1 bg-slate-950 text-slate-400 rounded font-mono';
  renderInspector();
};

elModalClose.onclick = () => elModal.classList.add('hidden');
window.onclick = (e) => { if (e.target === elModal) elModal.classList.add('hidden'); };

// Inicializar sincronización y polling periódico (cada 1.5s)
fetchState();
setInterval(fetchState, 1500);
