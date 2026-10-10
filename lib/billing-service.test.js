const test = require('node:test');
const assert = require('node:assert/strict');
const { createBillingService, parseOwnerMessage } = require('./billing-service');

function createStore() {
  const store = {
    state: null,
    bills: [],
    async getState() { return this.state; },
    async saveState(state) { this.state = structuredClone(state); },
    async listBills() { return this.bills; },
    async saveBill(bill) {
      this.bills = this.bills.filter(item => item.year !== bill.year || item.month !== bill.month);
      this.bills.push(structuredClone(bill));
    }
  };
  return store;
}

function createService(store = createStore()) {
  let nextId = 0;
  const service = createBillingService(store, {
    now: () => new Date('2026-10-10T12:00:00.000Z'),
    makeId: name => `${name.toLowerCase().replace(/\s+/g, '-')}-${++nextId}`
  });
  return { service, store };
}

test('parses fixed WhatsApp commands without confusing shop names and readings', () => {
  assert.deepEqual(parseOwnerMessage('reading Medical Shop 1234.5'), {
    type: 'reading', shop: 'Medical Shop', value: 1234.5
  });
  assert.deepEqual(parseOwnerMessage('bill 1500'), { type: 'bill', value: 1500 });
  assert.deepEqual(parseOwnerMessage('period 2026-10'), { type: 'period', year: 2026, month: 10 });
  assert.equal(parseOwnerMessage('hello'), null);
});

test('saves only after all active readings and the parent bill are present', async () => {
  const { service, store } = createService();
  await service.handleWhatsAppText('previous Mobile Shop 100');
  await service.handleWhatsAppText('previous Medical Shop 200');
  await service.handleWhatsAppText('reading Mobile Shop 110');
  await service.handleWhatsAppText('bill 100');

  assert.equal(store.bills.length, 0);
  const result = await service.handleWhatsAppText('reading Medical Shop 230');

  assert.equal(store.bills.length, 1);
  assert.match(result, /Mobile Shop: 100 → 110 \(10 units\), ₹25\.00/);
  assert.match(result, /Medical Shop: 200 → 230 \(30 units\), ₹75\.00/);
  assert.equal(store.bills[0].shops.reduce((sum, shop) => sum + shop.bill, 0), 100);
});

test('carries forward a saved current reading and accepts a baseline override', async () => {
  const store = createStore();
  store.bills.push({
    year: 2026,
    month: 'September',
    shops: [{ id: 'mobile-shop', name: 'Mobile Shop', currentReading: 350, lastReading: 300, units: 50, bill: 50 }]
  });
  const { service } = createService(store);

  const response = await service.handleWhatsAppText('status');
  assert.match(response, /Previous readings needed: Medical Shop/);
  await service.handleWhatsAppText('previous Medical Shop 50');
  await service.handleWhatsAppText('bill 100');
  await service.handleWhatsAppText('reading Mobile Shop 360');
  const result = await service.handleWhatsAppText('reading Medical Shop 70');

  assert.match(result, /Mobile Shop: 350 → 360/);
  assert.equal(store.bills.at(-1).shops[0].lastReading, 350);
});

test('shop management archives and restores without deleting the shop', async () => {
  const { service, store } = createService();
  await service.handleWhatsAppText('add Upstairs Flat');
  await service.handleWhatsAppText('remove Medical Shop');
  let listing = await service.handleWhatsAppText('shops');
  assert.match(listing, /Active: Mobile Shop, Upstairs Flat/);
  assert.match(listing, /Archived: Medical Shop/);

  await service.handleWhatsAppText('restore Medical Shop');
  listing = await service.handleWhatsAppText('shops');
  assert.match(listing, /Archived: none/);
  assert.equal(store.state.shopRegistry.length, 3);
});