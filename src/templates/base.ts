import type { WizardAnswers } from "../wizard.js";
import { hasFeature } from "../wizard.js";
import type { CHAINS } from "../config.js";

type ChainConfig = (typeof CHAINS)[keyof typeof CHAINS];

export function generatePackageJson(answers: WizardAnswers): string {
    const scripts: Record<string, string> = {
        build: "tsc",
        register: "tsx src/register.ts",
    };

    const dependencies: Record<string, string> = {
        viem: "^2.21.0",
        dotenv: "^16.3.1",
        openai: "^4.68.0",
    };

    const devDependencies: Record<string, string> = {
        "@types/node": "^20.10.0",
        tsx: "^4.7.0",
        typescript: "^5.3.0",
    };

    // No extra dependency needed for IPFS - using fetch with Pinata API

    if (hasFeature(answers, "a2a")) {
        scripts["start:a2a"] = "tsx src/a2a-server.ts";
        dependencies["express"] = "^4.18.2";
        dependencies["uuid"] = "^9.0.0";
        devDependencies["@types/express"] = "^4.17.21";
        devDependencies["@types/uuid"] = "^9.0.7";
    }

    if (hasFeature(answers, "mcp")) {
        scripts["start:mcp"] = "tsx src/mcp-server.ts";
        dependencies["@modelcontextprotocol/sdk"] = "^1.0.0";
    }

    if (hasFeature(answers, "x402")) {
        dependencies["@x402/express"] = "^2.0.0";
        dependencies["@x402/core"] = "^2.0.0";
        dependencies["@x402/evm"] = "^2.0.0";
    }

    return JSON.stringify(
        {
            name: answers.agentName.toLowerCase().replace(/\s+/g, "-"),
            version: "1.0.0",
            description: answers.agentDescription,
            type: "module",
            scripts,
            dependencies,
            devDependencies,
        },
        null,
        2
    );
}

export function generateEnvExample(answers: WizardAnswers): string {
    // If we generated a private key, use it directly
    const privateKeyValue = answers.generatedPrivateKey || "your_private_key_here";

    let env = `# Required for registration
PRIVATE_KEY=${privateKeyValue}

# OpenAI API key for LLM agent
OPENAI_API_KEY=your_openai_api_key_here
`;

    if (answers.storageType === "ipfs") {
        env += `
# Pinata for IPFS uploads
PINATA_JWT=your_pinata_jwt_here
`;
    }

    if (hasFeature(answers, "x402")) {
        env += `
# x402 Payment Configuration (optional overrides)
X402_PAYEE_ADDRESS=${answers.agentWallet}
X402_PRICE=$0.001
`;
    }

    return env;
}

export function generateRegistrationJson(answers: WizardAnswers, chain: ChainConfig): string {
    const agentSlug = answers.agentName.toLowerCase().replace(/\s+/g, "-");
    const endpoints: Array<{ name: string; endpoint: string; version?: string }> = [];

    if (hasFeature(answers, "a2a")) {
        endpoints.push({
            name: "A2A",
            endpoint: `https://${agentSlug}.example.com/.well-known/agent-card.json`,
            version: "0.3.0",
        });
    }

    if (hasFeature(answers, "mcp")) {
        endpoints.push({
            name: "MCP",
            endpoint: `https://${agentSlug}.example.com/mcp`,
            version: "2025-06-18",
        });
    }

    endpoints.push({
        name: "agentWallet",
        endpoint: `eip155:${chain.chainId}:${answers.agentWallet}`,
    });

    const registration: Record<string, unknown> = {
        type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
        name: answers.agentName,
        description: answers.agentDescription,
        image: answers.agentImage,
        endpoints,
        registrations: [],
        supportedTrust: answers.trustModels,
        active: true,
        // OASF taxonomy - https://github.com/8004-org/oasf
        skills: answers.skills || [],
        domains: answers.domains || [],
    };

    // Add x402 support flag if x402 feature was selected
    if (hasFeature(answers, "x402")) {
        registration.x402support = true;
    }

    return JSON.stringify(registration, null, 2);
}

