/**
 * @file game.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Main game loop and real-time event handler for Lodestar.
 * This module subscribes to Solana account updates (Board and Round),
 * processes new on-chain data, triggers TUI updates, manages the
 * round-to-round transition (including winner display), and calls
 * the automation and checkpoint logic.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import BN from 'bn.js';
import { SOL_PER_LAMPORT, MS_PER_SLOT } from './constants.mjs';
import { getState, setAppState } from './state.mjs';
import { log, formatSol, playNotificationSound } from './utils.mjs';
import {
  getBoardPda,
  getRoundPda,
  parseBoard,
  parseRound,
  isSlotHashPopulated,
  calculateRng,
  getWinningSquare,
} from './solana.mjs';
import { computeEVStarForBlock, getOreValueInSOL } from './ev.mjs';
import { runAutomationCheck, resetRoundFlags } from './automation.mjs';
import { colors } from './theme.mjs';

// --- Module-level Variables ---
let tui;
let conn;
let walletSigner;

// --- SLOT CLOCK ---
let lastSyncedSlot = 0;
let lastSyncedTime = 0;
const SLOT_RESYNC_INTERVAL = 60000; // Re-fetch slot from RPC every 60s

/**
 * Estimates the current slot based on local time
 * @returns {Promise<number>} The estimated current slot.
 */
async function getOrEstimateSlot() {
  const now = Date.now();

  // If we have never synced, or it's been a minute, fetch real slot
  if (lastSyncedSlot === 0 || (now - lastSyncedTime > SLOT_RESYNC_INTERVAL)) {
    try {
      lastSyncedSlot = await conn.getSlot();
      lastSyncedTime = now;
      return lastSyncedSlot;
    } catch (e) {
      // If RPC fails, fallback to estimation based on last known data
      if (lastSyncedSlot === 0) return 0; // Startup fail
    }
  }

  // Calculate slots passed since last sync
  // Solana slots are ~400ms target
  const timeDiff = now - lastSyncedTime;
  const slotsPassed = Math.floor(timeDiff / MS_PER_SLOT);
  
  return lastSyncedSlot + slotsPassed;
}

// --- Local Utility ---
/**
 * Truncates a Solana address for cleaner display.
 * @param {string} address - The address string.
 * @returns {string} The truncated address (e.g., "AbC1...XyZ9").
 */
const truncateAddress = (address) => {
  if (typeof address !== 'string' || address.length < 8) {
    return address;
  }
  const firstFour = address.slice(0, 4);
  const lastFour = address.slice(-4);
  return `${firstFour}...${lastFour}`;
};

// --- TUI Update Functions ---

/**
 * Updates all TUI widgets with the latest round data.
 * @param {object} roundData - The parsed round data.
 */
