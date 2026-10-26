const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3001;
const STATIC_DIR = __dirname;

const PRINT_CONFIG = {
  hostname: 'central-comprobantes-angel.angelopatrickriosnol.chatgpt.site',
  path: '/api/jobs',
  siteAccessToken: 'hUvjKoa6cWySchg9atvV05OGpxeOmnlnsY3X-fXI-Ic',
  submitToken: 'xOe6dWtyXbCubKF5oMeXmj_R9RxPOudAfLsGVWq58cw'
};

// ==========================================
// ESTRUCTURAS DE DATOS EN EL SERVIDOR (CENTRALIZADAS)
// ==========================================

class MinHeap {
  constructor(comparator = (a, b) => a.cost - b.cost) {
    this.heap = [];
    this.comparator = comparator;
  }
  size() { return this.heap.length; }
  isEmpty() { return this.heap.length === 0; }
  peek() { return this.heap[0] || null; }
  push(val) {
    this.heap.push(val);
    this._bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.isEmpty()) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }
  _bubbleUp(idx) {
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      if (this.comparator(this.heap[idx], this.heap[parentIdx]) < 0) {
        [this.heap[idx], this.heap[parentIdx]] = [this.heap[parentIdx], this.heap[idx]];
        idx = parentIdx;
      } else break;
    }
  }
  _sinkDown(idx) {
    const length = this.heap.length;
    while (true) {
      let left = 2 * idx + 1;
      let right = 2 * idx + 2;
      let smallest = idx;
      if (left < length && this.comparator(this.heap[left], this.heap[smallest]) < 0) smallest = left;
      if (right < length && this.comparator(this.heap[right], this.heap[smallest]) < 0) smallest = right;
      if (smallest !== idx) {
        [this.heap[idx], this.heap[smallest]] = [this.heap[smallest], this.heap[idx]];
        idx = smallest;
      } else break;
    }
  }
  toArray() { return [...this.heap]; }
}

class WaitQueue {
  constructor() { this.items = []; }
  enqueue(item) { this.items.push(item); }
  dequeue() { return this.items.shift() || null; }
  peek() { return this.items[0] || null; }
  size() { return this.items.length; }
  isEmpty() { return this.items.length === 0; }
  toArray() { return [...this.items]; }
}

class MovementStack {
  constructor(maxSize = 200) { this.stack = []; this.maxSize = maxSize; }
  push(movement) {
    if (this.stack.length >= this.maxSize) this.stack.shift();
    this.stack.push(movement);
  }
  pop() { return this.stack.pop() || null; }
  size() { return this.stack.length; }
  toArray() { return [...this.stack].reverse(); }
}

const TARIFFS = {
  Auto: 5.0,
  Camioneta: 7.0,
  Moto: 2.5,
  Electrico: 6.0,
  Discapacitado: 3.0
};

class SmartParkingCore {
  constructor() {
    this.numLevels = 3;
    this.spotsPerLevel = 20;
    this.matrix = [];
    this.activePolicy = 'min-cost';
    this.simTimeMinutes = 480; // 08:00 AM
    this.totalRevenue = 0.0;
    
    this.waitQueue = new WaitQueue();
    this.undoStack = new MovementStack();
    this.minHeap = new MinHeap((a, b) => a.cost - b.cost);
    this.reservations = new Map();
    this.flowHistory = [];
    this.systemLogs = [];
    this.version = 1;

    this.metrics = {
      ff: { assignedCount: 0, totalDist: 0, totalSearchTime: 0, peakOccupancy: 0 },
      mc: { assignedCount: 0, totalDist: 0, totalSearchTime: 0, peakOccupancy: 0 }
    };

    this.initMatrix();
    this.seedInitial();
    this.rebuildMinHeap();
  }

  initMatrix() {
    this.matrix = [];
    for (let l = 0; l < this.numLevels; l++) {
      const levelSpots = [];
      for (let s = 0; s < this.spotsPerLevel; s++) {
        const row = Math.floor(s / 10);
        const col = s % 10;
        const distance = (l * 25) + ((col + 1) * 3) + (row * 6);
        let specialType = 'normal';
        if (s === 0) specialType = 'discapacitado';
        else if (s === 1) specialType = 'electrico';

        levelSpots.push({
          level: l + 1,
          spotIndex: s + 1,
          id: `N${l + 1}-${String(s + 1).padStart(2, '0')}`,
          state: 'free',
          vehicle: null,
          reservation: null,
          blockReason: '',
          distance: distance,
          specialType: specialType
        });
      }
      this.matrix.push(levelSpots);
    }
  }

