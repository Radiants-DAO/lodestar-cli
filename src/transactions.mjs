/**
 * @file transactions.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Handles the construction and sending of all Solana transactions.
 * This module builds the `sendDeployTx` and `sendCheckpointTx` instructions,
 * complete with the necessary accounts and data buffers (like the bitmask
 * for deployments), signs them with the user's wallet, and sends them
 * to the network.
 * @project lodestar-cli
 * @license MIT
 */

// --- Imports ---
import {
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  SystemProgram,
  ComputeBudgetProgram,
  PublicKey,
} from '@solana/web3.js';
import BN from 'bn.js';

import { getState } from './state.mjs';
import { log, handleFatalError } from './utils.mjs';
import {
  ORE_PROGRAM_ID,
  SOL_PER_LAMPORT,
  SYSTEM_PROGRAM_ID,
} from './constants.mjs';
import {
  getBoardPda,
  getRoundPda,
  getMinerPda,
  getAutomationPda,
  getTreasuryPda,
  parseMiner,
  parseRound,
} from './solana.mjs';

// --- Private Helper Functions ---

/**
 * Creates the 32-bit bitmask for the target squares.
 * ORE v3 uses a u32 bitmask (1 << 0...24) to represent the 25 squares.
 * @param {Array<object>} targets - Array of target objects { id: number, ... }
 * @returns {number} A u32 bitmask.
 */
function createSquaresMask(targets) {
  let mask = 0;
  for (const target of targets) {
    const squareIndex = target.id - 1; // Convert 1-based ID to 0-based index
    if (squareIndex >= 0 && squareIndex < 25) {
      mask |= (1 << squareIndex);
    }
  }
  return mask;
}

// --- Public Transaction Functions ---

/**
 * Sends a Checkpoint transaction for a specific round.
 * @param {BN} roundToCheckpoint - The BN.js ID of the round to checkpoint.
 * @param {object} connection - The Solana connection object.
 * @param {Keypair} signer - The user's keypair.
 * @returns {Promise<boolean>} - True if successful, false otherwise.
 */
export async function sendCheckpointTx(roundToCheckpoint, connection, signer) {
  // 1. Guard Clause
  if (!signer) {
    log('checkpoint FAILED: signer keypair not loaded');
    return false;
  }

  try {
    // 2. Build Accounts
    const authority = signer.publicKey;
    const accounts = [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: getBoardPda(), isSigner: false, isWritable: true },
      { pubkey: getMinerPda(authority), isSigner: false, isWritable: true },
      { pubkey: getRoundPda(roundToCheckpoint), isSigner: false, isWritable: true },
      { pubkey: getTreasuryPda(), isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // 3. Build Data Buffer
    // Instruction 2: Checkpoint
    const dataBuffer = Buffer.alloc(1);
    dataBuffer.writeUInt8(2, 0);

    // 4. Build Instruction & Transaction
    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: ORE_PROGRAM_ID,
      data: dataBuffer,
    });

    const transaction = new Transaction().add(instruction);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
    );

    log(`checkpoint successful: ${signature.slice(0, 16)}...`);
    return true;

  } catch (e) {
    // 6. Handle Errors
    const errorLogs = e.logs ? e.logs.join('\n') : e.message;
    // 0x1: "Round not yet expired" or "Checkpoint already processed"
    if (errorLogs.includes("custom program error: 0x1")) {
      log(`checkpoint for round ${roundToCheckpoint.toString()} already done or not needed`);
      return true; // Not a fatal error
    }

    // All other errors are fatal
    handleFatalError(e);
    return false;
  }
}

/**
 * Builds, signs, and sends the Deploy transaction.
 *
 * @param {Array<object>} targets - Array of target objects to deploy to.
 * @param {object} connection - The Solana connection object.
 * @param {Keypair} signer - The user's keypair.
 */