function updateTUI(roundData) {
  const { gridWidgets, bestEVDisplay, statsLog, screen } = tui;

  // 1. Check for significant pool deltas (and play sound if needed)
  // This function is out of scope for the purpose of the app
  //checkPoolDelta(roundData);

  // 2. Calculate global EV parameters
  const T = Number(roundData.total_deployed.toString()) * SOL_PER_LAMPORT;
  const oreValueInSOL = getOreValueInSOL(roundData);

  // 3. Calculate Best EV
  let bestEV = { ev: -Infinity, id: -1 };
  const blockEVs = [];

  for (let i = 0; i < 25; i++) {
    const O = Number(roundData.deployed[i].toString()) * SOL_PER_LAMPORT;
    const { EV } = computeEVStarForBlock(O, T, oreValueInSOL);
    blockEVs.push(EV);
    if (isFinite(EV) && EV > bestEV.ev) {
      bestEV = { ev: EV, id: i + 1 };
    }
  }

  // 4. Update Best EV Display
  if (bestEV.id !== -1) {
    bestEVDisplay.setContent(`      best ev: {${colors.YELLOW}-fg}#${bestEV.id} (${formatSol(bestEV.ev)} sol){/${colors.YELLOW}-fg}`);
  } else {
    bestEVDisplay.setContent(`      best ev: {${colors.RED}-fg}n/a (all negative){/${colors.RED}-fg}`);
  }

  // 5. Gather All Square Data
  statsLog.setContent('');
  const ratios = [];
  const deployedValues = [];
  const countValues = [];

  for (let i = 0; i < 25; i++) {
    const countVal = Number(roundData.count[i].toString());
    const deployedVal = Number(roundData.deployed[i].toString());
    const sol = (deployedVal * SOL_PER_LAMPORT);
    const ratio = (countVal > 0) ? (sol / countVal) : Infinity;

    ratios.push({ id: i, ratio });
    deployedValues[i] = sol.toFixed(4);
    countValues[i] = countVal;

    // Reset border color
    gridWidgets[i].box.style.border.fg = colors.CREAM;
  }

  // 6. Calculate and Apply Ratio Highlighting
  const validRatios = ratios.filter(r => r.ratio < Infinity && r.ratio > 0).sort((a, b) => a.ratio - b.ratio);
  const top5Best = validRatios.slice(0, 5);
  const top5Worst = validRatios.slice(-5).reverse();

  top5Worst.forEach(r => { gridWidgets[r.id].box.style.border.fg = colors.RED; });
  top5Best.forEach(r => { gridWidgets[r.id].box.style.border.fg = colors.YELLOW; });

  // 7. Update Individual Grid Widgets and Stats Log
  for (let i = 0; i < 25; i++) {
    const solStr = deployedValues[i];
    const countVal = countValues[i];
    const ratio = (countVal > 0) ? (parseFloat(solStr) / countVal).toFixed(4) : 'N/A';

    // Update grid widget
    const widget = gridWidgets[i];
    widget.count.setContent(`P: ${countVal}`);
    widget.sol.setContent(`${solStr} SOL`);

    // Set EV value and color
    const evValue = blockEVs[i];
    let evColor = `{${colors.GREY}-fg}`;
    if (i + 1 === bestEV.id) evColor = `{${colors.GREEN}-fg}`;
    else if (evValue > 0) evColor = `{${colors.BLUE}-fg}`;
    else if (evValue < 0) evColor = `{${colors.RED}-fg}`;

    widget.ev.setContent(isFinite(evValue) ? `${evColor}${formatSol(evValue)}{/}` : `{${colors.GREY}-fg}0.0000{/${colors.GREY}-fg}`);

    // Update stats log
    const sq = ` #${(i + 1).toString().padStart(2, '0')}`;
    const pl = `{${colors.YELLOW}-fg}p{/${colors.YELLOW}-fg}: ${countVal.toString().padEnd(3)} `;
    const sl = `{${colors.YELLOW}-fg}sol{/${colors.YELLOW}-fg}: ${solStr} `;
    const rt = `{${colors.YELLOW}-fg}ratio{/${colors.YELLOW}-fg}: ${ratio}`;
    statsLog.log(`${sq} | ${pl} | ${sl} | ${rt}`);
  }

  // 8. Render TUI
  screen.render();
}

/**
 * Handles the logic for displaying the winner once the hash is populated.
 * @param {object} roundData - The round data containing the slot hash.
 * @param {string} roundIdStr - The round ID as a string.
 */
function displayWinner(roundData, roundIdStr) {
  const { lastWinnerDisplay, countdownTimer, screen } = tui;
  const { winnerAnnounced } = getState();

  // 1. Check if winner is already announced
  if (!winnerAnnounced) {
    // 2. Calculate winner
    const rng = calculateRng(roundData.slot_hash);
    const winner = getWinningSquare(rng) + 1;
    const winnerStr = winner.toString();

    // 3. Set app state
    setAppState({
      lastWinner: winnerStr,
      winnerAnnounced: true
    });

    // 4. Update TUI
    lastWinnerDisplay.setContent(`  last winner: {${colors.GREEN}-fg}#${winnerStr}{/${colors.GREEN}-fg}`);
    countdownTimer.setContent(`waiting...`);

    // 5. Log and """play sound"""
    playNotificationSound(`winner for round ${roundIdStr} is #${winnerStr}`);
    screen.render();
  }
}

