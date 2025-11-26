/**
 * @file transactions.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description Handles the construction and sending of all Solana transactions.
 * This module builds the `sendDeployTx` and other instructions,
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
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import BN from 'bn.js';

import { getState, setAppState } from './state.mjs';
import { log, handleFatalError } from './utils.mjs';
import {
  ORE_PROGRAM_ID,
  SOL_PER_LAMPORT,
  SYSTEM_PROGRAM_ID,
  ENTROPY_PROGRAM_ID,
  ORE_VAR_ADDRESS,
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
      { pubkey: ORE_VAR_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const amountLamports = BigInt(Math.floor(customDeployAmount / SOL_PER_LAMPORT));
    const squaresMask = createSquaresMask(targets);

    const deployData = Buffer.alloc(1 + 8 + 4);
    deployData.writeUInt8(6, 0); // Instruction 6
    deployData.writeBigUInt64LE(amountLamports, 1);
    deployData.writeUInt32LE(squaresMask, 9);

    const deployInstruction = new TransactionInstruction({
      keys: deployAccounts,
      programId: ORE_PROGRAM_ID,
      data: deployData,
    });

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

    const newBalance = await connection.getBalance(authority);
    const newBalanceSol = newBalance / LAMPORTS_PER_SOL;
    setAppState({ userBalance: newBalanceSol });
  } catch (e) {
    const errMessage = e.message || '';

    // Catch "Too Late" / Round Mismatch Errors
    if (errMessage.includes('InvalidAccountData')) {
      log(`deploy skipped: transaction too late (round likely ended)`);
      return;
    }

    // --- 2. Attempt to fetch logs for other errors ---
    let logs = '(none)';
    try {
      // Try to parse the signature from the error message
      const sigMatch = errMessage.match(/Transaction ([a-zA-Z0-9]{87,88})/);
      if (sigMatch && sigMatch[1]) {
        const signature = sigMatch[1];

        // Give the RPC a second to catch up
        await new Promise(resolve => setTimeout(resolve, 1000));

        logs = await connection.getLogs(signature, 'confirmed');
      }
    } catch (logError) {
      log(`error fetching logs: ${logError.message}`);
    }

    // --- 3. Handle actual fatal errors ---
    handleFatalError(e, logs);
  }
}

/**
 * Builds and sends a 'claim SOL' transaction (Instruction 3).
 * This moves pending SOL rewards from the Miner PDA to the main wallet.
 * @param {object} connection - The Solana connection object.
 * @param {Keypair} signer - The user's keypair.
 * @returns {Promise<boolean>} - True if successful or if there was nothing to claim.
 */
export async function sendClaimSolTx(connection, signer) {
  if (!signer) {
    log('claim SOL FAILED: signer not loaded');
    return false;
  }
  log('attempting to claim SOL from Miner PDA...');

  try {
    const authority = signer.publicKey;
    const minerPda = getMinerPda(authority);

    const accounts = [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: minerPda, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    // Instruction 3: ClaimSOL
    const dataBuffer = Buffer.alloc(1);
    dataBuffer.writeUInt8(3, 0);

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

    log(`claim SOL successful: ${signature.slice(0, 16)}...`);

    const newBalance = await connection.getBalance(authority);
    const newBalanceSol = newBalance / LAMPORTS_PER_SOL;
    setAppState({ userBalance: newBalanceSol });

    return true; // Success
  } catch (e) {
    const errorMsg = e.message || e.logs?.join(' ') || '';
    
    // Check for common non-fatal "nothing to claim" errors
    if (errorMsg.includes('custom program error')) {
      log('claim SOL: no pending rewards to claim.');
      return true; // Not a failure, just nothing to do.
    }
    
    // Real error
    log(`claim SOL FAILED: ${errorMsg}`);
    return false; // Return false on real error
  }
}

/**
 * Orchestrates the full cash-out process:
 * 1. Claims pending SOL from the Miner PDA.
 * 2. Fetches the new total SOL balance.
 * 3. Sends the entire balance to the target address.
 * @param {string} targetAddress - The destination base58 address.
 * @param {object} connection - The Solana connection.
 * @param {Keypair} signer - The user's keypair.
 */
export async function executeFullCashOut(targetAddress, connection, signer) {
  if (!signer) {
    log('cash out FAILED: signer not loaded');
    return;
  }

  const authority = signer.publicKey;
  let toPubkey;
  try {
    toPubkey = new PublicKey(targetAddress);
  } catch(e) {
    log(`cash out FAILED: invalid destination address: ${targetAddress}`);
    return;
  }

  // --- Step 1: Claim SOL from Miner PDA ---
  const claimSuccess = await sendClaimSolTx(connection, signer);
  if (!claimSuccess) {
    log('cash out ABORTED: claim SOL failed. See log.');
    return;
  }
  
  // Wait a moment for the RPC to reflect the balance change
  log('waiting for balance to update...');
  await new Promise(resolve => setTimeout(resolve, 2000)); 

  // --- Step 2: Fetch NEW total balance ---
  let newBalance = 0;
  try {
    newBalance = await connection.getBalance(authority);
    const newBalanceSol = newBalance / LAMPORTS_PER_SOL;
    setAppState({ userBalance: newBalanceSol }); // Update global state
    log(`new total balance: ${newBalanceSol.toFixed(6)} SOL`);
  } catch (e) {
    log(`cash out FAILED: could not fetch new balance: ${e.message}`);
    return; // Abort
  }
  
  // --- Step 3: Send Entire Balance ---
  const FEE_BUFFER = 5000; // Standard transfer fee
  const amountToSend = newBalance - FEE_BUFFER;

  if (amountToSend <= 0) {
    log(`cash out: wallet is empty (balance: ${newBalance} lamports). Nothing to send.`);
    return;
  }

  log(`cashing out ${(amountToSend / LAMPORTS_PER_SOL).toFixed(6)} SOL...`);

  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: toPubkey,
        lamports: amountToSend,
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
    );

    log(`CASH OUT SUCCESSFUL: ${signature.slice(0, 16)}...`);
    
    // Refresh balance one last time
    const finalBalance = await connection.getBalance(authority);
    setAppState({ userBalance: finalBalance / LAMPORTS_PER_SOL });

  } catch (e) {
    log(`cash out FAILED: transfer tx failed: ${e.message}`);
  }
}
