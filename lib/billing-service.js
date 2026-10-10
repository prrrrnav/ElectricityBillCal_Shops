const billing = require('../billing');

const DEFAULT_REGISTRY = billing.LEGACY_SHOPS.map(shop => ({ ...shop, active: true }));
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parseOwnerMessage(text) {
  const message = String(text || '').trim();
  let match;

  if ((match = message.match(/^(?:reading|current)\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)$/i))) {
    return { type: 'reading', shop: match[1].trim(), value: Number(match[2]) };
  }
  if ((match = message.match(/^(?:previous|last)\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)$/i))) {
    return { type: 'previous', shop: match[1].trim(), value: Number(match[2]) };
  }
  if ((match = message.match(/^(?:bill|total)\s+([0-9]+(?:\.[0-9]+)?)$/i))) {
    return { type: 'bill', value: Number(match[1]) };
  }
  if ((match = message.match(/^period\s+(\d{4})-(\d{1,2})$/i))) {
    return { type: 'period', year: Number(match[1]), month: Number(match[2]) };
  }
  if ((match = message.match(/^add\s+(.+)$/i))) return { type: 'add', name: match[1].trim() };
  if ((match = message.match(/^(?:remove|archive)\s+(.+)$/i))) return { type: 'archive', shop: match[1].trim() };
  if ((match = message.match(/^restore\s+(.+)$/i))) return { type: 'restore', shop: match[1].trim() };
  if (/^(?:shops|list)$/i.test(message)) return { type: 'shops' };
  if (/^(?:status|summary)$/i.test(message)) return { type: 'status' };
  if (/^(?:calculate|calc)$/i.test(message)) return { type: 'calculate' };
  if (/^help$/i.test(message)) return { type: 'help' };
  return null;
}