// --- Main Game Loop & Event Handlers ---

// Timer to throttle the "Winner Check" polling so it doesn't run every second
let lastWinnerPollTime = 0;

/**
 * Updates the round countdown timer and handles end-of-round logic.
 * This function is called every second by setInterval.
 */
export async function updateCountdown() {
  const { countdownTimer, screen } = tui;
  const {
    currentBoardData,
    currentRoundData,
    currentRoundId,
    isTransitioningRound,
  } = getState();

  // 1. Handle "no board data" case
  if (!currentBoardData) {
    countdownTimer.setContent('round ends in: --:--');
    screen.render();
    return;
  }

  let countdownString;
  try {
    // 2. Get current slot and calculate remaining time
    const currentSlot = await getOrEstimateSlot();
    const endSlot = Number(currentBoardData.end_slot.toString());
    const slotsRemaining = endSlot - currentSlot;

    // 3. Handle Active Round
    if (slotsRemaining > 0) {
      const secondsRemaining = Math.floor(slotsRemaining * (MS_PER_SLOT / 1000));
      let mm = String(Math.floor(secondsRemaining / 60)).padStart(2, '0');
      if (mm > 1) mm = 1;
      const ss = String(secondsRemaining % 60).padStart(2, '0');
      countdownString = `{${colors.YELLOW}-fg}round ends in: ${mm}:${ss}{/${colors.YELLOW}-fg}`;

      setAppState({ winnerAnnounced: false });

      // Trigger automation check if conditions are met
      if (currentRoundData && !isTransitioningRound) {
        runAutomationCheck(currentRoundData, secondsRemaining, conn, walletSigner);
      }
    }
    // 4. Handle Ended Round
    else {
      const hashPopulated = currentRoundData ? isSlotHashPopulated(currentRoundData.slot_hash) : false;

      if (hashPopulated) {
        // 4a. Hash is available, display winner
        displayWinner(currentRoundData, currentRoundId.toString());
        countdownString = countdownTimer.content;
      } else {
        // 4b. Hash not yet populated, re-check account
        countdownString = `{${colors.GREY}-fg}waiting for next round...{/${colors.GREY}-fg}`;

        const now = Date.now();
        if (currentRoundId.gtn(-1) && (now - lastWinnerPollTime > 5000)) {
          lastWinnerPollTime = now;
          try {
            const roundPda = getRoundPda(currentRoundId);
            const roundAccountInfo = await conn.getAccountInfo(roundPda);
            if (roundAccountInfo) {
              const freshRoundData = parseRound(roundAccountInfo.data);
              setAppState({ currentRoundData: freshRoundData });
              if (isSlotHashPopulated(freshRoundData.slot_hash)) {
                updateTUI(freshRoundData);
                displayWinner(freshRoundData, currentRoundId.toString());
                countdownString = countdownTimer.content;
              }
            }
          } catch (e) {
            log(`error re-fetching round data: ${e.message}`);
          }
        }
      }
    }
  } catch (e) {
    // 5. Handle RPC error
    countdownString = `{${colors.RED}-fg}error fetching slot...{/${colors.RED}-fg}`;
  }

  // 6. Update TUI
  countdownTimer.setContent(countdownString);
  screen.render();
}

/**
 * Callback for processing Round account updates from the websocket.
 * @param {object} accountInfo - The raw account info from Solana.
 */
function processRoundUpdate(accountInfo) {
  try {
    const roundData = parseRound(accountInfo.data);
    setAppState({ currentRoundData: roundData });
    updateTUI(roundData);

    // If the hash just populated, display winner immediately
    if (isSlotHashPopulated(roundData.slot_hash)) {
       displayWinner(roundData, getState().currentRoundId.toString());
    }
  } catch (e) {
    log(`error parsing Round update: ${e.message}`);
  }
}

/**
 * Fetches the final state of a round and displays the winner.
 * Called during the round transition.
 * @param {BN} roundId - The ID of the round to finalize.
 */
