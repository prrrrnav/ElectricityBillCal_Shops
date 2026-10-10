const LEGACY_SHOPS = [
  { id: 'mobile-shop', name: 'Mobile Shop' },
  { id: 'medical-shop', name: 'Medical Shop' }
];

function normalizeMonthRecord(record) {
  if (Array.isArray(record.shops)) {
    return {
      totalAmount: Number(record.totalAmount) || 0,
      date: record.date || '',
      shops: record.shops.map(shop => ({
        id: String(shop.id),
        name: String(shop.name || 'Shop'),
        currentReading: toReading(shop.currentReading),
        lastReading: toReading(shop.lastReading),
        units: toReading(shop.units),
        bill: toReading(shop.bill)
      }))
    };
  }

  return {
    totalAmount: Number(record.totalAmount) || 0,
    date: record.date || '',
    shops: LEGACY_SHOPS.map((shop, index) => {
      const legacy = record[`shop${index + 1}`] || {};
      const prefix = `shop${index + 1}_`;
      return {
        ...shop,
        currentReading: toReading(legacy.currentReading ?? record[`${prefix}current`]),
        lastReading: toReading(legacy.lastReading ?? record[`${prefix}last`]),
        units: toReading(legacy.units ?? record[`${prefix}units`]),
        bill: toReading(legacy.bill ?? record[`${prefix}bill`])
      };
    })
  };
}

function findPreviousReading(shopId, records, targetYear, targetMonth) {
  const targetPeriod = periodNumber(targetYear, targetMonth);
  const previousRecords = records
    .filter(record => periodNumber(record.year, record.month) < targetPeriod)
    .sort((a, b) => periodNumber(b.year, b.month) - periodNumber(a.year, a.month));

  for (const record of previousRecords) {
    const shop = normalizeMonthRecord(record.data || record).shops.find(item => item.id === shopId);
    if (shop && shop.currentReading !== null) return shop.currentReading;
  }

  return null;
}

function calculateAllocations(totalAmount, shops) {
  const amount = Number(totalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError('Enter a total bill greater than zero.');
  }
  if (!Array.isArray(shops) || shops.length === 0) {
    throw new TypeError('Add at least one active shop.');
  }

  const readings = shops.map(shop => {
    const current = toReading(shop.currentReading);
    const previous = toReading(shop.lastReading);
    if (current === null || previous === null) {
      throw new TypeError(`Enter current and previous readings for ${shop.name}.`);
    }
    if (current < previous) {
      throw new RangeError(`${shop.name}'s current reading is below its previous reading.`);
    }
    return { ...shop, currentReading: current, lastReading: previous, units: current - previous };
  });

  const totalUnits = readings.reduce((sum, shop) => sum + shop.units, 0);
  if (totalUnits <= 0) throw new RangeError('Total usage must be greater than zero.');

  const totalCents = Math.round(amount * 100);
  const shares = readings.map((shop, index) => {
    const exactCents = totalCents * shop.units / totalUnits;
    const cents = Math.floor(exactCents);
    return { ...shop, index, cents, remainder: exactCents - cents };
  });

  const remainingCents = totalCents - shares.reduce((sum, shop) => sum + shop.cents, 0);
  const remainderOrder = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let index = 0; index < remainingCents; index += 1) remainderOrder[index].cents += 1;

  return shares.map(({ index, remainder, cents, ...shop }) => ({
    ...shop,
    bill: cents / 100
  }));
}

function toReading(value) {
  if (value === null || value === undefined || value === '') return null;
  const reading = Number(value);
  return Number.isFinite(reading) && reading >= 0 ? reading : null;
}

function periodNumber(year, month) {
  const monthIndex = typeof month === 'number'
    ? month - 1
    : new Date(`${month} 1, ${year}`).getMonth();
  return Number(year) * 12 + monthIndex;
}

const ElectricityBilling = {
  LEGACY_SHOPS,
  calculateAllocations,
  findPreviousReading,
  normalizeMonthRecord
};

if (typeof module !== 'undefined' && module.exports) module.exports = ElectricityBilling;
if (typeof window !== 'undefined') window.ElectricityBilling = ElectricityBilling;