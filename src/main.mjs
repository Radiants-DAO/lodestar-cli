/**
 * @file main.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description The main entry point for the Lodestar application.
 * This file initializes the TUI, sets up the Solana connection,
 * loads the signer wallet, starts the periodic price update loop,
 * and kicks off the main game loop.
 * @project lodestar-cli
 * @license MIT
 */

// --- Harmless Warning Suppression ---
// Suppresses a specific, harmless warning from the @solana/web3.js library
// related to 'Ignored unsubscribe request' which can flood the logs.
const originalWarn = console.warn;
console.warn = (...args) => {
  const message = (args[0] || '').toString();
  if (message.includes('Ignored unsubscribe request')) {
    return; // Suppress this specific, harmless warning
  }
  originalWarn.apply(console, args);
};

// --- Imports ---
import { initTUI } from './tui.mjs';
import { setUtilWidgets, log } from './utils.mjs';
import { initConnection } from './solana.mjs';
import { updatePrices, updateMinerStats } from './pricing.mjs';
import { updateCountdown, startGameLoop } from './game.mjs';
import { PRICE_UPDATE_MS, CLAIM_INTERVAL_MS, MIN_CLAIM_THRESHOLD } from './constants.mjs';
import { loadSigner } from './wallet.mjs';
import { sendClaimSolTx } from './transactions.mjs';
import { getState } from './state.mjs';

/**
 * Main application entry point.
 * Orchestrates the setup and execution of all application modules.
 */
async function main() {
  // 1. Initialize TUI and Utilities
  const tuiWidgets = initTUI();
  const { screen, logWindow } = tuiWidgets;
  setUtilWidgets({ logWindow, screen }); // Injects TUI widgets for global logging

  // 2. Setup Solana Connection & Wallet
  const connection = initConnection();

  // 2. Setup Solana Connection & Wallet
  const signer = await loadSigner(connection);

  // 3. Start Main Application Loops
  try {
    log(`connecting to ${connection.rpcEndpoint}...`);

    // Start price update loop (fetch immediately, then set interval)
    updatePrices(connection, signer, tuiWidgets);
    setInterval(() => updatePrices(connection, signer, tuiWidgets), PRICE_UPDATE_MS);

    // Start TUI countdown timer
    setInterval(updateCountdown, 1000);

    // Auto-Claim SOL (Every 30 mins)
    setInterval(async () => {
      const { minerRewardsSol, appMode } = getState();

      const rewards = Number(minerRewardsSol); // Ensure it's a number

      if (rewards >= MIN_CLAIM_THRESHOLD) {
        log(`auto-claiming: ${rewards.toFixed(4)} SOL`);
        
        // Perform Claim
        const success = await sendClaimSolTx(connection, signer);
        
        if (success) {
          // If successful, force an immediate stats refresh to zero out the display
          await updateMinerStats(connection, signer, tuiWidgets);
        }
      }
    }, CLAIM_INTERVAL_MS);

    // Start the main game loop (fetches data and subscribes to accounts)
    await startGameLoop(connection, signer, tuiWidgets);

  } catch (error) {
    // 4. Handle Fatal Errors
    log(`FATAL ERROR: ${error.message}`);
    log(error.stack);

    // Render the screen one last time to show the error
    screen.render();

    // Exit after a short delay so the user can read the error
    setTimeout(() => process.exit(1), 5000);
  }
}

// --- Run Application ---
main();
