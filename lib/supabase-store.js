const { createClient } = require('@supabase/supabase-js');

function createSupabaseStore(env = process.env) {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment.');

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return {
    async getState() {
      const { data, error } = await client.from('electricity_app_state').select('*').eq('id', 'owner').maybeSingle();
      if (error) throw error;
      if (data) return fromStateRow(data);

      const { data: billRows, error: billsError } = await client
        .from('electricity_bills')
        .select('year,month,shop_registry')
        .not('shop_registry', 'is', null)
        .limit(1000);
      if (billsError) throw billsError;
      const latest = (billRows || []).sort((a, b) => periodValue(b) - periodValue(a))[0];
      return {
        shopRegistry: latest?.shop_registry || null,
        pendingPeriods: {},
        activePeriod: null,
        processedMessageIds: []
      };
    },

    async saveState(state) {
      const { error } = await client.from('electricity_app_state').upsert({
        id: 'owner',
        shop_registry: state.shopRegistry,
        pending_periods: state.pendingPeriods,
        active_period: state.activePeriod,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (error) throw error;
    },

    async listBills(year) {
      const { data, error } = await client.from('electricity_bills').select('*').lte('year', year);
      if (error) throw error;
      return (data || []).map(row => ({
        year: Number(row.year),
        month: row.month,
        data: Array.isArray(row.shops) ? { shops: row.shops } : row
      }));
    },

    async saveBill(bill) {
      const mobile = bill.shops.find(shop => shop.id === 'mobile-shop') || {};
      const medical = bill.shops.find(shop => shop.id === 'medical-shop') || {};
      const { error } = await client.from('electricity_bills').upsert({
        year: bill.year,
        month: bill.month,
        total_amount: bill.totalAmount,
        shops: bill.shops,
        shop_registry: bill.shopRegistry,
        shop1_current: mobile.currentReading ?? 0,
        shop1_last: mobile.lastReading ?? 0,
        shop1_units: mobile.units ?? 0,
        shop1_bill: mobile.bill ?? 0,
        shop2_current: medical.currentReading ?? 0,
        shop2_last: medical.lastReading ?? 0,
        shop2_units: medical.units ?? 0,
        shop2_bill: medical.bill ?? 0,
        display_date: bill.date
      }, { onConflict: 'year,month' });
      if (error) throw error;
    },

    async claimWebhookMessage(messageId) {
      const { error } = await client.from('electricity_processed_webhooks').insert({ message_id: messageId });
      if (error?.code === '23505') return false;
      if (error) throw error;
      return true;
    },

    async releaseWebhookMessage(messageId) {
      const { error } = await client.from('electricity_processed_webhooks').delete().eq('message_id', messageId);
      if (error) throw error;
    }
  };
}

function fromStateRow(row) {
  return {
    shopRegistry: row.shop_registry,
    pendingPeriods: row.pending_periods || {},
    activePeriod: row.active_period,
    processedMessageIds: []
  };
}

function periodValue(row) {
  const month = new Date(`${row.month} 1, ${row.year}`).getMonth();
  return Number(row.year) * 12 + month;
}

module.exports = { createSupabaseStore };