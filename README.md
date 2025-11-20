# 🌟lodestar-cli


> gm gm, lets mine & shine


![](screenshot.png)


**lodestar-cli** is a sophisticated, terminal-based (TUI) automation bot for the ORE v3 blockchain game on Solana. It provides a real-time dashboard of the entire game board, calculates Expected Value (EV) for all 25 squares, and automatically deploys SOL to the most profitable squares based on your chosen strategy.

The bot uses a self-contained wallet system, automatic reward claiming, and anytime cash-out functionality to easily secure your profits.

-----

## Features

  * **Zero Admin Fee:** The dev is starving, please donate oREVE663st4oVqRp31TdEKdjqUYmZkJ3Vofi1zEAPro (Solana)
  * **Real-time TUI Dashboard:** Monitor all 25 game squares, player counts, and real-time EV. Now includes live tracking of the bots **Miner PDA stats** (Claimable SOL, Unrefined ORE, Refined ORE).
  * **Advanced EV Calculation:** Continuously calculates the per-square Expected Value (EV) to identify profitable deployment opportunities.
  * **Intelligent Grid Highlighting:**
      * **Ratio (Border):** The top 5 **best** squares (lowest SOL/player) are **yellow**. The 5 **worst** are **red**.
      * **EV (Text):** The best EV square is **green**, positive EV is **blue**, and negative EV is **red**.
  * **Automated EV-Based Deployment:** Automatically executes transactions in the final seconds of a round based on your selected risk profile.
  * **Smart Automation Modes:**
      * **`1x EV`**: Deploys to the single best positive-EV square.
      * **`3x EV`**: Deploys to the top 3 best positive-EV squares.
      * **`5x EV`**: Deploys to the top 5 best positive-EV squares.
  * **Speculation Mode:** Run the bot in a "dry run" mode. It logs all potential moves without spending a single lamport.
  * **Ephemeral Wallet System:** Automatically generates a local `id.json` keypair if one doesn't exist. No need to install global Solana CLI tools or mess with paths.
  * **Auto-Claiming:** Automatically claims pending SOL rewards from the Miner PDA every 30 minutes (if above a minimum threshold).
  * **One-Click Cash Out:** A built-in "Cash Out" function that claims all pending rewards, aggregates them with your wallet balance, and sends the total SOL to a destination address of your choice.
  * **Real-time Price Tracking:** Pulls live ORE/SOL/USD prices from DexScreener.

-----

## Prerequisites

1.  **Node.js:** You must have Node.js (v18 or newer) installed.
2.  **SOL:** You need an amount of SOL to fund the bot's operation.

-----

## Installation & Running

1.  **Download the Code:**
    Download or clone this repository.

    ```sh
    git clone https://github.com/Radiants-DAO/lodestar-cli.git
    cd lodestar-cli
    ```

2.  **Install Dependencies:**

    ```sh
    npm install
    ```

3.  **Run the Application:**

    ```sh
    npm run start
    ```

-----

## Bot Setup

**lodestar-cli** uses a local wallet file (`id.json`) located in the root of the application folder.

1.  **First Run (Generation):**
    Run `npm run start`. If the app cannot find an `id.json` in the current directory, it will:

      * Generate a new secure keypair.
      * Save it as `id.json`.
      * **Display the new Public Key (Address).**
      * Exit the application.

2.  **Funding:**
    Copy the address displayed in the terminal and send SOL to it (enough to cover your desired deploy amounts + gas fees).

3.  **Start Mining:**
    Run `npm run start` again. The app will detect the wallet, check the balance, and launch the TUI.

*Note: If you want to use an existing Solana CLI wallet, simply copy your `id.json` file into the root of the `lodestar-cli` folder.*

-----

## How to Use lodestar-cli

### The TUI Layout

  * **Game Board (Left):** A 5x5 grid showing all 25 squares. Each square displays its ID (`#1` - `#25`), player count (`P: 10`), deployed SOL, and real-time EV.
  * **Stats (Top-Right):**
      * **Timer:** Countdown to round end.
      * **Last Winner:** The winning square from the previous round.
      * **Wallet:** Your current bot wallet balance.
      * **Miner Stats:** Shows **Claimable SOL** (rewards sitting in the PDA), **Unrefined ORE**, and **Refined ORE**.
      * **Prices:** Live ORE/SOL prices and ratio.
      * **Best EV:** The single best square to deploy to right now.
  * **Logs (Bottom-Left):** Shows all activity: automation triggers, transaction signatures, errors, and status updates.
  * **Controls (Bottom-Right):** Current settings (Mode, Speculation status) and available keybinds.

### Controls (Keybinds)

  * **`0`**: Set mode to **IDLE** (Stops all automation).
  * **`1`**: Set mode to **1x EV** (Deploys to the single best square).
  * **`2`**: Set mode to **3x EV** (Deploys to the top 3 squares).
  * **`3`**: Set mode to **5x EV** (Deploys to the top 5 squares).
  * **`S`**: Toggle **Speculation Mode** (Dry Run) ON / OFF.
  * **`A`**: Toggle **Audio Alerts** ON / OFF.
  * **`D`**: Set custom **Deploy Amount**. Enter the amount of SOL to deploy *per target*.
  * **`C`**: **Cash Out**. Opens a prompt for a destination address.
      * *Logic:* Claims pending SOL from the Miner PDA -\> Waits for confirmation -\> Sends entire wallet balance to the address provided.
  * **`Q` / `Ctrl+C`**: Quit the application.

-----

## 🚀 Future Development

lodestar-cli is actively being developed. Upcoming features include:

  * **Headless / Background Mode:**

      * Implementation of a `--headless` flag for usage with process managers like `pm2`.
      * Command-line arguments for configuration (e.g., `--method 3x --amount 0.001`).

  * **Swarm Logic:**

      * Coordination between multiple instances of lodestar-cli to optimize board coverage.

-----

## ⚠️ Disclaimer

**This is an automation tool for a blockchain application. Use it entirely at your own risk.**

This software interacts with a live blockchain and spends real SOL. The developer(s) of lodestar-cli are not responsible for any financial losses incurred from using this tool.

**Security Note:** Your `id.json` is stored unencrypted in the application folder. Do not share this file. If running on a VPS, ensure your server is secured.
