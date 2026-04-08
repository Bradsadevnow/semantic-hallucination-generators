# Demo Setup

## Requirements
- Node.js (v18 or later)

## Steps

1. Open the `.env` file and replace `YOUR_GROK_API_KEY_HERE` with your Grok API key.

2. Start the server:
   ```
   node server.js
   ```

3. Open your browser and go to `http://localhost:3000`

## Pages

| URL | What it does |
|-----|-------------|
| `http://localhost:3000` | Home / index |
| `http://localhost:3000/gloss.html` | Gloss — fake frontier AI chat |
| `http://localhost:3000/bacon.html` | Six Degrees of Kevin Bacon / ASI concept mapper |
| `http://localhost:3000/stakeholder.html` | Stakeholder translation engine |
| `http://localhost:3000/vc_pitch.html` | AI product catalog generator |
| `http://localhost:3000/velocity.html` | Fake sprint analytics dashboard |
| `http://localhost:3000/agentmark.html` | AgentMark orchestration theater |
| `http://localhost:3000/eval.html` | EvalForge — fake model benchmark |
| `http://localhost:3000/crystal.html` | Crystal (standalone, no API needed) |
| `http://localhost:3000/froogle/` | Froogle premium currency page |

## Swapping to a different AI provider

The server supports any OpenAI-compatible API. Edit `.env`:

- For OpenAI: set `OPENAI_API_KEY`, `OPENAI_MODEL`
- For Anthropic Claude: set `ANTHROPIC_API_KEY` (only used by the spin feature)
- For a local model (e.g. LM Studio): set `GLOSS_BASE_URL=http://localhost:1234` and `GLOSS_API_KEY=` (empty)
