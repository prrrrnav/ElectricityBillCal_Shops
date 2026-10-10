const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FILE = 'index.html';
const OUTPUT_DIR = 'dist';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.html');

// Public frontend configuration only. Server secrets must never be injected here.
let SUPABASE_URL = process.env.SUPABASE_URL || '';
let SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Read local files only when the deployment environment has not already supplied a value.
for (const envFile of ['.env.local', '.env']) {
  if (!fs.existsSync(envFile)) continue;
  const envContent = fs.readFileSync(envFile, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (!key || valueParts.length === 0 || key.trim().startsWith('#')) return;
    const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (key.trim() === 'SUPABASE_URL' && !SUPABASE_URL) SUPABASE_URL = value;
    if (key.trim() === 'SUPABASE_ANON_KEY' && !SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = value;
  });
}

function build() {
  console.log('🚀 Starting build process...');

  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ Error: ${INPUT_FILE} not found.`);
    process.exit(1);
  }

  // Create dist directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
    console.log(`📁 Created directory: ${OUTPUT_DIR}`);
  }

  // Read index.html
  let content = fs.readFileSync(INPUT_FILE, 'utf8');

  // Replace placeholders
  // We use matching strings from the index.html
  console.log('💉 Injecting environment variables...');
  
  const originalUrlMatch = /const SUPABASE_URL = '.*';/;
  const originalKeyMatch = /const SUPABASE_ANON_KEY = '.*';/;

  content = content.replace(originalUrlMatch, `const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};`);
  content = content.replace(originalKeyMatch, `const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};`);

  // Write to dist/index.html
  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`✅ Build complete! Saved to ${OUTPUT_FILE}`);

  // Copy runtime assets alongside the generated HTML.
  for (const asset of ['favicon.ico', 'billing.js']) {
    if (!fs.existsSync(asset)) continue;
    try {
      fs.copyFileSync(asset, path.join(OUTPUT_DIR, asset));
      console.log(`📄 Copied ${asset}`);
    } catch (err) {
      console.warn(`⚠️ Warning: Could not copy ${asset}. The app may not work correctly.`);
    }
  }
}

build();
