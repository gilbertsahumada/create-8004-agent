/**
 * A2A (Agent-to-Agent) Server
 * 
 * This server implements the A2A protocol for agent communication.
 * Learn more: https://a2a-protocol.org/
 * 
 * Endpoints:
 * - GET  /.well-known/agent-card.json  → Agent discovery card
 * - POST /a2a                          → JSON-RPC 2.0 endpoint
 * 
 * Supported methods:
 * - message/send   → Send a message and get a response
 * - tasks/get      → Get status of a previous task
 * - tasks/cancel   → Cancel a running task
 */

import 'dotenv/config';
import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateResponse, type AgentMessage } from './agent.js';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const app = express();
app.use(express.json());

// ============================================================================
// In-Memory Storage
// In production, replace with a database (Redis, PostgreSQL, etc.)
// ============================================================================

/**
 * Task storage - tracks all tasks and their current state
 * A task represents a single request/response interaction
 */
const tasks = new Map<string, {
  id: string;
  contextId: string;
  status: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
  messages: Array<{ role: 'user' | 'agent'; parts: Array<{ type: 'text'; text: string }> }>;
  artifacts: Array<{ name: string; parts: Array<{ type: 'text'; text: string }> }>;
}>();

/**
 * Conversation history storage - maintains context across messages
 * The contextId allows multiple messages to share conversation history
 */
const conversationHistory = new Map<string, AgentMessage[]>();

// ============================================================================
// Middleware & Routes
// ============================================================================

// x402 v2 payment middleware - protects the /a2a endpoint
// Facilitator: Corbits facilitator (Monad)
const PAYEE_ADDRESS = process.env.X402_PAYEE_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
const X402_NETWORK = 'eip155:143'; // CAIP-2 EVM network

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({
  url: 'https://facilitator.corbits.dev',
});

// Register EVM scheme for payment verification
const x402Server = new x402ResourceServer(facilitatorClient)
  .register(X402_NETWORK, new ExactEvmScheme());

app.use(
  paymentMiddleware(
  {
    'POST /a2a': {
        accepts: [
          {
            scheme: 'exact',
      price: process.env.X402_PRICE || '$0.001',
            network: X402_NETWORK,
            payTo: PAYEE_ADDRESS,
          },
        ],
        description: 'Comprehensive test agent for monad-mainnet',
        mimeType: 'application/json',
    },
  },
    x402Server,
  ),
);

/**
 * Agent Card endpoint - required for A2A discovery
 * Other agents use this to learn about your agent's capabilities
 */
app.get('/.well-known/agent-card.json', async (_req: Request, res: Response) => {
  const agentCard = await import('../.well-known/agent-card.json', { assert: { type: 'json' } });
  res.json(agentCard.default);
});

/**
 * Main JSON-RPC 2.0 endpoint
 * All A2A protocol methods are called through this single endpoint
 */
app.post('/a2a', async (req: Request, res: Response) => {
  const { jsonrpc, method, params, id } = req.body;

  // Validate JSON-RPC version
  if (jsonrpc !== '2.0') {
    return res.json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id });
  }

  try {
    const result = await handleMethod(method, params);
    res.json({ jsonrpc: '2.0', result, id });
  } catch (error: any) {
    res.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: error.message || 'Internal error' },
      id,
    });
  }
});

// ============================================================================
// Method Handlers
// ============================================================================

/**
 * Route JSON-RPC methods to their handlers
 * Add new methods here as needed
 */
async function handleMethod(method: string, params: any) {
  switch (method) {
    case 'message/send':
      return handleMessageSend(params);
    case 'tasks/get':
      return handleTasksGet(params);
    case 'tasks/cancel':
      return handleTasksCancel(params);
    default:
      throw new Error(`Method not found: ${method}`);
  }
}

/**
 * Handle message/send - the main method for chatting with the agent
 * 
 * @param params.message - The user's message with role and parts
 * @param params.configuration.contextId - Optional ID to continue a conversation
 * @returns A task object with the agent's response
 */
async function handleMessageSend(params: {
  message: { role: string; parts: Array<{ type: string; text?: string }> };
  configuration?: { contextId?: string };
}) {
  const { message, configuration } = params;
  
  // Use existing contextId for conversation continuity, or create new one
  const contextId = configuration?.contextId || uuidv4();
  const taskId = uuidv4();

  // Extract text content from message parts
  // A2A messages can have multiple parts (text, files, etc.)
  const userText = message.parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('\n');

  // Get conversation history for context-aware responses
  const history = conversationHistory.get(contextId) || [];

  // Generate response using the LLM (see agent.ts)
  const responseText = await generateResponse(userText, history);

  // Update conversation history for future messages
  history.push({ role: 'user', content: userText });
  history.push({ role: 'assistant', content: responseText });
  conversationHistory.set(contextId, history);

  // Create the task response object
  // This follows the A2A protocol task structure
  const task = {
    id: taskId,
    contextId,
    status: 'completed' as const,
    messages: [
      { role: 'user' as const, parts: [{ type: 'text' as const, text: userText }] },
      { role: 'agent' as const, parts: [{ type: 'text' as const, text: responseText }] },
    ],
    artifacts: [], // Add any generated files/data here
  };

  tasks.set(taskId, task);

  return task;
}

/**
 * Handle tasks/get - retrieve a task by ID
 * Useful for checking status of async operations
 */
async function handleTasksGet(params: { taskId: string }) {
  const task = tasks.get(params.taskId);
  if (!task) {
    throw new Error('Task not found');
  }
  return task;
}

/**
 * Handle tasks/cancel - cancel a running task
 * For long-running tasks, this allows early termination
 */
async function handleTasksCancel(params: { taskId: string }) {
  const task = tasks.get(params.taskId);
  if (!task) {
    throw new Error('Task not found');
  }
  task.status = 'canceled';
  return task;
}

// ============================================================================
// Start Server
// ============================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🤖 A2A Server running on http://localhost:${PORT}`);
  console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`);
  console.log(`🔗 JSON-RPC endpoint: http://localhost:${PORT}/a2a`);
});
