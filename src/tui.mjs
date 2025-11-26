/**
 * @file tui.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Manages the Terminal User Interface (TUI) using 'blessed'.
 * This file is responsible for creating, laying out, and styling all
 * blessed widgets (the game board grid, stats window, log window,
 * and controls panel). It also handles all user keypress events
 * for controlling the application.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import blessed from 'blessed';
import { APP_MODES } from './constants.mjs';
import {
  getState,
  setAppMode,
  toggleSpeculate,
  toggleAudio,
  setCustomDeployAmount,
} from './state.mjs';
import { colors } from './theme.mjs';
import { log } from './utils.mjs';
import { getSigner } from './wallet.mjs';
import { getConnection } from './solana.mjs';
import { executeFullCashOut } from './transactions.mjs';

// --- Module-level Variables ---
let controlsWindow;

// --- TUI Components ---

/**
 * Creates a popup prompt for Cash Out (entering destination address).
 * @param {blessed.screen} screen - The main blessed screen.
 */
function showCashOutPrompt(screen) {
  // 1. Create the Form
  const form = blessed.form({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 9,
    border: 'line',
    style: { border: { fg: colors.GREEN } }, // Green for Money/Cash out
    label: ' cash out ',
    tags: true,
    keys: true,
  });

  // 2. Create the Label
  const label = blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'destination address (right click to paste):',
  });

  // 3. Create the Text Input
  const input = blessed.textbox({
    parent: form,
    name: 'address',
    top: 3,
    left: 2,
    right: 2,
    height: 1,
    bg: colors.BLACK,
    fg: colors.CREAM,
    style: {
      focus: {
        bg: colors.BLACK,
        fg: colors.CREAM,
      },
    },
    inputOnFocus: true,
  });

  // 4. Add Help Text
  blessed.text({
    parent: form,
    bottom: 1,
    left: 2,
    tags: true,
    content: '(enter = confirm, esc = cancel)',
  });

  // 5. Append to screen and focus
  screen.append(form);
  input.focus();
  screen.render();

  // 6. Event Listeners
  input.on('submit', () => form.submit());
  input.on('cancel', () => form.cancel());

  form.on('submit', async (data) => {
    const address = data.address.trim();
    
    // Basic validation (Solana addresses are usually 32-44 chars)
    if (address.length >= 32 && address.length <= 44) {
      log(`{${colors.GREEN}-fg}CASH OUT INITIATED{/${colors.GREEN}-fg}`);
      log(`Destination Wallet: ${address}`);

      // 1. Set to IDLE mode to stop all new bets
      log('switching to IDLE mode...');
      setAppMode(APP_MODES.IDLE);
      updateControlsWindow(); // Update controls UI to show IDLE
      screen.render();

      // 2. Get connection and signer
      const connection = getConnection();
      const signer = getSigner();
      
      if (connection && signer) {
        // 3. Run the full sequence (don't await, so UI closes)
        executeFullCashOut(address, connection, signer);
      } else {
        log('cash out ERROR: connection or signer not found');
      }

      form.destroy();
    } else {
      label.setContent('invalid address. try again:');
      form.style.border.fg = colors.RED;
      screen.render();
      input.focus();
    }
  });

  form.on('cancel', () => {
    form.destroy();
    screen.render();
  });
}

/**
 * Creates a popup prompt for setting the deploy amount.
 * @param {blessed.screen} screen - The main blessed screen.
 */