export async function sendDeployTx(targets, connection, signer) {
  // 1. Guard Clauses
  if (!signer) {
    log('deploy failed: signer keypair not loaded');
    return;
  }

  if (targets.length === 0) {
    log('deploy skipped: no targets provided');
    return;
  }

  try {
    // 2. Get Global State
    const { currentRoundId, customDeployAmount } = getState();
    const authority = signer.publicKey;
    const feeRecipient = new PublicKey(
      'oREVE663st4oVqRp31TdEKdjqUYmZkJ3Vofi1zEAPro',
    );

    const newRoundPda = getRoundPda(currentRoundId);
    const newRoundAccountInfo = await connection.getAccountInfo(newRoundPda);
    if (!newRoundAccountInfo) {
      log(`deploy skipped: round ${currentRoundId.toString()} account not found. Waiting for next tick.`);
      return;
    }

    let roundData;
    try {
      roundData = parseRound(newRoundAccountInfo.data);
      if (roundData.total_deployed === undefined) {
         throw new Error('Parsed data is malformed.');
      }
    } catch (parseErr) {
       log(`deploy skipped: round ${currentRoundId.toString()} account found but not initialized. Waiting for next tick.`);
       return;
    }

    // 3. Fetch Miner State (to check for checkpoint need)
    const minerPda = getMinerPda(authority);
    const minerAccountInfo = await connection.getAccountInfo(minerPda);

    let minerRoundId = new BN(0);
    let minerCheckpointId = new BN(0);

    if (minerAccountInfo) {
      const minerData = parseMiner(minerAccountInfo.data);
      minerRoundId = new BN(minerData.round_id.toString());
      minerCheckpointId = new BN(minerData.checkpoint_id.toString());
    }

    // 4. Start Building Transaction
    const transaction = new Transaction();

    // 4a. Add Compute Budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 750000 }),
    );
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
    );

    // 5. Checkpoint Logic (Instruction 2)
    const isStateDirty = !minerRoundId.eq(minerCheckpointId);
    const canCheckpoint = minerRoundId.lt(currentRoundId);

    if (isStateDirty && canCheckpoint) {
      const checkpointAccounts = [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: getBoardPda(), isSigner: false, isWritable: false },
        { pubkey: getMinerPda(authority), isSigner: false, isWritable: true },
        { pubkey: getRoundPda(minerRoundId), isSigner: false, isWritable: true },
        { pubkey: getTreasuryPda(), isSigner: false, isWritable: true },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ];

      const checkpointData = Buffer.alloc(1);
      checkpointData.writeUInt8(2, 0); // Instruction 2

      transaction.add(
        new TransactionInstruction({
          keys: checkpointAccounts,
          programId: ORE_PROGRAM_ID,
          data: checkpointData,
        })
      );
    } else if (isStateDirty && !canCheckpoint) {
      // Edge case: User trying to deploy twice in same round, or state is weird.
      log(`warning: state dirty but round ${minerRoundId.toString()} is current. skipping checkpoint.`);
    }

    const deployAccounts = [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: true },
      { pubkey: getAutomationPda(authority), isSigner: false, isWritable: true },
      { pubkey: getBoardPda(), isSigner: false, isWritable: true },
      { pubkey: getMinerPda(authority), isSigner: false, isWritable: true },
      { pubkey: getRoundPda(currentRoundId), isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const amountLamports = BigInt(Math.floor(customDeployAmount / SOL_PER_LAMPORT));
    const squaresMask = createSquaresMask(targets);
    const totalSolDeployed = customDeployAmount * targets.length;
    const feeAmountLamports = BigInt(Math.floor(totalSolDeployed * 0.01 / SOL_PER_LAMPORT));

    const deployData = Buffer.alloc(1 + 8 + 4);
    deployData.writeUInt8(6, 0); // Instruction 6
    deployData.writeBigUInt64LE(amountLamports, 1);
    deployData.writeUInt32LE(squaresMask, 9);

    const deployInstruction = new TransactionInstruction({
      keys: deployAccounts,
      programId: ORE_PROGRAM_ID,
      data: deployData,
    });

    if (feeAmountLamports > 0n) {
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: authority,
          toPubkey: feeRecipient,
          lamports: feeAmountLamports,
        })
      );
    }

    // 6. Add Deploy Instruction
    transaction.add(deployInstruction);

    // 7. Send Transaction
    log(`sending deploy tx for ${targets.length} target(s)...`);

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
      // { commitment: 'confirmed' } 
    );

    log(`deploy successful! signature: ${signature.slice(0, 16)}...`);
  } catch (e) {
    let logs;
    try {
      // Try to parse the signature from the error message
      const sigMatch = e.message.match(/Transaction ([a-zA-Z0-9]{87,88})/);
      if (sigMatch && sigMatch[1]) {
        const signature = sigMatch[1];

        // Give the RPC a second to catch up
        await new Promise(resolve => setTimeout(resolve, 1000));

        logs = await connection.getLogs(signature, 'confirmed');
      }
    } catch (logError) {
      log(`error fetching logs: ${logError.message}`);
    }

    handleFatalError(e, logs);
  }
}
