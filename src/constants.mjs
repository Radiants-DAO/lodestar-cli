/**
 * @file constants.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Defines all global constants, static values, and magic numbers
 * for the Lodestar application. This includes Solana program IDs, seeds,
 * RPC endpoints, app mode definitions, and all parameters used in
 * the EV calculation models.
 * @project lodestar-cli
 * @license MIT
 */

import { PublicKey } from '@solana/web3.js';

// --- Solana Program & Token Addresses ---
export const ORE_PROGRAM_ID = new PublicKey('oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv');
export const SYSTEM_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');
export const ENTROPY_PROGRAM_ID = new PublicKey('3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X');
export const ORE_VAR_ADDRESS = new PublicKey('BWCaDY96Xe4WkFq1M7UiCCRcChsJ3p51L5KrGzhxgm2E');
export const ORE_TOKEN_ADDRESS = 'oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp';
export const SOL_TOKEN_ADDRESS = 'So11111111111111111111111111111111111111112';

// --- Solana Account Seeds & Layout ---
export const BOARD_SEED = Buffer.from("board");
export const ROUND_SEED = Buffer.from("round");
export const MINER_SEED = Buffer.from("miner");
export const AUTOMATION_SEED = Buffer.from("automation");
export const TREASURY_SEED = Buffer.from("treasury");
export const ACCOUNT_DISCRIMINATOR_SIZE = 8;

// --- Network & Time Configuration ---
// export const RPC_URL = 'https://solana-rpc.parafi.tech';
export const RPC_URL = 'https://api.mainnet-beta.solana.com';
export const MS_PER_SLOT = 400;
export const PRICE_UPDATE_MS = 60_000; // 1 minute
export const SOUND_COOLDOWN_MS = 5000;  // 5 seconds
export const CLAIM_INTERVAL_MS = 30 * 60 * 1000; // 30 Minutes
export const MIN_CLAIM_THRESHOLD = 0.001;

// --- Application Logic ---
export const APP_MODES = {
  IDLE: 'idle',
  ONE_X_EV: '1x EV',
  THREE_X_EV: '3x EV',
  FIVE_X_EV: '5x EV',
  TWENTY_FIVE_X_EV: '25x EV',
};
export const DELTA_THRESHOLD_SOL = 0.6; // SOL difference to trigger pool delta alert

// --- Game Mechanics & EV Model Parameters ---
export const SOL_PER_LAMPORT = 1 / 1_000_000_000;
export const REF_MULT = 0.9;
export const ADMIN_FEE = 0.01;
export const PROTOCOL_CUT = 0.10;
export const P_WIN = 1 / 25;      // Probability of any single square winning
export const HIT_PROB = 1 / 625;  // Probability of hitting the motherlode
export const ADMIN_COST_FACTOR = ADMIN_FEE / (1 - ADMIN_FEE);
export const C = 24 + (ADMIN_COST_FACTOR) / P_WIN; // Constant used in EV calculation
