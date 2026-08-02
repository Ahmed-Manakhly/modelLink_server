/**
 * FLOW 04 — Reset Script (Read-only flow)
 * Just clears the session state. No DB changes needed.
 *
 * Usage: node seeding_scripts/04_client_discovery_flow/reset.js
 */

const fs   = require('fs');
const path = require('path');

const INPUT_PATH = path.join(__dirname, 'data_input.json');

console.log('♻️  FLOW 04 — Reset (read-only flow, no DB changes)\n');
fs.writeFileSync(INPUT_PATH, '{}');
console.log('   ✅ data_input.json cleared');
console.log('\n✅ Flow 04 reset complete. Run bot.js to re-run queries.\n');