  seedInitial() {
    const plates = ['ABC-101', 'XYZ-202', 'LMN-303', 'QWE-404', 'RTY-505', 'ASD-606', 'ZXC-707', 'VBN-808'];
    const types = ['Auto', 'Camioneta', 'Moto', 'Electrico', 'Discapacitado', 'Auto', 'Auto', 'Camioneta'];
    plates.forEach((p, i) => {
      this.parkVehicle(p, types[i], 30 + i * 10);
    });
    this.createReservation('RES-777', '1', 25);
    this.toggleBlock(3, 20, 'Fuga de aceite');
  }

  calculateSlotCost(slot, vehicleType = 'Auto') {
    const levelOccupied = this.matrix[slot.level - 1].filter(s => s.state === 'occupied').length;
    const levelCongestionFactor = (levelOccupied / this.spotsPerLevel) * 20;
    let vehicleBonus = 0;
    if (vehicleType === 'Discapacitado' && slot.specialType === 'discapacitado') vehicleBonus = -40;
    else if (vehicleType === 'Electrico' && slot.specialType === 'electrico') vehicleBonus = -30;
    else if (vehicleType !== 'Discapacitado' && slot.specialType === 'discapacitado') vehicleBonus = 100;
    return slot.distance + levelCongestionFactor + vehicleBonus;
  }

  rebuildMinHeap(vehicleType = 'Auto') {
    this.minHeap = new MinHeap((a, b) => a.cost - b.cost);
    for (let l = 0; l < this.numLevels; l++) {
      for (let s = 0; s < this.spotsPerLevel; s++) {
        const slot = this.matrix[l][s];
        if (slot.state === 'free') {
          const cost = this.calculateSlotCost(slot, vehicleType);
          this.minHeap.push({ slot, cost });
        }
      }
    }
  }

  findSlotFirstFit(vehicleType) {
    for (let l = 0; l < this.numLevels; l++) {
      for (let s = 0; s < this.spotsPerLevel; s++) {
        const slot = this.matrix[l][s];
        if (slot.state === 'free') {
          if (slot.specialType === 'discapacitado' && vehicleType !== 'Discapacitado') continue;
          return slot;
        }
      }
    }
    for (let l = 0; l < this.numLevels; l++) {
      for (let s = 0; s < this.spotsPerLevel; s++) {
        if (this.matrix[l][s].state === 'free') return this.matrix[l][s];
      }
    }
    return null;
  }

  findSlotMinCost(vehicleType) {
    this.rebuildMinHeap(vehicleType);
    if (this.minHeap.isEmpty()) return null;
    return this.minHeap.pop().slot;
  }

  parkVehicle(plate, type, durationMinutes, reservationCode = null, policyOverride = null) {
    const policy = policyOverride || this.activePolicy;
    plate = String(plate).trim().toUpperCase();

    for (let l = 0; l < this.numLevels; l++) {
      for (let s = 0; s < this.spotsPerLevel; s++) {
        if (this.matrix[l][s].vehicle && this.matrix[l][s].vehicle.plate === plate) {
          return { success: false, message: `El vehículo ${plate} ya está en ${this.matrix[l][s].id}` };
        }
      }
    }

    let targetSlot = null;
    if (reservationCode && this.reservations.has(reservationCode.trim().toUpperCase())) {
      const res = this.reservations.get(reservationCode.trim().toUpperCase());
      const slot = this.matrix[res.level - 1][res.spotIndex - 1];
      if (slot.state === 'reserved' && (!res.plate || res.plate === plate)) {
        targetSlot = slot;
        this.reservations.delete(reservationCode.trim().toUpperCase());
        this.logAction(`Reserva reclamada: ${reservationCode} para ${plate}`);
      }
    }

    if (!targetSlot) {
      targetSlot = (policy === 'first-fit') ? this.findSlotFirstFit(type) : this.findSlotMinCost(type);
    }

    if (!targetSlot) {
      this.waitQueue.enqueue({ plate, type, durationMinutes, entrySimTime: this.simTimeMinutes, policy });
      this.logAction(`Sin cupo: Auto ${plate} a cola de espera (Pos #${this.waitQueue.size()})`, 'warning');
      this.recordFlowEvent(+1);
      this.version++;
      return { success: false, queued: true, message: `Estacionamiento lleno. Vehículo agregado a cola (#${this.waitQueue.size()})` };
    }

    const vehicleData = {
      plate,
      type,
      entryTime: this.simTimeMinutes,
      expectedDuration: durationMinutes,
      exitTime: this.simTimeMinutes + durationMinutes,
      tariffRate: TARIFFS[type] || 5.0
    };

    targetSlot.state = 'occupied';
    targetSlot.vehicle = vehicleData;
    targetSlot.reservation = null;

    this.undoStack.push({
      action: 'park',
      slotId: targetSlot.id,
      level: targetSlot.level,
      spotIndex: targetSlot.spotIndex,
      vehicle: vehicleData
    });

    const searchDist = targetSlot.distance;
    const estTime = (searchDist / 5.5).toFixed(1);
    const occ = this.getOccupiedCount();
    const m = policy === 'first-fit' ? this.metrics.ff : this.metrics.mc;
    m.assignedCount++;
    m.totalDist += searchDist;
    m.totalSearchTime += parseFloat(estTime);
    if (occ > m.peakOccupancy) m.peakOccupancy = occ;

    this.recordFlowEvent(+1);
    this.logAction(`Entrada: ${plate} (${type}) -> ${targetSlot.id} [${policy.toUpperCase()}]`);
    this.version++;
    return { success: true, slot: targetSlot, distance: searchDist, estSearchTime: estTime };
  }

