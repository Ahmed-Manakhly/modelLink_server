#!/usr/bin/env node
/**
 * ModelLink Seeding Orchestrator
 * ============================================================
 * Runs all 9 flows in order (fresh session)
 * between runs.
 *
 * Commands:
 *   node seeding_scripts/run_all.js           — Run all flows in order
 *   node seeding_scripts/run_all.js reset     — Reset all flows (reverse order)
 *   node seeding_scripts/run_all.js 00        — Run only flow 00
 *   node seeding_scripts/run_all.js 01        — Run only flow 01
 *   node seeding_scripts/run_all.js 01 02 03  — Run specific flows
 * ============================================================
 */

const { execSync } = require('child_process');
const path = require('path');

const BASE = path.join(__dirname);

const FLOWS = [
    { id: '00', name: 'Taxonomy & Categories',     bot: '00_taxonomy_categories_flow/bot.js',      reset: '00_taxonomy_categories_flow/reset.js' },
    { id: '01', name: 'Auth & Profile',            bot: '01_auth_profile_flow/bot.js',             reset: '01_auth_profile_flow/reset.js' },
    { id: '02', name: 'Developer Verification',    bot: '02_developer_verification_flow/bot.js',   reset: '02_developer_verification_flow/reset.js' },
    { id: '02b', name: 'Admin Verification Approve', bot: '02_developer_verification_flow/admin_approve.js', reset: '02_developer_verification_flow/reset.js' },
    { id: '03', name: 'Model Publishing',          bot: '03_model_publishing_flow/bot.js',         reset: '03_model_publishing_flow/reset.js' },
    { id: '03b', name: 'Model Versions',           bot: '03b_model_versions_flow/bot.js',          reset: '03b_model_versions_flow/reset.js' },
    { id: '04', name: 'Client Discovery',          bot: '04_client_discovery_flow/bot.js',         reset: '04_client_discovery_flow/reset.js' },
    { id: '05', name: 'Order & Transaction',       bot: '05_order_transaction_flow/bot.js',        reset: '05_order_transaction_flow/reset.js' },
    { id: '06', name: 'Payout Lifecycle',          bot: '06_payout_lifecycle/bot.js',              reset: '06_payout_lifecycle/reset.js' },
    { id: '07', name: 'Admin Edge Cases',          bot: '07_admin_edge_cases/bot.js',              reset: '07_admin_edge_cases/reset.js' },
];

const args = process.argv.slice(2);
const isReset = args[0] === 'reset';
const requestedIds = args.filter(a => /^\d{2}b?$/.test(a));

function run(scriptPath) {
    const full = path.join(BASE, scriptPath);
    console.log(`\n${'═'.repeat(54)}`);
    try {
        execSync(`node "${full}"`, { stdio: 'inherit' });
    } catch {
        console.error(`\n❌ Script failed: ${scriptPath}`);
        process.exit(1);
    }
}

const targetFlows = requestedIds.length > 0
    ? FLOWS.filter(f => requestedIds.includes(f.id))
    : FLOWS;

if (isReset) {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ModelLink Seeding — FULL RESET (reverse order)      ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    [...targetFlows].reverse().forEach(f => {
        console.log(`\n🔄 Resetting Flow ${f.id}: ${f.name}`);
        run(f.reset);
    });
    console.log('\n✅ All flows reset.\n');
} else {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  ModelLink Seeding — Full Run                        ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    targetFlows.forEach(f => {
        console.log(`\n🚀 Running Flow ${f.id}: ${f.name}`);
        run(f.bot);
    });
    console.log('\n🎉 All flows complete!\n');
}
