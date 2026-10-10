const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateAllocations,
  findPreviousReading,
  normalizeMonthRecord
} = require('./billing');

test('normalizes legacy local and Supabase shop fields', () => {
  const record = normalizeMonthRecord({
    totalAmount: 120,
    shop1: { currentReading: 20, lastReading: 10, units: 10, bill: 60 },
    shop2_current: 35,
    shop2_last: 15,
    shop2_units: 20,
    shop2_bill: 60
  });

  assert.deepEqual(record.shops.map(shop => shop.id), ['mobile-shop', 'medical-shop']);
  assert.equal(record.shops[0].currentReading, 20);
  assert.equal(record.shops[1].lastReading, 15);
});

test('keeps variable shop records intact when normalizing', () => {
  const record = normalizeMonthRecord({
    totalAmount: 300,
    shops: [{ id: 'shop-3', name: 'New Shop', currentReading: 80, lastReading: 60, units: 20, bill: 300 }]
  });

  assert.equal(record.shops.length, 1);
  assert.equal(record.shops[0].id, 'shop-3');
  assert.equal(record.shops[0].units, 20);
});

test('finds the latest prior saved current reading', () => {
  const records = [
    { year: 2025, month: 'January', data: { shops: [{ id: 'a', currentReading: 15 }] } },
    { year: 2025, month: 'March', data: { shops: [{ id: 'a', currentReading: 42 }] } },
    { year: 2025, month: 'April', data: { shops: [{ id: 'a', currentReading: 99 }] } }
  ];

  assert.equal(findPreviousReading('a', records, 2025, 'April'), 42);
  assert.equal(findPreviousReading('missing', records, 2025, 'April'), null);
});

test('allocates exact currency cents proportionally by usage', () => {
  const allocations = calculateAllocations(100.01, [
    { id: 'a', name: 'A', currentReading: 11, lastReading: 10 },
    { id: 'b', name: 'B', currentReading: 22, lastReading: 20 },
    { id: 'c', name: 'C', currentReading: 33, lastReading: 30 }
  ]);

  assert.deepEqual(allocations.map(shop => shop.bill), [16.67, 33.34, 50]);
  assert.equal(allocations.reduce((sum, shop) => sum + shop.bill, 0), 100.01);
});

test('rejects missing readings and decreasing meter readings', () => {
  assert.throws(
    () => calculateAllocations(100, [{ name: 'A', currentReading: '', lastReading: 5 }]),
    /Enter current and previous readings/
  );
  assert.throws(
    () => calculateAllocations(100, [{ name: 'A', currentReading: 4, lastReading: 5 }]),
    /below its previous reading/
  );
});

test('rejects a nonpositive bill or zero total usage', () => {
  assert.throws(() => calculateAllocations(0, [{ name: 'A', currentReading: 1, lastReading: 0 }]), /greater than zero/);
  assert.throws(() => calculateAllocations(100, [{ name: 'A', currentReading: 4, lastReading: 4 }]), /Total usage/);
});