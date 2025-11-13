/**
 * @file utils.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description A collection of shared utility functions used across the app.
 * Includes the TUI logger (`log`), a fatal error handler (`handleFatalError`),
 * the notification sound player, and various string/number formatting
 * functions like `formatSol` and `truncateAddress`.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import { SOUND_COOLDOWN_MS } from './constants.mjs';
import { getState, setAppState } from './state.mjs';

// --- Module-level Variables ---

// TUI widgets injected from tui.mjs
let logWindow = null;
let screen = null;

// --- TUI & Logging ---

/**
 * Injects the TUI widgets needed by utility functions.
 * This is called from tui.js after the widgets are created.
 * @param {object} widgets - An object containing { logWindow, screen }.
 */
export function setUtilWidgets(widgets) {
  logWindow = widgets.logWindow;
  screen = widgets.screen;
}

/**
 * Logs a message to the TUI log window.
 * Falls back to console.log if TUI is not ready.
 * @param {string} message - The message to log.
 */
export function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  if (logWindow && screen) {
    logWindow.log(`[${timestamp}] ${message}`);
    screen.render();
  } else {
    console.log(`[${timestamp}] ${message}`);
  }
}

// --- Error Handling ---

/**
 * Destroys the TUI, logs a fatal error to the console, and exits the application.
 * This is for unrecoverable errors, typically during transactions.
 * @param {Error} error - The error object.
 */
export function handleFatalError(error, chainLogs = '') {
  // 1. Destroy TUI to return to a clean console
  if (screen) {
    screen.destroy();
  }

  // 2. Log detailed error information
  console.error(`[${new Date().toLocaleTimeString()}] CRITICAL TRANSACTION FAILED`);
  console.error('\n--- ERROR MESSAGE ---');
  console.error(error.message);

  if (error.logs) {
    console.error('\n--- TRANSACTION LOGS ---');
    error.logs.forEach(logLine => console.error(`  ${logLine}`));
  }

  console.error('\n--- FULL STACK TRACE ---');
  console.error(error.stack);

  console.error('\n--- ON CHAIN ---');
  console.error(chainLogs);

  // 3. Exit the process
  process.exit(1);
}

// --- Helpers ---

/**
 * Plays a notification sound (terminal bell) if not on cooldown and audio is enabled.
 * @param {string} message - A message to log when the sound plays.
 */
export function playNotificationSound(message) {
  const now = Date.now();
  const { lastSoundTime, isAudioEnabled } = getState();

  // 1. Check cooldown
  if (now - lastSoundTime < SOUND_COOLDOWN_MS) {
    return;
  }

  // 2. Update cooldown timestamp
  setAppState({ lastSoundTime: now });

  // 3. Play sound if enabled
  if (isAudioEnabled) {
    process.stdout.write('\x07'); // Standard terminal bell
  }

  // 4. Log the associated message
  log(message);
}

/**
 * Formats a number as a SOL value string with a sign (e.g., "+0.1234").
 * @param {number} x - The number to format.
 * @returns {string} The formatted SOL string.
 */
export function formatSol(x) {
  const abs = Math.abs(x);
  const sign = x >= 0 ? '+' : '-';
  if (abs < 0.0001) return '0.0000';
  return `${sign}${abs.toFixed(4)}`;
}

/**
 * Truncates a string address for display.
 * @param {string} address - The address string to truncate.
 * @returns {string} The truncated address (e.g., "AbC1...XyZ9").
 */
export const truncateAddress = (address) => {
  if (typeof address !== 'string' || address.length < 8) {
    return address;
  }
  const firstFour = address.slice(0, 4);
  const lastFour = address.slice(-4);
  return `${firstFour}...${lastFour}`;
};