async function finalizeOldRound(roundId) {
  log(`fetching final data for old round ${roundId.toString()}...`);
  try {
    const oldRoundPda = getRoundPda(roundId);
    const oldRoundAccountInfo = await conn.getAccountInfo(oldRoundPda);
    if (oldRoundAccountInfo) {
      const oldRoundData = parseRound(oldRoundAccountInfo.data);
      setAppState({ currentRoundData: oldRoundData });
      updateTUI(oldRoundData);

      if (isSlotHashPopulated(oldRoundData.slot_hash)) {
        displayWinner(oldRoundData, roundId.toString());
      } else {
        log(`no winner hash found for round ${roundId.toString()}`);
      }
    }
  } catch (e) {
    log(`error fetching final old round data: ${e.message}`);
  }
}

/**
 * Callback for processing Board account updates from the websocket.
 * This is the main driver of the application's state.
 * @param {object} accountInfo - The raw account info from Solana.
 */
async function processBoardUpdate(accountInfo) {
  try {
    // 1. Parse board data
    const boardData = parseBoard(accountInfo.data);
    setAppState({ currentBoardData: boardData });

    // 2. Check if a new round has started
    const newRoundId_BN = new BN(boardData.round_id.toString());
    const { currentRoundId, roundSubscriptionId } = getState();

    // 3. Handle New Round Transition
    if (newRoundId_BN.gt(currentRoundId) && currentRoundId.gtn(-1)) {
      setAppState({ isTransitioningRound: true });

      // 3a. Finalize and display winner for the round that just ended
      await finalizeOldRound(currentRoundId);

      setAppState({ isTransitioningRound: false });
    }

    // 4. Handle No Round Change (data update for current round)
    if (newRoundId_BN.eq(currentRoundId)) {
      const roundPda = getRoundPda(currentRoundId);

      if (!getState().currentRoundData) {
        const roundAccountInfo = await conn.getAccountInfo(roundPda);
        if (roundAccountInfo) processRoundUpdate(roundAccountInfo);
      }
      return;
    }

    // 5. Set Up New Round (executes only on the first update of a new round)
    resetRoundFlags();
    setAppState({
      currentRoundId: newRoundId_BN,
      currentRoundData: null,
      winnerAnnounced: false
    });

    // 5a. Unsubscribe from old round listener
    if (roundSubscriptionId) {
      try {
        await conn.removeAccountChangeListener(roundSubscriptionId);
      } catch (e) { /* ignore */ }
    }

    // 5b. Subscribe to new round
    const roundPda = getRoundPda(newRoundId_BN);
    log(`current round: ${newRoundId_BN.toString()} - ${truncateAddress(roundPda.toBase58())}`);

    const newSubscriptionId = conn.onAccountChange(
      roundPda,
      processRoundUpdate,
      'confirmed'
    );

    setAppState({ roundSubscriptionId: newSubscriptionId });

    // 5c. Fetch initial data for the new round
    const roundAccountInfo = await conn.getAccountInfo(roundPda);
    if (roundAccountInfo) {
      processRoundUpdate(roundAccountInfo);
    }
  } catch (e) {
    log(`error in processing board update: ${e.message}`);
    setAppState({ isTransitioningRound: false });
  }
}

/**
 * Starts the main game loop and subscriptions.
 * @param {Connection} connection - The Solana connection object.
 * @param {object} tuiWidgets - The object containing all TUI widgets.
 */
export async function startGameLoop(connection, signer, tuiWidgets) {
  // 1. Set module-level variables
  tui = tuiWidgets;
  conn = connection;
  walletSigner = signer;

  // 2. Subscribe to Board account
  const boardPda = getBoardPda();
  log(`applying board: ${truncateAddress(boardPda.toBase58())}`);

  conn.onAccountChange(
    boardPda,
    (accountInfo) => processBoardUpdate(accountInfo),
    'confirmed'
  );

  // 3. Fetch initial board data to start the loop
  const initialBoardInfo = await conn.getAccountInfo(boardPda);
  if (!initialBoardInfo) {
    throw new Error("failed to fetch initial Board account.");
  }
  await processBoardUpdate(initialBoardInfo);
}
