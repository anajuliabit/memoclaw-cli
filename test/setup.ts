/**
 * Test setup: set environment variables before any module loads.
 * This runs before all test files via bunfig.toml preload.
 */
process.env.MEMOCLAW_PRIVATE_KEY = process.env.MEMOCLAW_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
process.env.MEMOCLAW_URL = process.env.MEMOCLAW_URL || 'http://localhost:99999';
