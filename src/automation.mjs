/**
 * @file automation.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Core automation logic for the Lodestar bot.
 * This module contains the `runAutomationCheck` function, which is
 * triggered near the end of a round. It analyzes the board, determines
 * the best targets based on the user's selected mode (1x, 3x, 5x EV),
 * and executes the deployment transaction.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { getState, setAppState } from './state.mjs';
import { analyzeBoardState } from './detection.mjs';
import { log } from './utils.mjs';
import { APP_MODES } from './constants.mjs';
import { getSigner } from './wallet.mjs';
import { sendDeployTx } from './transactions.mjs';

// --- Constants ---
const AUTOMATION_TRIGGER_SECONDS = 12; // Triggers at 12 seconds left

// --- Public Functions ---

/**
 * Resets all round-based flags.
 * This should be called when a new round is detected in game.js.
 */
export function resetRoundFlags() {
  setAppState({
    automationHasRunThisRound: false,
    checkpointHasRunThisRound: false,
  });
}

/**
 * Checks the game state and runs automation logic if conditions are met.
 * @param {object} roundData - The current parsed round data.
 * @param {number} secondsRemaining - The number of seconds left in the round.
 * @param {object} connection - The Solana connection object.
 */
export function runAutomationCheck(roundData, secondsRemaining, connection) {
  const {
    appMode,
    isSpeculating,
    customDeployAmount,
    automationHasRunThisRound
  } = getState();

  // 1. Check for exit conditions (Guard Clauses)
  if (appMode === APP_MODES.IDLE) {
    return; // Automation is disabled
  }

  if (secondsRemaining > AUTOMATION_TRIGGER_SECONDS || secondsRemaining <= 0) {
    return; // Not within the trigger time window
  }

  if (automationHasRunThisRound) {
    return; // Automation has already run for this round
  }

  // 2. Set flag and log trigger
  setAppState({ automationHasRunThisRound: true });
  log(`lfg: mode ${appMode} @ ${secondsRemaining}s`);

  // 3. Analyze the board for targets
  const analysis = analyzeBoardState(roundData);
  if (!analysis.bestEV) {
    log('no positive EV squares found, skipping');
    return;
  }

  // 4. Determine targets based on the current app mode
  let targets = [];
  switch (appMode) {
    case APP_MODES.ONE_X_EV:
      if (analysis.bestEV) {
        targets = [analysis.bestEV];
      }
      break;
    case APP_MODES.THREE_X_EV:
      targets = analysis.byEV.slice(0, 3);
      break;
    case APP_MODES.FIVE_X_EV:
      targets = analysis.byEV.slice(0, 5);
      break;
  }

  if (targets.length === 0) {
    log(`mode ${appMode} selected, but no valid targets found`);
    return;
  }

  // 5. Log actions and execute
  const action = isSpeculating ? 'SPECULATE' : 'EXECUTE';
  log(`deploying ${customDeployAmount} sol/target, ${customDeployAmount * targets.length} total`);

  for (const target of targets) {
    log(`auto target: #${target.id} (EV: ${target.ev.toFixed(4)} sol)`);
  }

  if (isSpeculating) {
    // We'll need to add logic to track stats for speculation mode later
    // @TODO
    log(`skipping deploy, speculate is on`);
  } else {
    // Execute the transaction
    const signer = getSigner();
    if (signer) {
      sendDeployTx(targets, connection, signer);
    } else {
      log('DEPLOY FAILED: keypair not loaded');
      log('make sure ~/.config/solana/id.json exists');
    }
  }
}
