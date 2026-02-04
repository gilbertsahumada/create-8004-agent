/**
 * Monad Mainnet Test Suite
 */

import { createChainTestSuite } from '../utils/chain-test-factory.js';

createChainTestSuite({
    chainKey: 'monad-mainnet',
    chainName: 'Monad Mainnet',
    x402Supported: false, // Corbits facilitator only supports x402 v1
});
