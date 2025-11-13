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
import { ORE_TOKEN_ADDRESS, SOL_TOKEN_ADDRESS, SOL_PER_LAMPORT } from './constants.mjs';
import { getState, setAppState } from './state.mjs';
import { log } from './utils.mjs';
import { colors } from './theme.mjs';
import { getMinerPda, parseMiner } from './solana.mjs';

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

export async function updateMinerStats(connection, signer, tuiWidgets) {
  if (!signer) return;

  try {
    const minerPda = getMinerPda(signer.publicKey);
    const accountInfo = await connection.getAccountInfo(minerPda);

    if (accountInfo) {
      const minerData = parseMiner(accountInfo.data);

      // 1. Parse Values (BigInt -> Number/String)
      const rewardsSol = Number(minerData.rewards_sol) * SOL_PER_LAMPORT;
      
      // ORE uses 11 decimals
      const ORE_DIVISOR = 100_000_000_000;
      
      const rewardsOre = Number(minerData.rewards_ore) / ORE_DIVISOR;
      const refinedOre = Number(minerData.refined_ore) / ORE_DIVISOR;

      // 2. Update State
      setAppState({
        minerRewardsSol: rewardsSol,
        minerRewardsOre: rewardsOre,
        minerRefinedOre: refinedOre,
      });

      // 3. Update TUI Widgets
      const { 
        botBalanceDisplay, 
        claimableSolDisplay, 
        claimableOreDisplay, 
        refinedOreDisplay 
      } = tuiWidgets;
      
      const { userBalance } = getState();

      if (botBalanceDisplay) 
        botBalanceDisplay.setContent(`   bot wallet: {${colors.GREEN}-fg}${userBalance.toFixed(4)}{/}`);
      
      if (claimableSolDisplay) 
        claimableSolDisplay.setContent(`claimable sol: {${colors.YELLOW}-fg}${rewardsSol.toFixed(4)}{/}`);
      
      if (claimableOreDisplay) 
        claimableOreDisplay.setContent(`unrefined ore: {${colors.YELLOW}-fg}${rewardsOre.toFixed(4)}{/}`);
      
      if (refinedOreDisplay) 
        refinedOreDisplay.setContent(`  refined ore: {${colors.BLUE}-fg}${refinedOre.toFixed(4)}{/}`);
    }
  } catch (e) {
    log(`error updating miner stats: ${e.message}`);
  }
}

// --- Public Functions ---

/**
 * Updates all token prices, calculates the ORE/SOL ratio, and updates the TUI.
 * This function is called on startup and then on a set interval.
 * @param {Connection} connection - The Solana connection object.
 * @param {Keypair} signer - The user's loaded keypair.
 * @param {object} tuiWidgets - The object containing all TUI widgets.
 */
export async function updatePrices(connection, signer, tuiWidgets) {
  const { orePriceDisplay, solPriceDisplay, oreSolRatioDisplay, screen } = tuiWidgets;

  // 1. Fetch prices from the API
  const oreUsd = await fetchPrice(ORE_TOKEN_ADDRESS);
  const solUsd = await fetchPrice(SOL_TOKEN_ADDRESS);

  let oreSolRatio = 0;

  // 2. Update TUI widgets with new prices
  if (oreUsd > 0) {
    orePriceDisplay.setContent(`    ore price: {${colors.YELLOW}-fg}$${oreUsd.toFixed(4)}{/${colors.YELLOW}-fg}`);
  }
  if (solUsd > 0) {
    solPriceDisplay.setContent(`    sol price: {${colors.YELLOW}-fg}$${solUsd.toFixed(2)}{/${colors.YELLOW}-fg}`);
  }
  if (oreUsd > 0 && solUsd > 0) {
    oreSolRatio = oreUsd / solUsd;
    oreSolRatioDisplay.setContent(`      ore/sol: {${colors.YELLOW}-fg}${oreSolRatio.toFixed(6)}{/${colors.YELLOW}-fg}`);
  }

  // 3. Update the global app state
  setAppState({
    PRICE_ORE_USD: oreUsd,
    PRICE_SOL_USD: solUsd,
    priceOreSol: oreSolRatio,
  });

  // 4. Fetch Miner Stats
  await updateMinerStats(connection, signer, tuiWidgets);

  // 5. Render the screen
  screen.render();
}
