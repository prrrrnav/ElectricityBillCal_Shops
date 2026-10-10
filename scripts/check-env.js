const fs = require('node:fs');

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const requirements = {
  frontend: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'],
  backend: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'],
  whatsapp: [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_OWNER_NUMBER',
    'WHATSAPP_GRAPH_VERSION'
  ],
  mcp: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MCP_BEARER_TOKEN'],
  all: [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WHATSAPP_VERIFY_TOKEN',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_OWNER_NUMBER',
    'WHATSAPP_GRAPH_VERSION',
    'MCP_BEARER_TOKEN'
  ]
};

const scope = process.argv[2] || 'all';
if (!Object.hasOwn(requirements, scope)) {
  console.error(`Unknown scope "${scope}". Choose: ${Object.keys(requirements).join(', ')}.`);
  process.exitCode = 2;
} else {
  const missing = requirements[scope].filter(name => !process.env[name]?.trim());
  if (missing.length) {
    console.error(`Missing ${scope} environment variables:`);
    missing.forEach(name => console.error(`- ${name}`));
    process.exitCode = 1;
  } else {
    console.log(`Environment variables for ${scope} are present.`);
  }
}