# Vercel Backend Setup

## Deploy

1. Apply the migrations in `supabase/migrations` in filename order.
2. In Vercel, set the project Node.js runtime to Node 22 or later and deploy from the `ElectricityBillCal_Shops` project root. `vercel.json` builds the static site into `dist`; the `api` directory deploys as serverless functions.
3. For local work, copy `.env.example` to `.env.local` and fill in the values. Run `npm run check:env` to see which required variable names are still missing; the checker never prints values. Add the same variables from `.env.example` in Vercel Project Settings for each environment you use. Never put `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_ACCESS_TOKEN`, or `MCP_BEARER_TOKEN` in frontend settings or commit their values.

`SUPABASE_SERVICE_ROLE_KEY` is required for backend persistence. `SUPABASE_ANON_KEY` remains a separate frontend build setting. The app-state and webhook-deduplication tables deny access to `anon` and `authenticated`; server functions use the service role.

## WhatsApp

Configure the Meta WhatsApp Business webhook callback as `https://YOUR_DOMAIN/api/whatsapp`, using `WHATSAPP_VERIFY_TOKEN`, and subscribe to message events. Set the app secret, access token, phone-number ID, supported Graph API version, and your owner phone number in E.164 digits. The webhook verifies Meta's raw-body signature and ignores messages from every other phone number.

Send one command per message. Use dot-decimal values without thousands separators:

- `reading Mobile Shop 1234.5`
- `previous Mobile Shop 1200`
- `bill 2500.00`
- `period 2026-10`
- `add Upstairs Flat`
- `remove Upstairs Flat`
- `restore Upstairs Flat`
- `shops`, `status`, or `calculate`

The service saves partial entries separately. It writes the monthly bill when the parent total and each active shop's current and previous readings are available. It replies to your allowlisted number only; it does not message shopkeepers.

## MCP

Configure your MCP client to connect to `https://YOUR_DOMAIN/api/mcp` using Streamable HTTP and an `Authorization: Bearer ...` header whose value is `MCP_BEARER_TOKEN`. The server exposes status, shop management, bill/readings input, and calculate tools. All tools are restricted to the shared bearer token.

## Local Checks

Use `npm test` for billing, command parsing, owner authorization, and webhook signature tests. `npm run build` builds the frontend; local Vercel function testing can be done with `npx vercel dev` after setting the environment variables.