function showDeployAmountPrompt(screen) {
  // 1. Create the Form
  const form = blessed.form({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 9,
    border: 'line',
    style: { border: { fg: colors.YELLOW } },
    label: 'set deploy amount',
    tags: true,
    keys: true,
  });

  // 2. Create the Label
  const label = blessed.text({
    parent: form,
    top: 1,
    left: 2,
    content: 'enter amount (sol):',
  });

  // 3. Create the Text Input
  const input = blessed.textbox({
    parent: form,
    name: 'amount',
    top: 3,
    left: 2,
    right: 2,
    height: 1,
    bg: colors.BLACK,
    fg: colors.CREAM,
    style: {
      focus: {
        bg: colors.BLACK,
        fg: colors.CREAM,
      },
    },
    inputOnFocus: true,
  });

  // 4. Add Help Text
  blessed.text({
    parent: form,
    bottom: 1,
    left: 2,
    tags: true,
    content: '(enter = save, esc = cancel)',
  });

  // 5. Append to screen and focus
  screen.append(form);
  input.focus();
  screen.render();

  // 6. Set up event listeners for the form
  input.on('submit', (value) => {
    form.submit();
  });

  input.on('cancel', () => {
    form.cancel();
  });

  form.on('submit', (data) => {
    const success = setCustomDeployAmount(data.amount);
    if (success) {
      // On success, update controls and close
      updateControlsWindow();
      form.destroy();
      screen.render();
    } else {
      // On failure, show an error message
      label.setContent('wtf? enter positive number:');
      form.style.border.fg = colors.RED;
      screen.render();
      input.focus();
    }
  });

  form.on('cancel', () => {
    form.destroy();
    screen.render();
  });
}

// --- TUI Updaters ---

/**
 * Updates the content of the controls window based on the current app state.
 */
function updateControlsWindow() {
  if (!controlsWindow) return;

  // 1. Get current state
  const { appMode, isSpeculating, isAudioEnabled, customDeployAmount } = getState();

  // 2. Determine colors and text
  const modeColor = appMode === APP_MODES.IDLE ? `${colors.RED}-fg` : `${colors.GREEN}-fg`;
  const speculateColor = isSpeculating ? `${colors.GREEN}-fg` : `${colors.RED}-fg`;
  const speculateText = isSpeculating ? 'ON' : 'OFF';
  const audioColor = isAudioEnabled ? `${colors.GREEN}-fg` : `${colors.RED}-fg`;
  const audioText = isAudioEnabled ? 'ON' : 'OFF';

  // 3. Build content string
  const content = ` [{${colors.YELLOW}-fg}0{/${colors.YELLOW}-fg}] idle | [{${colors.YELLOW}-fg}1{/${colors.YELLOW}-fg}] ${APP_MODES.ONE_X_EV} | [{${colors.YELLOW}-fg}2{/${colors.YELLOW}-fg}] ${APP_MODES.THREE_X_EV} | [{${colors.YELLOW}-fg}3{/${colors.YELLOW}-fg}] ${APP_MODES.FIVE_X_EV}
 [{${colors.YELLOW}-fg}4{/${colors.YELLOW}-fg}] ${APP_MODES.TWENTY_FIVE_X_EV}

 [{${colors.YELLOW}-fg}S{/${colors.YELLOW}-fg}]pectate: {${speculateColor}}${speculateText}{/${speculateColor}} | [{${colors.YELLOW}-fg}A{/${colors.YELLOW}-fg}]udio: {${audioColor}}${audioText}{/${audioColor}}
 [{${colors.YELLOW}-fg}D{/${colors.YELLOW}-fg}]eploy: {${colors.YELLOW}-fg}${customDeployAmount.toFixed(4)} sol{/${colors.YELLOW}-fg} | [{${colors.YELLOW}-fg}C{/${colors.YELLOW}-fg}]ash Out

 mode: {${modeColor}}${appMode}{/} | [{${colors.YELLOW}-fg}Q{/${colors.YELLOW}-fg}]uit`;

  // 4. Set content
  controlsWindow.setContent(content);
}

/**
 * Creates the 5x5 grid widgets inside the board window.
 * @param {blessed.box} boardWindow - The parent window for the grid.
 * @returns {Array<object>} - An array of grid widget objects.
 */
