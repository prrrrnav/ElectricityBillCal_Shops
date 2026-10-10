const { createBillingService } = require('../lib/billing-service');
const { createSupabaseStore } = require('../lib/supabase-store');
const { isOwnerPhoneNumber, isValidWhatsAppSignature, safeEqual } = require('../lib/auth');

module.exports = async function whatsappWebhook(request, response) {
  if (request.method === 'GET') return verifyWebhook(request, response);
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'GET, POST');
    return response.status(405).send('Method not allowed');
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const ownerNumber = process.env.WHATSAPP_OWNER_NUMBER;
  if (!appSecret || !ownerNumber) return response.status(503).send('WhatsApp webhook is not configured.');

  let rawBody;
  try {
    rawBody = await readRawBody(request);
  } catch (error) {
    return response.status(413).send(error.message);
  }

  const signature = request.headers['x-hub-signature-256'];
  if (!isValidWhatsAppSignature(rawBody, signature, appSecret)) return response.status(401).send('Invalid webhook signature.');

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return response.status(400).send('Invalid JSON payload.');
  }

  try {
    const store = createSupabaseStore();
    const service = createBillingService(store);
    const messages = (payload.entry || []).flatMap(entry => (entry.changes || []).flatMap(change => change.value?.messages || []));

    for (const message of messages) {
      if (!isOwnerPhoneNumber(message.from, ownerNumber)) continue;
      if (message.id && !(await store.claimWebhookMessage(message.id))) continue;

      try {
        let reply;
        if (message.type !== 'text' || !message.text?.body) {
          reply = 'Please send a text command. Send “help” to see the supported format.';
        } else {
          try {
            reply = await service.handleWhatsAppText(message.text.body);
          } catch (error) {
            reply = error.message || 'I could not process that command.';
          }
        }

        await sendWhatsAppText(message.from, reply);
      } catch (error) {
        if (message.id) await store.releaseWebhookMessage(message.id);
        throw error;
      }
    }

    return response.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    console.error('WhatsApp webhook failed:', error);
    return response.status(500).send('Webhook processing failed.');
  }
};

module.exports.config = { api: { bodyParser: false } };

function verifyWebhook(request, response) {
  const mode = request.query['hub.mode'];
  const token = request.query['hub.verify_token'];
  const challenge = request.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && expectedToken && safeEqual(String(token || ''), expectedToken) && challenge) {
    return response.status(200).send(String(challenge));
  }
  return response.status(403).send('Webhook verification failed.');
}

async function readRawBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('Webhook payload exceeds 1 MB.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function sendWhatsAppText(to, text) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  if (!accessToken || !phoneNumberId || !graphVersion) throw new Error('Set the WhatsApp access token, phone number ID, and Graph API version.');

  const result = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: String(text).slice(0, 4000) }
    })
  });
  if (!result.ok) throw new Error(`WhatsApp send failed with status ${result.status}.`);
}