const fs = require('fs');
const path = require('path');

// Configuration
const INPUT_FILE = 'index.html';
const OUTPUT_DIR = 'dist';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'index.html');

// Environment Variables from Vercel/Local
// Environment Variables from Vercel/Local
let SUPABASE_URL = process.env.SUPABASE_URL || '';
let SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Simple .env parser to avoid extra dependencies
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      if (key.trim() === 'SUPABASE_URL' && !SUPABASE_URL) SUPABASE_URL = value;
      if (key.trim() === 'SUPABASE_ANON_KEY' && !SUPABASE_ANON_KEY) SUPABASE_ANON_KEY = value;
    }
  });
  console.log('📝 Loaded credentials from .env file');
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

  content = content.replace(originalUrlMatch, `const SUPABASE_URL = '${SUPABASE_URL}';`);
  content = content.replace(originalKeyMatch, `const SUPABASE_ANON_KEY = '${SUPABASE_ANON_KEY}';`);

  // Write to dist/index.html
  fs.writeFileSync(OUTPUT_FILE, content);
  console.log(`✅ Build complete! Saved to ${OUTPUT_FILE}`);

  // Copy other assets if any (e.g. favicon)
  const favicon = 'favicon.ico';
  if (fs.existsSync(favicon)) {
    try {
      fs.copyFileSync(favicon, path.join(OUTPUT_DIR, favicon));
      console.log('📄 Copied favicon.ico');
    } catch (err) {
      console.warn(`⚠️ Warning: Could not copy ${favicon}. It might be in use or locked. The app will still work!`);
    }
  }
}

build();