  exitVehicle(level, spotIndex) {
    const slot = this.matrix[level - 1][spotIndex - 1];
    if (!slot || slot.state !== 'occupied' || !slot.vehicle) {
      return { success: false, message: 'El espacio no está ocupado.' };
    }

    const vehicle = slot.vehicle;
    const durationMins = Math.max(5, this.simTimeMinutes - vehicle.entryTime);
    const durationHours = durationMins / 60;
    const cost = Math.max(2.0, durationHours * vehicle.tariffRate);

    this.totalRevenue += cost;
    const departingPlate = vehicle.plate;

    this.undoStack.push({
      action: 'exit',
      slotId: slot.id,
      level: slot.level,
      spotIndex: slot.spotIndex,
      vehicle: { ...vehicle },
      amountPaid: cost
    });

    slot.state = 'free';
    slot.vehicle = null;
    this.recordFlowEvent(-1);
    this.logAction(`Salida: ${departingPlate} liberó ${slot.id}. Cobro: S/ ${cost.toFixed(2)} (${durationMins}m)`);

    this.processWaitQueue();
    this.version++;
    return { success: true, plate: departingPlate, cost, durationMins, slotId: slot.id, type: vehicle.type };
  }

  processWaitQueue() {
    if (this.waitQueue.isEmpty()) return;
    const nextCar = this.waitQueue.peek();
    const slot = (nextCar.policy === 'first-fit') ? this.findSlotFirstFit(nextCar.type) : this.findSlotMinCost(nextCar.type);
    if (slot) {
      const dequeued = this.waitQueue.dequeue();
      this.parkVehicle(dequeued.plate, dequeued.type, dequeued.durationMinutes, null, dequeued.policy);
    }
  }

  createReservation(plate, levelPreference = 'any', expiryMinutes = 20) {
    plate = String(plate).trim().toUpperCase();
    let targetSlot = null;
    if (levelPreference !== 'any') {
      const lvl = parseInt(levelPreference, 10);
      for (let s = 0; s < this.spotsPerLevel; s++) {
        if (this.matrix[lvl - 1][s].state === 'free') {
          targetSlot = this.matrix[lvl - 1][s];
          break;
        }
      }
    } else {
      this.rebuildMinHeap();
      if (!this.minHeap.isEmpty()) targetSlot = this.minHeap.pop().slot;
    }

    if (!targetSlot) return { success: false, message: 'No hay espacios libres para reservar.' };

    targetSlot.state = 'reserved';
    const code = 'RES-' + Math.random().toString(36).substr(2, 5).toUpperCase();
    const resData = {
      code,
      plate,
      level: targetSlot.level,
      spotIndex: targetSlot.spotIndex,
      slotId: targetSlot.id,
      createdAt: this.simTimeMinutes,
      expiresAt: this.simTimeMinutes + expiryMinutes
    };

    targetSlot.reservation = resData;
    this.reservations.set(code, resData);
    this.undoStack.push({ action: 'reserve', slotId: targetSlot.id, reservation: resData });
    this.logAction(`Reserva: ${code} (${plate}) en ${targetSlot.id}`);
    this.version++;
    return { success: true, reservation: resData };
  }

