/**
 * Test script demonstrating:
 * 1. How a Telebirr transfer (like DIU19ZFMTL for 235 ETB) is verified
 * 2. What data Telebirr & Verify.ET return (including TIN / invoice & receiver details)
 * 3. How we store & compare the restaurant's account so only transfers to the restaurant are accepted
 */

// Simulated database record of the restaurant branch's payment accounts:
const restaurantBranchAccounts = {
  branchName: 'Bole Main Branch',
  accounts: {
    telebirr: {
      accountType: 'MERCHANT_TILL',
      accountNumber: '582910', // Restaurant's Telebirr merchant till
      accountName: 'Fanaye Restaurant PLC',
      tinNumber: '0054892147', // Restaurant's official TIN
    },
    cbe: {
      accountType: 'BANK_ACCOUNT',
      accountNumber: '1000284918234',
      accountName: 'Fanaye Restaurant PLC',
    },
  },
};

/**
 * 1. Telebirr e-Invoice / TIN Details for this transfer
 * In Telebirr, clicking "Click here to get the invoice" pulls from Ethio Telecom's e-invoice:
 */
const telebirrInvoiceDetails = {
  transactionNo: 'DIU19ZFMTL',
  ethioTelecomVatTin: '0000030603', // Ethio telecom official registered TIN
  transactionType: 'Send Money',
  sender: 'Yonatan',
  amount: 235.0,
  currency: 'ETB',
  serviceCharge: 0.0,
  timestamp: '2026/09/30 13:21:05',
};

/**
 * 2. Verification API Response payload returned when verifying DIU19ZFMTL
 */
function simulateVerificationResponse(actualReceiverAccount, actualReceiverName) {
  return {
    verified: true,
    status: 'success',
    bank: 'telebirr',
    reference: 'DIU19ZFMTL',
    amount: 235.0,
    currency: 'ETB',
    senderName: 'Yonatan',
    receiverName: actualReceiverName,
    receiverAccount: actualReceiverAccount,
    timestamp: '2026/09/30 13:21:05',
    invoice: {
      hasElectronicInvoice: true,
      issuerTin: '0000030603', // Ethio telecom TIN
      receiptNumber: 'RCP-DIU19ZFMTL',
    },
  };
}

/**
 * 3. Validation logic: Compare recipient against restaurant's stored account
 */
function validateRestaurantTransfer(verificationResult, billAmount, expectedChannel) {
  console.log('\n======================================================');
  console.log(`🔍 Checking Transfer Reference: ${verificationResult.reference}`);
  console.log(`   Payer: ${verificationResult.senderName}`);
  console.log(`   Amount: ${verificationResult.amount} ${verificationResult.currency} (Bill Due: ${billAmount} ETB)`);
  console.log(`   Receiver: "${verificationResult.receiverName}" (${verificationResult.receiverAccount})`);
  console.log(`   Telebirr / Ethio Telecom TIN: ${verificationResult.invoice.issuerTin}`);

  // Step A: Amount Check
  if (verificationResult.amount < billAmount) {
    return {
      success: false,
      code: 'UNDERPAID',
      reason: `Amount transferred (${verificationResult.amount}) is less than due amount (${billAmount}).`,
    };
  }

  // Step B: Match against Restaurant's Stored Account
  const targetAccount = restaurantBranchAccounts.accounts[expectedChannel];
  if (!targetAccount) {
    return {
      success: false,
      code: 'NO_RESTAURANT_ACCOUNT_CONFIGURED',
      reason: `No ${expectedChannel} account configured for this branch.`,
    };
  }

  const isAccountMatch =
    verificationResult.receiverAccount === targetAccount.accountNumber ||
    verificationResult.receiverName.toLowerCase().includes('fanaye');

  if (!isAccountMatch) {
    return {
      success: false,
      code: 'TRANSFER_WRONG_ACCOUNT',
      reason: `Transfer was sent to "${verificationResult.receiverName}" (${verificationResult.receiverAccount}), NOT to restaurant account (${targetAccount.accountNumber} - ${targetAccount.accountName})!`,
    };
  }

  return {
    success: true,
    code: 'TRANSFER_VERIFIED_AND_ACCEPTED',
    message: `Payment confirmed! Sent to ${targetAccount.accountName} (${targetAccount.accountNumber}).`,
  };
}

// Case 1: Valid customer payment made to the Restaurant's Telebirr account
console.log('\n--- SCENARIO 1: Customer sent 235 ETB to Restaurant Telebirr Account ---');
const validTransfer = simulateVerificationResponse('582910', 'Fanaye Restaurant PLC');
const result1 = validateRestaurantTransfer(validTransfer, 235.0, 'telebirr');
console.log('Result:', result1);

// Case 2: Customer sent 235 ETB to a friend/staff personal account instead of restaurant
console.log('\n--- SCENARIO 2: Customer sent 235 ETB to a Personal Account (Wrong/Fraud) ---');
const fraudTransfer = simulateVerificationResponse('0912345678', 'Abebe Personal');
const result2 = validateRestaurantTransfer(fraudTransfer, 235.0, 'telebirr');
console.log('Result:', result2);
