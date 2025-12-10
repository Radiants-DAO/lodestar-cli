/**
 * @file closeAutomation.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description One-time script to close an Automation PDA.
 * May fix "InvalidAccountData" by properly resetting the automation state.
 * @project lodestar-cli
 * @license MIT
 */

import { Transaction, TransactionInstruction, sendAndConfirmTransaction, PublicKey } from '@solana/web3.js';
import { ORE_PROGRAM_ID, SYSTEM_PROGRAM_ID } from './constants.mjs';
import { getAutomationPda, getMinerPda } from './solana.mjs';
import { loadSigner } from './wallet.mjs';
import { initConnection } from './solana.mjs';
import BN from 'bn.js';

async function closeAutomation() {
  try {
    const connection = initConnection();
    const signer = await loadSigner(connection);
    const authority = signer.publicKey;

    console.log(`Loaded signer: ${authority.toBase58()}`);

    const automationPda = getAutomationPda(authority);
    const minerPda = getMinerPda(authority);

    const accounts = [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: automationPda, isSigner: false, isWritable: true },
      { pubkey: PublicKey.default, isSigner: false, isWritable: false },
      { pubkey: minerPda, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ];

    const dataBuffer = Buffer.alloc(41);
    dataBuffer.writeUInt8(0, 0);

    const instruction = new TransactionInstruction({
      keys: accounts,
      programId: ORE_PROGRAM_ID,
      data: dataBuffer,
    });

    const transaction = new Transaction().add(instruction);

    console.log('Sending Close transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [signer]
    );

    console.log(`\nSUCCESS! Automation closed.`);
    console.log(`Signature: ${signature}`);

  } catch (e) {
    console.error('\nSCRIPT FAILED:', e.message);
    if (e.logs) {
        console.log("Logs:");
        e.logs.forEach(l => console.log(l));
    }
  }
}

closeAutomation();