function createGrid(boardWindow) {
  const gridWidgets = [];

  // 1. Define grid dimensions (as percentages)
  const gridTotalWidth = 80;
  const gridTotalHeight = 80;
  const gridOffsetX = (100 - gridTotalWidth) / 2;
  const gridOffsetY = (100 - gridTotalHeight) / 2;
  const boxWidth = gridTotalWidth / 5;
  const boxHeight = gridTotalHeight / 5;

  // 2. Loop and create 25 squares
  for (let i = 0; i < 25; i++) {
    const row = Math.floor(i / 5);
    const col = i % 5;

    // 2a. Create the container box
    const box = blessed.box({
      parent: boardWindow,
      top: `${gridOffsetY + (row * boxHeight)}%`,
      left: `${gridOffsetX + (col * boxWidth)}%`,
      height: `${boxHeight}%`,
      width: `${boxWidth}%`,
      border: 'line',
      style: { border: { fg: colors.CREAM } }
    });

    // 2b. Create text elements inside the box
    const number = blessed.text({
      parent: box,
      top: 0,
      left: 1,
      content: `#${i + 1}`
    });

    const count = blessed.text({
      parent: box,
      top: 0,
      right: 1,
      content: 'P: 0'
    });

    const ev = blessed.text({
      parent: box,
      top: 'center',
      left: 'center',
      content: '',
      tags: true
    });

    const sol = blessed.text({
      parent: box,
      bottom: 0,
      left: 1,
      content: '0.0000 SOL'
    });

    gridWidgets.push({ box, number, count, sol, ev });
  }
  return gridWidgets;
}

// --- Event Handlers ---

/**
 * Sets up global key listeners for the application.
 * @param {blessed.screen} screen - The main blessed screen object.
 */
function setupKeyListeners(screen) {
  screen.on('keypress', (ch, key) => {
    let modeUpdated = false;

    // 1. Handle Quit Keys
    if (key.name === 'q' || (key.ctrl && key.name === 'c')) {
      return process.exit(0);
    }

    // 2. Ignore keypresses if a form is focused
    if (screen.focused && screen.focused.parent.type === 'form') {
      return;
    }

    // 3. Handle Main Controls
    switch (ch) {
      case '0':
        modeUpdated = setAppMode(APP_MODES.IDLE);
        break;
      case '1':
        modeUpdated = setAppMode(APP_MODES.ONE_X_EV);
        break;
      case '2':
        modeUpdated = setAppMode(APP_MODES.THREE_X_EV);
        break;
      case '3':
        modeUpdated = setAppMode(APP_MODES.FIVE_X_EV);
        break;
      case '4':
        modeUpdated = setAppMode(APP_MODES.TWENTY_FIVE_X_EV);
        break;
      case 's':
        toggleSpeculate();
        modeUpdated = true;
        break;
      case 'a':
        toggleAudio();
        modeUpdated = true;
        break;
      case 'd':
        showDeployAmountPrompt(screen);
        break;
      case 'c':
        showCashOutPrompt(screen);
        break;
    }

    // 4. Re-render if state changed
    if (modeUpdated) {
      updateControlsWindow();
      screen.render();
    }
  });
}

/**
 * Creates a popup warning for low balance.
 * Forces the user to acknowledge before using the app in spectate mode.
 * @param {blessed.screen} screen - The main blessed screen.
 * @param {string} address - The wallet address to display.
 */
export function showLowBalanceWarning(screen, address) {
  // 1. Create the Box
  const alertBox = blessed.box({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 60,
    height: 12,
    border: 'line',
    style: { border: { fg: colors.RED } },
    label: ' LOW BALANCE WARNING ',
    tags: true,
    keys: true, // Grab keys
    vi: true
  });

  // 2. Content
  const contentText = 
    `{center}Your wallet balance is too low to deploy.{/center}\n\n` +
    `{center}The app has been locked to {${colors.GREEN}-fg}SPECTATE MODE{/}.{/center}\n` +
    `{center}To play, send SOL to:{/center}\n\n` +
    `{center}{${colors.YELLOW}-fg}${address}{/}{/center}`;

  const text = blessed.text({
    parent: alertBox,
    top: 1,
    left: 2,
    right: 2,
    tags: true,
    content: contentText,
  });

  // 3. Instruction Footer
  blessed.text({
    parent: alertBox,
    bottom: 1,
    width: '100%',
    align: 'center',
    tags: true,
    content: '{gray-fg}(press [ENTER] to continue in spectate mode){/}',
  });

  // 4. Render and Focus
  screen.append(alertBox);
  alertBox.focus();
  screen.render();

  // 5. Handle Keypress to Close
  alertBox.key(['enter', 'escape', 'space'], () => {
    alertBox.destroy();
    screen.render();
  });
}