function createBillingService(store, options = {}) {
  const now = options.now || (() => new Date());
  const makeId = options.makeId || (name => `${slug(name)}-${Date.now().toString(36)}`);

  async function loadState() {
    const saved = await store.getState();
    return {
      shopRegistry: Array.isArray(saved?.shopRegistry) && saved.shopRegistry.length
        ? saved.shopRegistry.map(shop => ({ id: String(shop.id), name: String(shop.name), active: shop.active !== false }))
        : DEFAULT_REGISTRY.map(shop => ({ ...shop })),
      pendingPeriods: saved?.pendingPeriods && typeof saved.pendingPeriods === 'object' ? saved.pendingPeriods : {},
      activePeriod: saved?.activePeriod || null,
      processedMessageIds: Array.isArray(saved?.processedMessageIds) ? saved.processedMessageIds : []
    };
  }

  function selectedPeriod(state) {
    if (state.activePeriod) return state.activePeriod;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: options.timeZone || 'Asia/Kolkata',
      year: 'numeric',
      month: 'numeric'
    }).formatToParts(now());
    return {
      year: Number(parts.find(part => part.type === 'year').value),
      month: Number(parts.find(part => part.type === 'month').value)
    };
  }

  function draftFor(state, period) {
    const key = periodKey(period.year, period.month);
    if (!state.pendingPeriods[key]) {
      state.pendingPeriods[key] = {
        year: period.year,
        month: MONTH_NAMES[period.month - 1],
        totalAmount: null,
        readings: {},
        previousReadings: {},
        completed: false
      };
    }
    return state.pendingPeriods[key];
  }

  function findShop(state, reference, includeArchived = false) {
    const normalized = String(reference).trim().toLocaleLowerCase();
    return state.shopRegistry.find(shop => (includeArchived || shop.active) &&
      (shop.id.toLocaleLowerCase() === normalized || shop.name.toLocaleLowerCase() === normalized));
  }

  async function priorRecords(period) {
    return store.listBills(period.year, MONTH_NAMES[period.month - 1]);
  }

  async function tryCalculate(state, period, draft, force = false) {
    if (!draft.totalAmount) return force ? 'Enter the parent bill first with: bill 1250.50' : null;

    const activeShops = state.shopRegistry.filter(shop => shop.active);
    if (!activeShops.length) return 'Add or restore at least one shop before calculating.';

    const records = await priorRecords(period);
    const shops = activeShops.map(shop => ({
      ...shop,
      currentReading: draft.readings[shop.id],
      lastReading: draft.previousReadings[shop.id] ?? billing.findPreviousReading(shop.id, records, period.year, MONTH_NAMES[period.month - 1])
    }));
    const missingCurrent = shops.filter(shop => shop.currentReading === undefined || shop.currentReading === null);
    const missingPrevious = shops.filter(shop => shop.lastReading === null || shop.lastReading === undefined);

    if (missingCurrent.length || missingPrevious.length) {
      if (!force) return null;
      const missing = [];
      if (missingCurrent.length) missing.push(`current readings: ${missingCurrent.map(shop => shop.name).join(', ')}`);
      if (missingPrevious.length) missing.push(`previous readings: ${missingPrevious.map(shop => shop.name).join(', ')}`);
      return `Still needed for ${periodLabel(period)}: ${missing.join('; ')}. Set a baseline with: previous Shop Name 1234`;
    }

    let allocations;
    try {
      allocations = billing.calculateAllocations(draft.totalAmount, shops);
    } catch (error) {
      return `Cannot calculate ${periodLabel(period)}: ${error.message}`;
    }

    const savedBill = {
      year: period.year,
      month: MONTH_NAMES[period.month - 1],
      totalAmount: Number(draft.totalAmount),
      date: now().toISOString(),
      shops: allocations,
      shopRegistry: state.shopRegistry
    };
    await store.saveBill(savedBill);
    draft.completed = true;
    draft.completedAt = savedBill.date;
    await store.saveState(state);
    return formatBill(savedBill);
  }

  async function recordInput(mutator, acknowledgement) {
    const state = await loadState();
    const period = selectedPeriod(state);
    const draft = draftFor(state, period);
    mutator(state, draft, period);
    draft.completed = false;
    await store.saveState(state);
    const result = await tryCalculate(state, period, draft);
    return result || `${acknowledgement}\n${await formatStatus(state, period, draft)}`;
  }

  async function formatStatus(state, period, draft) {
    const records = await priorRecords(period);
    const activeShops = state.shopRegistry.filter(shop => shop.active);
    const missingCurrent = activeShops.filter(shop => draft.readings[shop.id] === undefined).map(shop => shop.name);
    const missingPrevious = activeShops.filter(shop => {
      const previous = draft.previousReadings[shop.id] ?? billing.findPreviousReading(shop.id, records, period.year, draft.month);
      return previous === null;
    }).map(shop => shop.name);
    const bill = draft.totalAmount ? `Parent bill: ₹${Number(draft.totalAmount).toFixed(2)}.` : 'Parent bill not entered.';
    const readings = [
      missingCurrent.length ? `Current readings needed: ${missingCurrent.join(', ')}.` : '',
      missingPrevious.length ? `Previous readings needed: ${missingPrevious.join(', ')}.` : ''
    ].filter(Boolean).join(' ') || 'All active shops have readings.';
    return `${periodLabel(period)}. ${bill} ${readings}`;
  }

  async function setBill(amount) {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Bill amount must be greater than zero.');
    return recordInput((state, draft) => { draft.totalAmount = value; }, `Parent bill recorded: ₹${value.toFixed(2)}.`);
  }

  async function setReading(reference, value) {
    const reading = Number(value);
    if (!Number.isFinite(reading) || reading < 0) throw new RangeError('Reading must be a non-negative number.');
    return recordInput((state, draft) => {
      const shop = findShop(state, reference);
      if (!shop) throw new Error(`Active shop not found: ${reference}. Use “shops” to see active shops.`);
      draft.readings[shop.id] = reading;
    }, `Current reading recorded for ${reference}: ${reading}.`);
  }

  async function setPreviousReading(reference, value) {
    const reading = Number(value);
    if (!Number.isFinite(reading) || reading < 0) throw new RangeError('Previous reading must be a non-negative number.');
    return recordInput((state, draft) => {
      const shop = findShop(state, reference);
      if (!shop) throw new Error(`Active shop not found: ${reference}. Use “shops” to see active shops.`);
      draft.previousReadings[shop.id] = reading;
    }, `Previous reading updated for ${reference}: ${reading}.`);
  }

  async function addShop(name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new TypeError('Provide a shop name.');
    const state = await loadState();
    if (state.shopRegistry.some(shop => shop.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
      throw new Error(`A shop named ${cleanName} already exists.`);
    }
    state.shopRegistry.push({ id: makeId(cleanName), name: cleanName, active: true });
    await store.saveState(state);
    return `Added ${cleanName}. Set its first baseline with: previous ${cleanName} 0`;
  }

  async function archiveShop(reference) {
    const state = await loadState();
    const shop = findShop(state, reference);
    if (!shop) throw new Error(`Active shop not found: ${reference}.`);
    if (state.shopRegistry.filter(item => item.active).length <= 1) throw new Error('At least one active shop is required.');
    shop.active = false;
    await store.saveState(state);
    return `Archived ${shop.name}. Its saved billing history is preserved.`;
  }

  async function restoreShop(reference) {
    const state = await loadState();
    const shop = findShop(state, reference, true);
    if (!shop) throw new Error(`Shop not found: ${reference}.`);
    shop.active = true;
    await store.saveState(state);
    return `Restored ${shop.name}.`;
  }

  async function listShops() {
    const state = await loadState();
    const active = state.shopRegistry.filter(shop => shop.active);
    const archived = state.shopRegistry.filter(shop => !shop.active);
    return `Active: ${active.map(shop => shop.name).join(', ') || 'none'}\nArchived: ${archived.map(shop => shop.name).join(', ') || 'none'}`;
  }

  async function getStatus() {
    const state = await loadState();
    const period = selectedPeriod(state);
    return formatStatus(state, period, draftFor(state, period));
  }

  async function calculate(force = true) {
    const state = await loadState();
    const period = selectedPeriod(state);
    const draft = draftFor(state, period);
    const result = await tryCalculate(state, period, draft, force);
    if (result) return result;
    return formatStatus(state, period, draft);
  }

  async function selectPeriod(year, monthNumber) {
    const yearValue = Number(year);
    const monthValue = Number(monthNumber);
    if (!Number.isInteger(yearValue) || yearValue < 2000 || yearValue > 2100 || !Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
      throw new RangeError('Use a period in YYYY-MM format.');
    }
    const state = await loadState();
    state.activePeriod = { year: yearValue, month: monthValue };
    const draft = draftFor(state, state.activePeriod);
    await store.saveState(state);
    return formatStatus(state, state.activePeriod, draft);
  }

  async function handleWhatsAppText(text) {
    const command = parseOwnerMessage(text);
    if (!command) return 'I did not understand that. Send “help” for supported commands.';
    switch (command.type) {
      case 'reading': return setReading(command.shop, command.value);
      case 'previous': return setPreviousReading(command.shop, command.value);
      case 'bill': return setBill(command.value);
      case 'add': return addShop(command.name);
      case 'archive': return archiveShop(command.shop);
      case 'restore': return restoreShop(command.shop);
      case 'shops': return listShops();
      case 'status': return getStatus();
      case 'calculate': return calculate(true);
      case 'period': return selectPeriod(command.year, command.month).then(status => `Billing period selected. ${status}`);
      case 'help': return HELP_TEXT;
      default: return 'I did not understand that. Send “help” for supported commands.';
    }
  }

  return { addShop, archiveShop, calculate, getStatus, handleWhatsAppText, listShops, restoreShop, selectPeriod, setBill, setPreviousReading, setReading };
}

function formatBill(bill) {
  const lines = bill.shops.map(shop => `${shop.name}: ${shop.lastReading} → ${shop.currentReading} (${shop.units} units), ₹${shop.bill.toFixed(2)}`);
  return `${bill.month} ${bill.year} bill: ₹${bill.totalAmount.toFixed(2)}\n${lines.join('\n')}\nTotal allocated: ₹${bill.shops.reduce((sum, shop) => sum + shop.bill, 0).toFixed(2)}`;
}

function periodKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function periodLabel(period) {
  return `${MONTH_NAMES[period.month - 1]} ${period.year}`;
}

function slug(value) {
  return String(value).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
}

const HELP_TEXT = [
  'Send one command per message:',
  'reading Shop Name 1234.5',
  'bill 2500.00',
  'previous Shop Name 1000',
  'period YYYY-MM',
  'add Shop Name',
  'remove Shop Name / restore Shop Name',
  'shops / status / calculate'
].join('\n');

module.exports = { createBillingService, parseOwnerMessage };