export function generateRegisterScript(answers: WizardAnswers, chain: ChainConfig): string {
    const ipfsUpload = answers.storageType === "ipfs";

    return `/**
 * ERC-8004 Agent Registration Script
 * 
 * This script registers your agent on the ERC-8004 Identity Registry.
 * It performs the following steps:
 * 
 * 1. Reads your registration.json metadata
 * 2. ${ipfsUpload ? "Uploads metadata to IPFS via Pinata" : "Encodes metadata as a base64 data URI"}
 * 3. Calls the Identity Registry contract to mint your agent NFT
 * 4. Returns your agentId for future reference
 * 
 * Requirements:
 * - PRIVATE_KEY in .env (wallet with testnet ETH for gas)${
     ipfsUpload ? "\n * - PINATA_JWT in .env (for IPFS uploads)" : ""
 }
 * 
 * Run with: npm run register
 */

import 'dotenv/config';
import fs from 'fs/promises';
import { createWalletClient, createPublicClient, http, parseAbi, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ============================================================================
// Contract Configuration
// ============================================================================

/**
 * ERC-8004 Identity Registry ABI (minimal)
 * The register() function mints an agent NFT with your agentURI
 * Updated Jan 2026: tokenURI -> agentURI
 */
const IDENTITY_REGISTRY_ABI = parseAbi([
  'function register(string agentURI) external returns (uint256 agentId)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

/**
 * Chain configuration for ${chain.name}
 * Change this if you want to deploy to a different network
 */
const CHAIN_CONFIG = {
  id: ${chain.chainId},
  name: '${chain.name}',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['${chain.rpcUrl}'] } },
  blockExplorers: { default: { name: 'Explorer', url: '${chain.explorer}' } },
};

// Identity Registry contract address on ${chain.name}
const IDENTITY_REGISTRY = '${chain.identityRegistry}';
${
    ipfsUpload
        ? `
// ============================================================================
// IPFS Upload
// ============================================================================

/**
 * Upload registration data to IPFS via Pinata Pinning API
 * Returns the IPFS CID of the uploaded file (publicly accessible)
 */
async function uploadToIPFS(data: string, jwt: string): Promise<string> {
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: \`Bearer \${jwt}\`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataContent: JSON.parse(data),
      pinataMetadata: { name: 'registration.json' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(\`Pinata upload failed: \${response.statusText} - \${error}\`);
  }

  const result = await response.json() as { IpfsHash: string };
  return result.IpfsHash;
}
`
        : ""
}
// ============================================================================
// Main Registration Flow
// ============================================================================

async function main() {
  // Step 1: Load environment variables
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('PRIVATE_KEY not set in .env');
  }

  ${
      ipfsUpload
          ? `const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    throw new Error('PINATA_JWT not set in .env');
  }`
          : ""
  }

  // Step 2: Read registration.json (your agent's metadata)
  const registrationData = await fs.readFile('registration.json', 'utf-8');
  const registration = JSON.parse(registrationData);

  // Step 3: Prepare tokenURI (either IPFS or base64)
  let tokenURI: string;

  ${
      ipfsUpload
          ? `// Upload to IPFS via Pinata
  // The tokenURI will be: ipfs://Qm...
  console.log('📤 Uploading to IPFS...');
  const ipfsHash = await uploadToIPFS(registrationData, pinataJwt);
  tokenURI = \`ipfs://\${ipfsHash}\`;
  console.log('✅ Uploaded to IPFS:', tokenURI);`
          : `// Encode as base64 data URI
  // The tokenURI will be: data:application/json;base64,...
  // This stores metadata directly on-chain (no external dependencies)
  console.log('📦 Encoding as base64...');
  const base64Data = Buffer.from(registrationData).toString('base64');
  tokenURI = \`data:application/json;base64,\${base64Data}\`;
  console.log('✅ Encoded as base64 data URI');`
  }

  // Step 4: Setup wallet client (for sending transactions)
  const formattedKey = privateKey.startsWith('0x') ? privateKey : \`0x\${privateKey}\`;
  const account = privateKeyToAccount(formattedKey as \`0x\${string}\`);
  console.log('🔑 Registering from:', account.address);

  const walletClient = createWalletClient({
    account,
    chain: CHAIN_CONFIG,
    transport: http(),
  });

  // Public client for reading blockchain state
  const publicClient = createPublicClient({
    chain: CHAIN_CONFIG,
    transport: http(),
  });

  // Step 5: Call the register() function on the Identity Registry
  console.log('📝 Registering agent on ${chain.name}...');
  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: IDENTITY_REGISTRY_ABI,
    functionName: 'register',
    args: [tokenURI],
  });

  // Step 6: Wait for transaction confirmation
  console.log('⏳ Waiting for confirmation...');
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Parse the Registered event to get agentId
  // The Registered event signature hash
  const REGISTERED_EVENT_SIG = '0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a';
  
  const registeredLog = receipt.logs.find(
    (log) => 
      log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() &&
      log.topics[0] === REGISTERED_EVENT_SIG
  );

  let agentId: string | null = null;
  if (registeredLog) {
    try {
      const decoded = decodeEventLog({
        abi: IDENTITY_REGISTRY_ABI,
        data: registeredLog.data,
        topics: registeredLog.topics,
      });
      if (decoded.eventName === 'Registered' && decoded.args) {
        agentId = (decoded.args as { agentId: bigint }).agentId.toString();
      }
    } catch (e) {
      console.warn('⚠️  Could not decode event log, agentId not extracted');
    }
  }

  // Step 7: Output results
  console.log('\\n✅ Agent registered successfully!');
  console.log('📋 Transaction:', \`${chain.explorer}/tx/\${hash}\`);
  console.log('🔗 Registry:', IDENTITY_REGISTRY);
  console.log('📄 Token URI:', tokenURI);
  if (agentId) {
    console.log('🆔 Agent ID:', agentId);${
        chain.scanPath
            ? `
    console.log('');
    console.log('🌐 View your agent on 8004scan:');
    console.log(\`   https://www.8004scan.io/${chain.scanPath}/agent/\${agentId}\`);`
            : ""
    }
  }

  // Update registration.json with the registry reference
  registration.registrations = [{
    agentId: agentId ? parseInt(agentId, 10) : 'UNKNOWN',
    agentRegistry: \`eip155:${chain.chainId}:\${IDENTITY_REGISTRY}\`,
  }];
  await fs.writeFile('registration.json', JSON.stringify(registration, null, 2));
  
  if (agentId) {
    console.log('\\n✅ registration.json updated with agentId:', agentId);
  } else {
    console.log('\\n⚠️  Could not extract agentId - check transaction logs manually');
  }
}

main().catch(console.error);
`;
}

export function generateAgentTs(answers: WizardAnswers): string {
    const streamingCode = answers.a2aStreaming
        ? `
/**
 * Stream a response to a user message (generator function)
 * Yields chunks of text as they are generated by the LLM
 * 
 * @param userMessage - The user's input
 * @param history - Previous conversation messages (for context)
 * @yields Text chunks as they are generated
 */
export async function* streamResponse(userMessage: string, history: AgentMessage[] = []): AsyncGenerator<string> {
  const systemPrompt: AgentMessage = {
    role: 'system',
    content: 'You are a helpful AI assistant registered on the ERC-8004 protocol. Be concise and helpful.',
  };

  const messages: AgentMessage[] = [
    systemPrompt,
    ...history,
    { role: 'user', content: userMessage },
  ];

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      yield content;
    }
  }
}
`
        : "";

    return `/**
 * LLM Agent
 * 
 * This file contains the AI logic for your agent.
 * By default, it uses OpenAI's GPT-4o-mini model.
 * 
 * To customize:
 * - Change the model in chat() (e.g., 'gpt-4o', 'gpt-3.5-turbo')
 * - Modify the system prompt in generateResponse()
 * - Add custom logic, tools, or RAG capabilities
 * 
 * To use a different LLM provider:
 * - Replace the OpenAI import with your preferred SDK
 * - Update the chat() function accordingly
 */

import OpenAI from 'openai';

// Initialize OpenAI client
// API key is loaded from OPENAI_API_KEY environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// Types
// ============================================================================

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Send messages to the LLM and get a response
 * This is the low-level function that calls the OpenAI API
 * 
 * @param messages - Array of conversation messages
 * @returns The assistant's response text
 */
export async function chat(messages: AgentMessage[]): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // Change model here if needed
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    // Add more options as needed:
    // temperature: 0.7,
    // max_tokens: 1000,
  });

  return response.choices[0]?.message?.content ?? 'No response';
}

/**
 * Generate a response to a user message
 * This is the main function called by A2A and MCP handlers
 * 
 * @param userMessage - The user's input
 * @param history - Previous conversation messages (for context)
 * @returns The agent's response
 */
export async function generateResponse(userMessage: string, history: AgentMessage[] = []): Promise<string> {
  // System prompt defines your agent's personality and behavior
  // Customize this to match your agent's purpose
  const systemPrompt: AgentMessage = {
    role: 'system',
    content: 'You are a helpful AI assistant registered on the ERC-8004 protocol. Be concise and helpful.',
  };

  // Build the full message array: system prompt + history + new message
  const messages: AgentMessage[] = [
    systemPrompt,
    ...history,
    { role: 'user', content: userMessage },
  ];

  return chat(messages);
}
${streamingCode}`;
}