  toggleBlock(level, spotIndex, reason = 'Mantenimiento') {
    const slot = this.matrix[level - 1][spotIndex - 1];
    if (!slot) return { success: false, message: 'Espacio no existe' };

    if (slot.state === 'blocked') {
      slot.state = 'free';
      slot.blockReason = '';
      this.logAction(`Desbloqueo: Espacio ${slot.id} habilitado.`);
      this.processWaitQueue();
      this.version++;
      return { success: true, state: 'free' };
    } else if (slot.state === 'free') {
      slot.state = 'blocked';
      slot.blockReason = reason || 'Mantenimiento';
      this.undoStack.push({ action: 'block', slotId: slot.id, level, spotIndex });
      this.logAction(`Bloqueo: ${slot.id} por ${slot.blockReason}`, 'warning');
      this.version++;
      return { success: true, state: 'blocked' };
    } else {
      return { success: false, message: `No se puede bloquear porque está ${slot.state}` };
    }
  }

  advanceTime(minutes = 5) {
    this.simTimeMinutes += minutes;
    for (const [code, res] of this.reservations.entries()) {
      if (this.simTimeMinutes >= res.expiresAt) {
        const slot = this.matrix[res.level - 1][res.spotIndex - 1];
        if (slot && slot.state === 'reserved') {
          slot.state = 'free';
          slot.reservation = null;
          this.logAction(`Reserva expirada: ${code} (${res.plate})`, 'warning');
        }
        this.reservations.delete(code);
        this.processWaitQueue();
      }
    }
    for (let l = 0; l < this.numLevels; l++) {
      for (let s = 0; s < this.spotsPerLevel; s++) {
        const slot = this.matrix[l][s];
        if (slot.state === 'occupied' && slot.vehicle && this.simTimeMinutes >= slot.vehicle.exitTime) {
          this.exitVehicle(slot.level, slot.spotIndex);
        }
      }
    }
    this.rebuildMinHeap();
    this.version++;
  }

  undoLastMovement() {
    if (this.undoStack.size() === 0) return { success: false, message: 'Nada que deshacer.' };
    const last = this.undoStack.pop();
    if (last.action === 'park') {
      const slot = this.matrix[last.level - 1][last.spotIndex - 1];
      slot.state = 'free';
      slot.vehicle = null;
      this.logAction(`Deshacer: Entrada de ${last.vehicle.plate} en ${slot.id}`);
    } else if (last.action === 'block') {
      const slot = this.matrix[last.level - 1][last.spotIndex - 1];
      slot.state = 'free';
      slot.blockReason = '';
      this.logAction(`Deshacer: Bloqueo de ${slot.id}`);
    } else if (last.action === 'reserve') {
      const res = last.reservation;
      const slot = this.matrix[res.level - 1][res.spotIndex - 1];
      if (slot.state === 'reserved') { slot.state = 'free'; slot.reservation = null; }
      this.reservations.delete(res.code);
      this.logAction(`Deshacer: Reserva ${res.code}`);
    }
    this.version++;
    return { success: true };
  }

  recordFlowEvent(delta) {
    this.flowHistory.push({ time: this.simTimeMinutes, delta });
    if (this.flowHistory.length > 10) this.flowHistory.shift();
  }

  getSaturationPrediction() {
    const totalSlots = 60;
    const occupied = this.getOccupiedCount();
    const currentRate = occupied / totalSlots;
    if (this.flowHistory.length < 3) {
      return { level: 'Bajo', percentage: Math.round(currentRate * 100), color: 'emerald', netFlowRate: 0.0, minutesToFull: '60 min' };
    }
    const netCars = this.flowHistory.reduce((s, h) => s + h.delta, 0);
    const span = Math.max(1, this.flowHistory[this.flowHistory.length - 1].time - this.flowHistory[0].time);
    const netFlowRate = parseFloat((netCars / span).toFixed(2));
    const freeSlots = totalSlots - occupied;
    const projectedPercentage = Math.round(Math.min(100, Math.max(0, ((occupied + Math.max(0, netFlowRate * 15)) / totalSlots) * 100)));
    let level = 'Bajo';
    let color = 'emerald';
    if (projectedPercentage >= 85 || (freeSlots <= 6 && netFlowRate > 0)) { level = 'Crítico'; color = 'rose'; }
    else if (projectedPercentage >= 65 || (freeSlots <= 15 && netFlowRate > 0)) { level = 'Medio'; color = 'amber'; }
    const minutesToFull = netFlowRate > 0 ? `${Math.round(freeSlots / netFlowRate)} min` : '>2 horas';
    return { level, percentage: projectedPercentage, color, netFlowRate, minutesToFull };
  }

