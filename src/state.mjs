/**
 * @file state.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Global in-memory state manager for the application.
 * Provides `getState` and `setAppState` functions to centrally
 * manage all dynamic data, such as the current automation mode,
 * price info, round data, and UI-related flags. Also contains
 * the setters for user-controlled settings.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import BN from 'bn.js';
import { APP_MODES } from './constants.mjs';

// --- Global State Object ---

/**
 * The single source of truth for the application's runtime state.
 * DO NOT MODIFY this object directly. Use `setAppState` instead.
 */
const appState = {
  // --- User-configurable Settings ---
  appMode: APP_MODES.IDLE,
  isSpeculating: false,
  isAudioEnabled: false,
  customDeployAmount: 0.0001,

  // --- Wallet & User Data ---
  userBalance: 0,
  minerRewardsSol: '0',
  minerRewardsOre: '0',
  minerRefinedOre: '0',

  // --- Real-time Price Data ---
  PRICE_ORE_USD: 0,
  PRICE_SOL_USD: 0,
  priceOreSol: 0,

  // --- On-Chain Game State ---
  currentRoundId: new BN(-1),
  currentBoardData: null,
  currentRoundData: null,

  // --- Internal TUI & Loop Flags ---
  lastSoundTime: 0,
  isTransitioningRound: false,
  checkpointHasRunThisRound: false,
  automationHasRunThisRound: false,
  winnerAnnounced: false,
  lastWinner: '--',
  roundSubscriptionId: null,
};

// --- Core State Functions ---

/**
 * Gets the current application state.
 * @returns {object} The app state object.
 */
export function getState() {
  return appState;
}

/**
 * Updates one or more properties of the app state.
 * @param {object} newState - An object with properties to update.
 */
export function setAppState(newState) {
  Object.assign(appState, newState);
}

// --- TUI-Controlled Setters ---

/**
 * Sets the application's automation mode.
 * @param {string} mode - The new mode (should be one of APP_MODES).
 * @returns {boolean} True if the mode was valid and set.
 */
export function setAppMode(mode) {
  if (Object.values(APP_MODES).includes(mode)) {
    appState.appMode = mode;
    return true;
  }
  return false;
}

/**
 * Toggles the spectation (dry run) mode.
 * @returns {boolean} The new spectation state.
 */
export function toggleSpeculate() {
  appState.isSpeculating = !appState.isSpeculating;
  return appState.isSpeculating;
}

/**
 * Toggles the audio notification state.
 * @returns {boolean} The new audio state.
 */
export function toggleAudio() {
  appState.isAudioEnabled = !appState.isAudioEnabled;
  return appState.isAudioEnabled;
}

/**
 * Sets the custom deploy amount from a string input.
 * @param {string} amountStr - The amount as a string from the input.
 * @returns {boolean} True if the save was successful.
 */
export function setCustomDeployAmount(amountStr) {
  const amount = parseFloat(amountStr);

  // Validate that the new amount is a positive number
  if (!isNaN(amount) && amount > 0) {
    appState.customDeployAmount = amount;
    return true;
  }
  return false;
}
