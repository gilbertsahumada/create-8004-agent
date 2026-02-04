/**
 * Ethereum Mainnet Test Suite
 */

import { createChainTestSuite } from '../utils/chain-test-factory.js';

createChainTestSuite({
    chainKey: 'eth-mainnet',
    chainName: 'Ethereum Mainnet',
    x402Supported: false,
});