  getOccupiedCount() {
    let count = 0;
    for (let l = 0; l < this.numLevels; l++) {
      for (let s = 0; s < this.spotsPerLevel; s++) {
        if (this.matrix[l][s].state === 'occupied') count++;
      }
    }
    return count;
  }

  getFormattedTime() {
    const hours = Math.floor(this.simTimeMinutes / 60) % 24;
    const mins = this.simTimeMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  logAction(text, type = 'info') {
    const time = this.getFormattedTime();
    this.systemLogs.unshift({ time, text, type });
    if (this.systemLogs.length > 50) this.systemLogs.pop();
  }

  getStateSnapshot() {
    this.rebuildMinHeap();
    return {
      version: this.version,
      simTimeFormatted: this.getFormattedTime(),
      simTimeMinutes: this.simTimeMinutes,
      totalRevenue: this.totalRevenue,
      occupiedCount: this.getOccupiedCount(),
      activePolicy: this.activePolicy,
      matrix: this.matrix,
      waitQueue: this.waitQueue.toArray(),
      reservations: Array.from(this.reservations.values()),
      undoStack: this.undoStack.toArray().slice(0, 5),
      heapTop: this.minHeap.toArray().slice(0, 5),
      logs: this.systemLogs.slice(0, 8),
      saturation: this.getSaturationPrediction(),
      metrics: this.metrics
    };
  }

  runBenchmark() {
    const types = ['Auto', 'Camioneta', 'Moto', 'Electrico', 'Discapacitado'];
    const reserveSteps = [3, 8, 14, 20, 27, 33, 42, 51, 60, 68];
    const blockSteps = [5, 15, 25, 45, 65];

    const runSim = (policy) => {
      const core = new SmartParkingCore();
      core.activePolicy = policy;
      let totalDist = 0, totalTime = 0, assigned = 0, peak = 0;
      let bIdx = 0;

      for (let i = 1; i <= 80; i++) {
        if (blockSteps.includes(i)) {
          core.toggleBlock((bIdx % 3) + 1, (bIdx * 4) % 20 + 3, 'Sim');
          bIdx++;
        }
        if (reserveSteps.includes(i)) {
          core.createReservation(`RES-${i}`, 'any', 25);
        }
        if (i > 25 && (i % 3 === 0)) {
          for (let l = 0; l < 3; l++) {
            let found = false;
            for (let s = 0; s < 20; s++) {
              if (core.matrix[l][s].state === 'occupied') { core.exitVehicle(l+1, s+1); found = true; break; }
            }
            if (found) break;
          }
        } else {
          const res = core.parkVehicle(`CAR-${100+i}`, types[i % types.length], 20 + (i*7)%80);
          if (res.success) {
            totalDist += res.distance;
            totalTime += parseFloat(res.estSearchTime);
            assigned++;
          }
        }
        const occ = core.getOccupiedCount();
        if (occ > peak) peak = occ;
        core.advanceTime(2);
      }
      return {
        assignedCount: assigned,
        totalDist,
        avgDist: assigned > 0 ? parseFloat((totalDist / assigned).toFixed(2)) : 0,
        avgTime: assigned > 0 ? parseFloat((totalTime / assigned).toFixed(2)) : 0,
        peakOccupancy: Math.round((peak / 60) * 100),
        core
      };
    };

    const resFF = runSim('first-fit');
    const resMC = runSim('min-cost');

    this.metrics.ff = { assignedCount: resFF.assignedCount, totalDist: resFF.totalDist, avgDist: resFF.avgDist, avgTime: resFF.avgTime, peakOccupancy: resFF.peakOccupancy };
    this.metrics.mc = { assignedCount: resMC.assignedCount, totalDist: resMC.totalDist, avgDist: resMC.avgDist, avgTime: resMC.avgTime, peakOccupancy: resMC.peakOccupancy };

    this.matrix = resMC.core.matrix;
    this.totalRevenue = resMC.core.totalRevenue;
    this.waitQueue = resMC.core.waitQueue;
    this.reservations = resMC.core.reservations;
    this.simTimeMinutes = resMC.core.simTimeMinutes;
    this.version++;
    return { resFF, resMC };
  }
}

const parkCore = new SmartParkingCore();

// Enviar comprobante a la impresora física vía Central de Comprobantes
function triggerPhysicalPrint(ticketData) {
  const content = [
    '================================',
    '       SMARTPARK 3D TICKET      ',
    '   Estacionamiento Inteligente  ',
    '================================',
    `Fecha/Hora : ${new Date().toLocaleString()}`,
    `Operacion  : ${ticketData.operation || 'COMPROBANTE'}`,
    `Placa      : ${ticketData.plate}`,
    `Tipo       : ${ticketData.type || 'Auto'}`,
    `Espacio    : ${ticketData.slotId || '-'}`,
    `Tiempo     : ${ticketData.durationMins || 0} min`,
    '--------------------------------',
    `TOTAL      : S/ ${(ticketData.cost || 0).toFixed(2)}`,
    '================================',
    '    Gracias por su preferencia  ',
    '   Conserve este comprobante    ',
    '\n\n'
  ].join('\n');

  const postData = JSON.stringify({
    source: 'SmartPark 3D Sync',
    external_id: `PARK-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    title: `Ticket ${ticketData.plate} (${ticketData.slotId || ''})`,
    content: content,
    copies: 1
  });

  const options = {
    hostname: PRINT_CONFIG.hostname,
    port: 443,
    path: PRINT_CONFIG.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'OAI-Sites-Authorization': `Bearer ${PRINT_CONFIG.siteAccessToken}`,
      'Authorization': `Bearer ${PRINT_CONFIG.submitToken}`
    }
  };

  const req = https.request(options, (res) => {
    res.on('data', () => {});
  });
  req.on('error', (err) => console.error('Error printer dispatch:', err.message));
  req.write(postData);
  req.end();
}

// ==========================================
// SERVIDOR HTTP CON API REST COMPLETA
// ==========================================

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  // 1. API: Obtener estado global sincronizado
  if (parsedUrl.pathname === '/api/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(parkCore.getStateSnapshot()));
    return;
  }

  // 2. API: Acciones del sistema
  if (parsedUrl.pathname.startsWith('/api/action/') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const action = parsedUrl.pathname.replace('/api/action/', '');
        let result = { success: true };

        if (action === 'park') {
          result = parkCore.parkVehicle(payload.plate, payload.type, payload.duration, payload.reserveCode);
        } else if (action === 'exit') {
          result = parkCore.exitVehicle(payload.level, payload.spotIndex);
          if (result.success) {
            triggerPhysicalPrint({
              operation: 'SALIDA Y COBRO',
              plate: result.plate,
              type: result.type,
              slotId: result.slotId,
              durationMins: result.durationMins,
              cost: result.cost
            });
          }
        } else if (action === 'reserve') {
          result = parkCore.createReservation(payload.plate, payload.level, payload.expiryMin);
        } else if (action === 'block') {
          result = parkCore.toggleBlock(payload.level, payload.spotIndex, payload.reason);
        } else if (action === 'advance-time') {
          parkCore.advanceTime(payload.minutes || 5);
        } else if (action === 'policy') {
          parkCore.activePolicy = payload.policy;
          parkCore.version++;
        } else if (action === 'undo') {
          result = parkCore.undoLastMovement();
        } else if (action === 'benchmark') {
          result = parkCore.runBenchmark();
        } else if (action === 'print-test') {
          triggerPhysicalPrint({
            operation: 'PRUEBA TECNICA',
            plate: 'TEST-58',
            type: 'POS58 Printer',
            slotId: 'N1-01',
            durationMins: 30,
            cost: 2.50
          });
          parkCore.logAction('Impresora POS58: Comprobante de prueba enviado.');
          result = { success: true };
        } else if (action === 'reset') {
          parkCore.initMatrix();
          parkCore.totalRevenue = 0;
          parkCore.simTimeMinutes = 480;
          parkCore.waitQueue = new WaitQueue();
          parkCore.undoStack = new MovementStack();
          parkCore.reservations.clear();
          parkCore.systemLogs = [];
          parkCore.seedInitial();
          parkCore.version++;
          result = { success: true };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...result, state: parkCore.getStateSnapshot() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 3. Servir interfaz web estática
  let reqPath = parsedUrl.pathname;
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(STATIC_DIR, reqPath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

// Escuchar en 0.0.0.0 para acceso desde móvil, Wi-Fi y LAN
server.listen(PORT, '0.0.0.0', () => {
  console.log(`SmartPark Server sincronizado en puerto ${PORT}`);
});
