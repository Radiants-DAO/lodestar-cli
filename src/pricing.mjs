/**
 * @file pricing.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Handles all external price fetching from DexScreener.
 * This module periodically calls the DexScreener API to get the
 * current USD prices for ORE and SOL, calculates the ORE/SOL ratio,
 * and updates the global state and TUI with the new values.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import fetch from 'node-fetch';
import { ORE_TOKEN_ADDRESS, SOL_TOKEN_ADDRESS } from './constants.mjs';
import { setAppState } from './state.mjs';
import { log } from './utils.mjs';
import { colors } from './theme.mjs';

// --- Private Functions ---

/**
 * Fetches the USD price for a given token address from DexScreener.
 * @param {string} tokenAddress - The mint address of the token.
 * @returns {Promise<number>} The price in USD, or 0 if an error occurs.
 */
async function fetchPrice(tokenAddress) {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
    const data = await response.json();

    if (data && data.pairs && data.pairs.length > 0) {
      // Find the pair with the highest 24h volume for the most reliable price
      const bestPair = data.pairs.reduce((best, pair) => {
        const volume = parseFloat(pair.volume?.h24 || 0);
        const bestVolume = parseFloat(best.volume?.h24 || 0);
        return volume > bestVolume ? pair : best;
      });
      return parseFloat(bestPair.priceUsd);
    }
  } catch (e) {
    log(`error fetching price for ${tokenAddress}: ${e.message}`);
  }
  // Return 0 if API fails or no pairs are found
  return 0;
}

// --- Public Functions ---

/**
 * Updates all token prices, calculates the ORE/SOL ratio, and updates the TUI.
 * This function is called on startup and then on a set interval.
 * @param {object} tuiWidgets - The object containing all TUI widgets.
 */
export async function updatePrices(tuiWidgets) {
  const { orePriceDisplay, solPriceDisplay, oreSolRatioDisplay, screen } = tuiWidgets;

  // 1. Fetch prices from the API
  const oreUsd = await fetchPrice(ORE_TOKEN_ADDRESS);
  const solUsd = await fetchPrice(SOL_TOKEN_ADDRESS);

  let oreSolRatio = 0;

  // 2. Update TUI widgets with new prices
  if (oreUsd > 0) {
    orePriceDisplay.setContent(`ore price: {${colors.YELLOW}-fg}$${oreUsd.toFixed(4)}{/${colors.YELLOW}-fg}`);
  }
  if (solUsd > 0) {
    solPriceDisplay.setContent(`sol price: {${colors.YELLOW}-fg}$${solUsd.toFixed(2)}{/${colors.YELLOW}-fg}`);
  }
  if (oreUsd > 0 && solUsd > 0) {
    oreSolRatio = oreUsd / solUsd;
    oreSolRatioDisplay.setContent(`ore/sol: {${colors.YELLOW}-fg}${oreSolRatio.toFixed(6)}{/${colors.YELLOW}-fg}`);
  }

  // 3. Update the global app state
  setAppState({
    PRICE_ORE_USD: oreUsd,
    PRICE_SOL_USD: solUsd,
    priceOreSol: oreSolRatio,
  });

  // 4. Render the screen
  screen.render();
}
