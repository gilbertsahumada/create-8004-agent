# Test Agent eth-mainnet

Comprehensive test agent for eth-mainnet

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Edit `.env` and add your API keys:

```env
# Already set if wallet was auto-generated
PRIVATE_KEY=your_private_key

# Get from https://pinata.cloud (free tier works)
PINATA_JWT=your_pinata_jwt

# Get from https://platform.openai.com
OPENAI_API_KEY=your_openai_key
```

### 3. Fund your wallet

Your agent wallet: `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0`

**⚠️ Mainnet: You need real ETH for gas fees.** Transfer ETH to your wallet before registering.


### 4. Register on-chain

```bash
npm run register
```

This will:
- Upload your agent metadata to IPFS
- Register your agent on Ethereum Mainnet
- Output your agent ID and 8004scan link

### 5. Start the A2A server

```bash
npm run start:a2a
```

Test locally: http://localhost:3000/.well-known/agent-card.json

### 6. Start the MCP server

```bash
npm run start:mcp
```

## Project Structure

```
test-agent-eth-mainnet/
├── src/
│   ├── register.ts      # Registration script
│   ├── agent.ts         # LLM logic
│   └── a2a-server.ts   # A2A server
│   └── mcp-server.ts   # MCP server
├── .env                 # Environment variables (keep secret!)
└── package.json
```

## OASF Skills & Domains (Optional)

Add capabilities and domain expertise to help others discover your agent.

Edit `src/register.ts` and uncomment/add before `registerIPFS()`:

```typescript
// Add skills (what your agent can do)
agent.addSkill('natural_language_processing/natural_language_generation/summarization');
agent.addSkill('analytical_skills/coding_skills/text_to_code');

// Add domains (areas of expertise)  
agent.addDomain('technology/software_engineering');
agent.addDomain('finance_and_business/investment_services');
```

Browse the full taxonomy: https://schema.oasf.outshift.com/0.8.0

## Going Live

By default, your agent is registered with `active: false`. This is intentional - it lets you test without appearing in explorer listings.

When you're ready for production:
1. Edit `src/register.ts` and change `agent.setActive(false)` to `agent.setActive(true)`
2. Re-run `npm run register` to update your agent's metadata

## Next Steps

1. Update the endpoint URLs in `src/register.ts` with your production domain
2. Customize the agent logic in `src/agent.ts`
3. Deploy to a cloud provider (Vercel, Railway, etc.)
4. Re-run `npm run register` if you change metadata

## Resources

- [ERC-8004 Standard](https://eips.ethereum.org/EIPS/eip-8004)
- [8004scan Explorer](https://www.8004scan.io/)
- [Agent0 SDK Docs](https://sdk.ag0.xyz/)
- [OASF Taxonomy](https://github.com/8004-org/oasf)
