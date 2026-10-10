const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const z = require('zod/v4');
const { createBillingService } = require('../lib/billing-service');
const { createSupabaseStore } = require('../lib/supabase-store');
const { hasBearerToken } = require('../lib/auth');

module.exports = async function mcpEndpoint(request, response) {
  const token = process.env.MCP_BEARER_TOKEN;
  if (!token) return response.status(503).json({ error: 'MCP endpoint is not configured.' });
  if (!hasBearerToken(request, token)) return response.status(401).json({ error: 'Unauthorized.' });
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Use POST for MCP requests.' });
  }

  let server;
  let transport;
  try {
    const service = createBillingService(createSupabaseStore());
    server = createMcpServer(service);
    transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
    response.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!response.headersSent) response.status(500).json({ error: 'MCP request failed.' });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '1mb' } } };

function createMcpServer(service) {
  const server = new McpServer({ name: 'electricity-billing-assistant', version: '1.0.0' });
  const register = (name, description, inputSchema, handler) => {
    server.registerTool(name, { description, inputSchema }, async input => {
      try {
        const result = await handler(input);
        return { content: [{ type: 'text', text: String(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: error.message || 'Billing operation failed.' }] };
      }
    });
  };

  register('get_billing_status', 'Show the active billing period, entered parent bill, and missing readings.', {}, () => service.getStatus());
  register('list_shops', 'List active and archived shops.', {}, () => service.listShops());
  register('set_parent_bill', 'Set the parent-meter bill amount for the active period.', { amount: z.number().positive() }, ({ amount }) => service.setBill(amount));
  register('set_shop_current_reading', 'Record one active shop meter current reading.', {
    shop: z.string().min(1).max(60),
    reading: z.number().nonnegative()
  }, ({ shop, reading }) => service.setReading(shop, reading));
  register('set_shop_previous_reading', 'Set or correct one active shop previous reading for the active period.', {
    shop: z.string().min(1).max(60),
    reading: z.number().nonnegative()
  }, ({ shop, reading }) => service.setPreviousReading(shop, reading));
  register('add_shop', 'Add an active shop to future billing periods.', { name: z.string().trim().min(1).max(60) }, ({ name }) => service.addShop(name));
  register('archive_shop', 'Archive a shop while preserving its billing history.', { shop: z.string().min(1).max(60) }, ({ shop }) => service.archiveShop(shop));
  register('restore_shop', 'Restore an archived shop.', { shop: z.string().min(1).max(60) }, ({ shop }) => service.restoreShop(shop));
  register('calculate_bill', 'Calculate and save once all active shop readings and the parent bill are present.', {}, () => service.calculate(true));

  return server;
}