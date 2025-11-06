/**
 * @file wallet.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Securely loads the user's Solana CLI keypair.
 * This module is responsible for finding and reading the default
 * Solana CLI `id.json` file from the user's home directory
 * (`~/.config/solana/id.json`) to load the signer keypair
 * for sending transactions.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { Keypair } from '@solana/web3.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { log } from './utils.mjs';
import { colors } from './theme.mjs';

// --- Module-level Variables ---

/**
 * Caches the loaded signer keypair so we don't read the file system repeatedly.
 * @type {Keypair | null}
 */
let signerKeypair = null;

// --- Public Functions ---

/**
 * Loads the default Solana CLI keypair from ~/.config/solana/id.json
 * This function is memoized; it will only load the keypair on the first call.
 * @returns {Keypair | null} The loaded keypair or null if not found.
 */
export function loadSigner() {
  // 1. Check if already loaded
  if (signerKeypair) {
    return signerKeypair;
  }

  try {
    // 2. Construct the standard Solana CLI wallet path
    const keypairPath = path.join(os.homedir(), '.config', 'solana', 'id.json');

    // 3. Check if the wallet file exists
    if (!fs.existsSync(keypairPath)) {
      log(`{${colors.RED}-fg}SIGNER NOT FOUND:{/${colors.RED}-fg} could not find keypair at ${keypairPath}`);
      log(`{${colors.YELLOW}-fg}please ensure your Solana CLI wallet is set up (run \`solana-keygen new\`){/${colors.YELLOW}-fg}`);
      return null;
    }

    // 4. Read, parse, and create the Keypair object
    const keypairFile = fs.readFileSync(keypairPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(keypairFile));
    signerKeypair = Keypair.fromSecretKey(secretKey);

    // 5. Log success
    log(`loaded wallet: ${signerKeypair.publicKey.toBase58()}`);
    return signerKeypair;

  } catch (e) {
    // 6. Handle any other errors (e.g., file permissions, corrupt JSON)
    log(`error loading keypair: ${e.message}`);
    return null;
  }
}

/**
 * Gets the loaded signer keypair.
 * Returns null if `loadSigner` has not been successfully called.
 * @returns {Keypair | null} The cached signer keypair.
 */
export function getSigner() {
  return signerKeypair;
}
