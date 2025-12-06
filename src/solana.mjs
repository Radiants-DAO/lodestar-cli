/**
 * @file solana.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Utility module for all Solana web3.js interactions.
 * This file initializes the connection, defines all account layouts
 * (Board, Round, Miner) using `@solana/buffer-layout` for parsing
 * on-chain data, and provides functions for calculating all
 * necessary PDAs (Program Derived Addresses).
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { Connection, PublicKey } from '@solana/web3.js';
import pkg_layout from '@solana/buffer-layout';
const { struct, blob, seq } = pkg_layout;
import { u64, publicKey } from '@solana/buffer-layout-utils';
import {
  ORE_PROGRAM_ID,
  RPC_URL,
  BOARD_SEED,
  ROUND_SEED,
  MINER_SEED,
  AUTOMATION_SEED,
  TREASURY_SEED,
  ACCOUNT_DISCRIMINATOR_SIZE,
} from './constants.mjs';

// --- Module-level Variables ---
let connection;

// --- Connection ---

/**
 * Initializes and returns the Solana connection object.
 * @returns {Connection} The Solana Connection object.
 */
export function initConnection() {
  connection = new Connection(RPC_URL, 'confirmed');
  return connection;
}

/**
 * Returns the active connection object.
 * Useful for modules that need the connection but can't have it passed in.
 */
export function getConnection() {
  return connection;
}

// --- Account Layouts ---

/**
 * Buffer layout for the ORE v3 Board account.
 */
export const BOARD_LAYOUT = struct([
  u64('round_id'),
  u64('start_slot'),
  u64('end_slot'),
  u64('epoch_id')
]);

/**
 * Buffer layout for the ORE v3 Round account.
 */
export const ROUND_LAYOUT = struct([
  u64('id'),
  seq(u64(), 25, 'deployed'),
  blob(32, 'slot_hash'),
  seq(u64(), 25, 'count'),
  u64('expires_at'),
  u64('motherlode'),
  publicKey('rent_payer'),
  publicKey('top_miner'),
  u64('top_miner_reward'),
  u64('total_deployed'),
  u64('total_miners'),
  u64('total_vaulted'),
  u64('total_winnings'),
]);

/**
 * Buffer layout for the ORE v3 Miner account.
 */
export const MINER_LAYOUT = struct([
  publicKey('authority'),
  seq(u64(), 25, 'deployed'),
  seq(u64(), 25, 'cumulative'),
  u64('checkpoint_fee'),
  u64('checkpoint_id'),
  u64('last_claim_ore_at'),
  u64('last_claim_sol_at'),
  blob(16, 'rewards_factor'),
  u64('rewards_sol'),
  u64('rewards_ore'),
  u64('refined_ore'),
  u64('round_id'),
  u64('lifetime_rewards_sol'),
  u64('lifetime_rewards_ore'),
  u64('lifetime_deployed'),
]);

// --- PDA Getters ---

/**
 * Gets the PDA for the main game board.
 * @returns {PublicKey} The Board PDA.
 */
export function getBoardPda() {
  const [pda] = PublicKey.findProgramAddressSync([BOARD_SEED], ORE_PROGRAM_ID);
  return pda;
}

/**
 * Gets the PDA for a specific round.
 * @param {BN} roundId_bn - The round ID as a BN.js object.
 * @returns {PublicKey} The Round PDA.
 */
export function getRoundPda(roundId_bn) {
  const roundIdBuffer = roundId_bn.toBuffer('le', 8);
  const [pda] = PublicKey.findProgramAddressSync([ROUND_SEED, roundIdBuffer], ORE_PROGRAM_ID);
  return pda;
}

/**
 * Gets the PDA for a miner account.
 * @param {PublicKey} authority - The user's wallet public key.
 * @returns {PublicKey} The Miner PDA.
 */
export function getMinerPda(authority) {
  const [pda] = PublicKey.findProgramAddressSync(
    [MINER_SEED, authority.toBuffer()],
    ORE_PROGRAM_ID
  );
  return pda;
}

/**
 * Gets the PDA for an automation account.
 * @param {PublicKey} authority - The user's wallet public key.
 * @returns {PublicKey} The Automation PDA.
 */
export function getAutomationPda(authority) {
  const [pda] = PublicKey.findProgramAddressSync(
    [AUTOMATION_SEED, authority.toBuffer()],
    ORE_PROGRAM_ID
  );
  return pda;
}

/**
 * Gets the PDA for the Treasury.
 * @returns {PublicKey} The Treasury PDA.
 */
export function getTreasuryPda() {
  const [pda] = PublicKey.findProgramAddressSync([TREASURY_SEED], ORE_PROGRAM_ID);
  return pda;
}

// --- Account Parsers ---

/**
 * Parses raw Board account data.
 * @param {Buffer} data - The raw account data.
 * @returns {object} The parsed Board data.
 */
export function parseBoard(data) {
  const dataBuffer = data.slice(ACCOUNT_DISCRIMINATOR_SIZE);
  return BOARD_LAYOUT.decode(dataBuffer);
}

/**
 * Parses raw Round account data.
 * @param {Buffer} data - The raw account data.
 * @returns {object} The parsed Round data.
 */
export function parseRound(data) {
  const dataBuffer = data.slice(ACCOUNT_DISCRIMINATOR_SIZE);
  return ROUND_LAYOUT.decode(dataBuffer);
}

/**
 * Parses raw Miner account data.
 * @param {Buffer} data - The raw account data.
 * @returns {object} The parsed Miner data.
 */
export function parseMiner(data) {
  const dataBuffer = data.slice(ACCOUNT_DISCRIMINATOR_SIZE);
  return MINER_LAYOUT.decode(dataBuffer);
}

// --- RNG & Game Logic ---

/**
 * Checks if a slot_hash (blob 32) has been populated.
 * @param {Buffer} slotHash - The 32-byte slot hash buffer.
 * @returns {boolean} True if any byte is non-zero.
 */
export function isSlotHashPopulated(slotHash) {
  // Check if any byte in the 32-byte buffer is not zero
  return slotHash.some(byte => byte !== 0);
}

/**
 * Calculates a pseudo-random number from the slot hash.
 * @param {Buffer} slotHash - The 32-byte slot hash buffer.
 * @returns {bigint} The resulting RNG value.
 */
export function calculateRng(slotHash) {
  const r1 = slotHash.readBigUInt64LE(0);
  const r2 = slotHash.readBigUInt64LE(8);
  const r3 = slotHash.readBigUInt64LE(16);
  const r4 = slotHash.readBigUInt64LE(24);
  return r1 ^ r2 ^ r3 ^ r4;
}

/**
 * Determines the winning square from the RNG value.
 * @param {bigint} rng - The RNG value.
 * @returns {number} The winning square index (0-24).
 */
export function getWinningSquare(rng) {
  return Number(rng % 25n); // Modulo 25 to get a value from 0-24
}
