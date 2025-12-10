/**
 * @file ev.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Core mathematical models for calculating Expected Value (EV).
 * Implements the `computeEVStarForBlock` function, which is the heart
 * of the bot's decision-making. It also includes functions for
 * calculating the total ORE value and checking for large pool deltas.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import {
  SOL_PER_LAMPORT,
  PROTOCOL_CUT,
  C,
  P_WIN,
  ADMIN_COST_FACTOR,
  HIT_PROB,
  REF_MULT,
  DELTA_THRESHOLD_SOL
} from './constants.mjs';
import { getState } from './state.mjs';
import { playNotificationSound } from './utils.mjs';

// --- Public Functions ---

/**
 * Computes the optimal deployment (y*) and the resulting EV for a single square.
 * @param {number} O - SOL deployed by others in the square.
 * @param {number} T - Total SOL deployed in all squares.
 * @param {number} oreValueInSOL - The calculated value of ORE rewards in SOL.
 * @returns {object} An object containing { y: optimal_deployment, EV: expected_value }.
 */
export function computeEVStarForBlock(O, T, oreValueInSOL) {
  // 1. Guard Clauses for invalid or non-positive inputs
  if (!isFinite(O) || O <= 0) return { y: 0, EV: -Infinity };
  if (!isFinite(T) || T <= 0) return { y: 0, EV: -Infinity };

  // 2. Calculate initial V (Value)
  const V_initial = (1 - PROTOCOL_CUT) * (T - O) + oreValueInSOL;
  if (V_initial <= 0) return { y: 0, EV: -Infinity };

  // 3. Iteratively refine y* (optimal deployment)
  let yStar = Math.sqrt((oreValueInSOL * O) / C);
  let V = V_initial;

  for (let i = 0; i < 3; i++) {
    V = (1 - PROTOCOL_CUT) * (T - O - yStar) + oreValueInSOL;
    if (V <= 0) break;
    yStar = Math.max(0, Math.sqrt((V * O) / C) - O);
  }

  if (yStar <= 0) return { y: 0, EV: 0 };

  // 4. Final EV Calculation
  const f = yStar / (O + yStar); // Player's fraction of the square
  const adminCost = ADMIN_COST_FACTOR * yStar;
  const EV = P_WIN * (-24 * yStar + V * f) - adminCost;

  return { y: yStar, EV };
}

/**
 * Calculates the total ORE value for the EV computation.
 * @param {object} roundData - The parsed round data.
 * @returns {number} The value of ORE rewards in SOL.
 */
export function getOreValueInSOL(roundData) {
  const { priceOreSol } = getState();

  // Adjust motherlode units
  const M = Number(roundData.motherlode.toString()) * (1 / 10 ** 11);

  // Use a default of 0.2 if motherlode isn't populated
  const expectedMotherlodeOREThisRound = (M != null && isFinite(M))
    ? (M * HIT_PROB)
    : (0.2 * HIT_PROB);

  return priceOreSol * REF_MULT * (1 + expectedMotherlodeOREThisRound);
}

/**
 * Checks for a significant delta between the max and min pools and plays a sound if found.
 * @param {object} roundData - The parsed round data.
 */
export function checkPoolDelta(roundData) {
  // 1. Get all pool values in SOL
  const pools = roundData.deployed.map(d => Number(d.toString()) * SOL_PER_LAMPORT);

  let minPool = { value: Infinity, id: -1 };
  let maxPool = { value: -Infinity, id: -1 };

  // 2. Find the min and max non-zero pools
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];

    // Only consider pools with a positive amount of SOL
    if (isFinite(pool) && pool > 0) {
      if (pool < minPool.value) {
        minPool = { value: pool, id: i + 1 };
      }
      if (pool > maxPool.value) {
        maxPool = { value: pool, id: i + 1 };
      }
    }
  }

  // 3. Check for exit condition (e.g., no pools found)
  if (minPool.id === -1 || maxPool.id === -1) {
    return;
  }

  // 4. Compare delta and play sound if over threshold
  const delta = maxPool.value - minPool.value;

  if (delta >= DELTA_THRESHOLD_SOL) {
    const logMessage = `pool delta ${delta.toFixed(4)} (max: #${maxPool.id} @ ${maxPool.value.toFixed(4)}, min: #${minPool.id} @ ${minPool.value.toFixed(4)})`;
    playNotificationSound(logMessage);
  }
}
