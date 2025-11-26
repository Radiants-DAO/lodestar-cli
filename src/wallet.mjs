/**
 * @file wallet.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Manages the local wallet lifecycle.
 * Checks for a local `id.json` keypair. If missing, generates one,
 * saves it, and prompts the user to fund it. If present, validates
 * the balance before allowing the app to start.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { log } from './utils.mjs';
import { colors } from './theme.mjs';
import { setAppState } from './state.mjs';

// --- Module-level Variables ---
let signerKeypair = null;

// --- Public Functions ---

/**
 * Loads the signer from the current directory or creates it if missing.
 * Also performs a strict balance check (on-boarding flow).
 * @param {Connection} connection - The Solana connection object (needed for balance check).
 * @returns {Promise<Keypair>} The loaded keypair.
 */
export async function loadSigner(connection) {
  if (signerKeypair) return signerKeypair;

  const keypairPath = path.join(process.cwd(), 'id.json');

  // 1. Check if file exists
  if (!fs.existsSync(keypairPath)) {
    return handleNewWallet(keypairPath);
  }

  // 2. Load existing wallet
  try {
    const keypairFile = fs.readFileSync(keypairPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(keypairFile));
    signerKeypair = Keypair.fromSecretKey(secretKey);
  } catch (e) {
    log(`ERROR: Failed to parse local id.json.`);
    log(`Details: ${e.message}`);
    process.exit(1);
  }

  const pubkeyStr = signerKeypair.publicKey.toBase58();
  
  // 3. Check Balance
  log(`checking balance for wallet: ${pubkeyStr.slice(0,4)}...${pubkeyStr.slice(-4)}`);
  
  const balanceLamports = await connection.getBalance(signerKeypair.publicKey);
  const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

  // 4. Update State and Return
  setAppState({ userBalance: balanceSol });
  log(`wallet loaded. balance: ${balanceSol.toFixed(4)} SOL`);
  
  return signerKeypair;
}

/**
 * Gets the loaded signer keypair.
 * @returns {Keypair | null}
 */
export function getSigner() {
  return signerKeypair;
}

// --- Private Helper Functions ---

/**
 * Handles the creation of a new wallet file and exits.
 * @param {string} filePath - The path to save the new keypair.
 */
function handleNewWallet(filePath) {
  // 1. Generate new keypair
  const newKeypair = Keypair.generate();
  const secretKeyArray = Array.from(newKeypair.secretKey);

  // 2. Write to disk
  fs.writeFileSync(filePath, JSON.stringify(secretKeyArray));

  const pubkey = newKeypair.publicKey.toBase58();

  // 3. Inform User and Exit
  console.log(`\x1b[33m                                ========\x1b[0m`);
  console.log(`\x1b[33m                                ========\x1b[0m`);
  console.log(`\x1b[33m                           ==================\x1b[0m`);
  console.log(`\x1b[33m                           ==================\x1b[0m`);
  console.log(`\x1b[33m                           ==================\x1b[0m`);
  console.log(`\x1b[33m                           ==================\x1b[0m`);
  console.log(`\x1b[33m          =============    ==================    ============\x1b[0m`);
  console.log(`\x1b[33m          =============                          ============\x1b[0m`);
  console.log(`\x1b[33m          =============                          ============\x1b[0m`);
  console.log(`\x1b[33m          =============    ==================    ============\x1b[0m`);
  console.log(`\x1b[33m          ========         ==================         =======\x1b[0m`);
  console.log(`\x1b[33m          ========   ==============================   =======\x1b[0m`);
  console.log(`\x1b[33m          ========   ==============================   =======\x1b[0m`);
  console.log(`\x1b[33m                     ==============================\x1b[0m`);
  console.log(`\x1b[33m     =======    ========================================    =======\x1b[0m`);
  console.log(`\x1b[33m    -=======    ========================================    =======-\x1b[0m`);
  console.log(`\x1b[33m    -=======    ========================================    =======-\x1b[0m`);
  console.log(`\x1b[33m============    ========================================    ============\x1b[0m`);
  console.log(`\x1b[33m============    ========================================    ============\x1b[0m`);
  console.log(`\x1b[33m============    ========================================    ============\x1b[0m`);
  console.log(`\x1b[33m============    ========================================    ============\x1b[0m`);
  console.log(`\x1b[33m============    ========================================    ============\x1b[0m`);
  console.log(`\x1b[33m    -=======    ========================================    =======-\x1b[0m`);
  console.log(`\x1b[33m    -=======    ========================================    =======-\x1b[0m`);
  console.log(`\x1b[33m     -------    -----==============================-----    -------\x1b[0m`);
  console.log(`\x1b[33m                     ==============================\x1b[0m`);
  console.log(`\x1b[33m          -=======   ==============================   =======\x1b[0m`);
  console.log(`\x1b[33m          ========   ==============================   =======\x1b[0m`);
  console.log(`\x1b[33m          ========         ==================         =======\x1b[0m`);
  console.log(`\x1b[33m          =============    ==================   =============  YEEHAW\x1b[0m`);
  console.log(`\x1b[33m          =============    ------------------   =============\x1b[0m`);
  console.log(`\x1b[33m          =============                         =============\x1b[0m`);
  console.log(`\x1b[33m          =============    ==================   =============\x1b[0m`);
  console.log(`\x1b[33m                           ==================\x1b[0m`);
  console.log(`\x1b[33m                           ==================\x1b[0m`);
  console.log(`\x1b[33m       THE SUN IS UP       ==================\x1b[0m`);
  console.log(`\x1b[33m                           -----========-----\x1b[0m`);
  console.log(`\x1b[33m                                ========         LETS MINE AND SHINE\x1b[0m`);
  console.log(`\x1b[33m                                ========\x1b[0m`);
  console.log(`\n------------------------------------------------------------------------`);
  console.log(`  INITIAL SETUP DETECTED, CREATED NEW BOT WALLET`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`  Location: ${filePath}`);
  console.log(`  Address: \x1b[33m${pubkey}\x1b[0m`);
  console.log(`------------------------------------------------------------------------`);
  console.log(`  \x1b[31mACTION REQUIRED:\x1b[0m`);
  console.log(`  We have created a new local wallet for your bot`);
  console.log(`  Send SOL to the address above. You will be able to cash out at anytime`);
  console.log(`  Once funded, run this app again`);
  console.log(`------------------------------------------------------------------------\n`);

  process.exit(1);
}
