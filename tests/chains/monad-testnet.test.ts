/**
 * Monad Testnet Test Suite
 */

import { createChainTestSuite } from '../utils/chain-test-factory.js';

createChainTestSuite({
    chainKey: 'monad-testnet',
    chainName: 'Monad Testnet',
    x402Supported: false, // Corbits facilitator only supports x402 v1
    isTestnet: true,
});