// --- Main TUI Initializer ---

/**
 * Initializes all TUI components and returns them.
 * @returns {object} - An object containing all blessed widgets.
 */
export function initTUI() {
  // 1. Create Screen
  const screen = blessed.screen({
    smartCSR: false,
    terminal: 'xterm-256color',
    fullUnicode: true,
    title: 'lodestar-cli', // Updated title
  });

  // 2. Create Main Layout Windows
  const boardWindow = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '60%',
    height: '80%',
    label: '',
    border: 'line',
    style: { border: { fg: colors.BLACK } }
  });

  const statsWindow = blessed.box({
    parent: screen,
    top: 0,
    left: '60%',
    width: '40%',
    height: '80%',
    label: 'stats',
    border: 'line',
    style: { border: { fg: colors.YELLOW } },
    tags: true
  });

  const logWindow = blessed.log({
    parent: screen,
    top: '80%',
    left: 0,
    width: '60%',
    height: '20%',
    label: 'logs',
    border: 'line',
    style: { border: { fg: colors.YELLOW } },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ' },
    mouse: true
  });

  controlsWindow = blessed.box({
    parent: screen,
    top: '80%',
    left: '60%',
    width: '40%',
    height: '20%',
    label: 'controls',
    border: 'line',
    style: { border: { fg: colors.YELLOW } },
    tags: true,
    content: 'loading controls...',
  });

  // 3. Create Widgets inside Stats Window
  let widgetTop = 0;
  const countdownTimer = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    height: 1,
    content: 'round ends in: --:--',
    tags: true
  });

  const lastWinnerDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    height: 1,
    content: '  last winner: --',
    tags: true
  });

  widgetTop++; // Add a spacer line

  const botBalanceDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    content: '   bot wallet: loading...',
    tags: true
  });

  const claimableSolDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    content: 'claimable sol: 0.0000',
    tags: true
  });
  
  const claimableOreDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    content: 'unrefined ore: 0.0000',
    tags: true
  });

  const refinedOreDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    content: '  refined ore: 0.0000',
    tags: true
  });

  widgetTop++; // Spacer

  const orePriceDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    height: 1,
    content: '    ore price: loading...',
    tags: true
  });

  const solPriceDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    height: 1,
    content: '    sol price: Loading...',
    tags: true
  });

  const oreSolRatioDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    height: 1,
    content: '      ore/sol: loading...',
    tags: true
  });

  const bestEVDisplay = blessed.text({
    parent: statsWindow,
    top: widgetTop++,
    left: 1,
    height: 1,
    content: '      best EV: --',
    tags: true
  });

  widgetTop++; // Add a spacer line
  const statsLog = blessed.log({
    parent: statsWindow,
    top: widgetTop,
    left: 0,
    right: 0,
    bottom: 0,
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: ' ' },
    mouse: true
  });

  // 4. Create Grid inside Board Window
  const gridWidgets = createGrid(boardWindow);

  // 5. Setup Listeners and Initial State
  setupKeyListeners(screen);
  updateControlsWindow();

  screen.on('resize', () => {
    screen.render();
  });

  // 6. Initial Render
  screen.render();

  // 7. Return all widgets
  return {
    screen,
    boardWindow,
    statsWindow,
    logWindow,
    controlsWindow,
    countdownTimer,
    lastWinnerDisplay,
    botBalanceDisplay,
    claimableSolDisplay,
    claimableOreDisplay,
    refinedOreDisplay,
    orePriceDisplay,
    solPriceDisplay,
    oreSolRatioDisplay,
    bestEVDisplay,
    statsLog,
    gridWidgets,
  };
}
