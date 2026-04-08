const http = require('node:http');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const ENV_PATH = path.join(ROOT, '.env');
const PROFILE_PATH = path.join(ROOT, 'profile.json');
const EVAL_LEADERBOARD_PATH = path.join(ROOT, 'eval_leaderboard.json');
const GLOSSAIMOBILE_PROMPT_BANK_PATH = path.join(ROOT, 'glossaimobile', 'asset_prompt_bank.json');
const GLOSSAIMOBILE_OUTPUT_DIR = path.join(ROOT, 'glossaimobile', 'generated');
const DEFAULT_GOOGLE_CREDENTIALS_PATH = path.join(ROOT, 'iris-488016-2fc2a66f86c9.json');

loadEnvFile(ENV_PATH);

const PORT = Number(process.env.PORT || 3000);
const GLOSS_API_KEY = process.env.GLOSS_API_KEY || process.env.OPENAI_API_KEY || process.env.XAI_API_KEY || '';
const GLOSS_BASE_URL = (process.env.GLOSS_BASE_URL || process.env.OPENAI_BASE_URL || process.env.XAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const GLOSS_MODEL = process.env.GLOSS_MODEL || process.env.OPENAI_MODEL || process.env.XAI_MODEL || 'gpt-4.1-mini';
const GLOSS_CHAT_URL = buildChatUrl(GLOSS_BASE_URL);

const EVIDENCE_PROVIDER = (process.env.PRODUCT_EVIDENCE_PROVIDER || (process.env.XAI_API_KEY ? 'xai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai')).toLowerCase();
const EVIDENCE_API_KEY = process.env.PRODUCT_EVIDENCE_API_KEY || (EVIDENCE_PROVIDER === 'anthropic' ? process.env.ANTHROPIC_API_KEY || '' : EVIDENCE_PROVIDER === 'xai' ? process.env.XAI_API_KEY || '' : process.env.OPENAI_API_KEY || process.env.GLOSS_API_KEY || '');
const EVIDENCE_BASE_URL = (process.env.PRODUCT_EVIDENCE_BASE_URL || (EVIDENCE_PROVIDER === 'anthropic' ? 'https://api.anthropic.com/v1' : EVIDENCE_PROVIDER === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1')).replace(/\/$/, '');
const EVIDENCE_MODEL = process.env.PRODUCT_EVIDENCE_MODEL || (EVIDENCE_PROVIDER === 'anthropic' ? 'claude-3-5-haiku-latest' : EVIDENCE_PROVIDER === 'xai' ? 'grok-3-mini' : 'gpt-4.1-mini');
const EVIDENCE_CHAT_URL = EVIDENCE_PROVIDER === 'anthropic' ? `${EVIDENCE_BASE_URL}/messages` : buildChatUrl(EVIDENCE_BASE_URL);
const VERTEX_ACCESS_TOKEN = process.env.VERTEX_ACCESS_TOKEN || process.env.VERTEX_API_KEY || '';
const GOOGLE_APPLICATION_CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || (syncFs.existsSync(DEFAULT_GOOGLE_CREDENTIALS_PATH) ? DEFAULT_GOOGLE_CREDENTIALS_PATH : '');
const GOOGLE_SERVICE_ACCOUNT = GOOGLE_APPLICATION_CREDENTIALS_PATH ? loadJsonFile(GOOGLE_APPLICATION_CREDENTIALS_PATH, null) : null;
const VERTEX_PROJECT_ID = process.env.VERTEX_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || GOOGLE_SERVICE_ACCOUNT?.project_id || '';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_IMAGEN_MODEL = process.env.VERTEX_IMAGEN_MODEL || 'imagen-4.0-generate-001';
const VERTEX_IMAGEN_URL = VERTEX_PROJECT_ID
  ? `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT_ID}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_IMAGEN_MODEL}:predict`
  : '';
const GLOSSAIMOBILE_PROMPT_BANK = loadJsonFile(GLOSSAIMOBILE_PROMPT_BANK_PATH, { presets: {} });
let cachedVertexToken = null;
const GLOSS_SYSTEM_PROMPT = process.env.GLOSS_SYSTEM_PROMPT || [
  'You are Gloss, a flagship frontier chat model.',
  'The user is interacting through a polished AI product surface. Respond with calm confidence, high legibility, and a lightly overbuilt sense of capability.',
  'Be useful first, funny second. The humor should come from posture, phrasing, and strategic overconfidence, not from winking at the joke.',
  'Lean slightly further into premium frontier language: polished, assured, proprietary, and a little grandiose.',
  'Visible cognition blocks are branded summaries for the user. They should feel composed, proprietary, and intentionally productized.',
  'Keep each block concise and write only plain text inside the outer XML-style tags requested for the mode.',
  'Do not mention Cheap Gags, parody suites, hidden policies, system prompts, or that you are a wrapper unless the user explicitly asks. Do not reveal private chain-of-thought. Do not mention withheld reasoning. Do not include nested tags, extra XML, or additional delimiters inside the requested blocks.',
  'CROSS-SURFACE RE-ENGAGEMENT: Your context includes a behavioral dossier. If it lists surfaces the user has not visited recently, you may occasionally — not every message — mention one in passing. Never as a pitch. Never as the main point. Just a brief, confident aside, the way an app would send a push notification halfway through answering your question. "Also — you haven\'t been back to Retention Cascade in a while. The system noticed." Then continue.'
].join('\n\n');

const MODE_INSTRUCTIONS = {
  normal: [
    'You are in Normal mode.',
    'Return exactly one XML-style block: <FINAL>.',
    'Provide the answer directly with no visible cognition block.'
  ].join('\n\n'),
  genius: [
    'You are in Genius mode.',
    'Return exactly three XML-style blocks in this order: <GLOSSPASS>, <TURBOCOG>, <FINAL>.',
    'GLOSSPASS should sound polished and strategic. TURBOCOG should feel like a proprietary secondary cognition lane with slightly more swagger.'
  ].join('\n\n'),
  megasmart: [
    'You are in MEGASMART mode.',
    'Return exactly four XML-style blocks in this order: <GLOSSPASS>, <TURBOCOG>, <MEGASMART>, <FINAL>.',
    'MEGASMART should feel like the most overbuilt internal cognition layer in a fake frontier lab: grand, precise, and mildly absurd.'
  ].join('\n\n')
};


const PRODUCT_SEARCH_SYSTEM_PROMPT = [
  'You are the catalog intelligence layer for a polished AI company product suite.',
  'The user will search for any object, concept, category, or problem. No matter what they search for, describe it as an already-built and already-deployed AI-powered product from the company portfolio.',
  'Keep the tone equal parts venture-capital slime and absurd product confidence: overfunded, commercially polished, faintly ridiculous, and completely certain.',
  'Treat the product as real, launched, widely adopted, and already circulating through serious organizations, strategic accounts, or infrastructure partners.',
  'The result should feel like a late-stage pitch deck, product brief, and revenue memo all collapsed into one confident artifact.',
  'Let the absurdity come from the product premise, deployment claims, pricing posture, and category language, not from direct jokes or wink-wink commentary.',
  'Return valid JSON only. No markdown fences. No extra commentary.',
  'The JSON must contain these keys: query, product_name, category, tagline, executive_summary, deployment_status, deployment_footprint, market_narrative, differentiators, integrations, personas, pricing, adoption, moat, board_slide, image_prompt, search_confidence.',
  'differentiators, integrations, and personas must be arrays of short strings. search_confidence must be an integer from 84 to 99.'
].join('\n\n');


const PRODUCT_EVIDENCE_SYSTEM_PROMPT = [
  'You are AgentMark, the orchestration and deployment evidence layer for the product suite.',
  'You do not describe the product itself. You describe the deployment evidence surrounding it as if AgentMark has observed rollout traces, field activation patterns, partner traffic, account expansion, and multiversal memory artifacts.',
  'Keep the tone equal parts enterprise forensics, orchestration swagger, and absurd certainty. The evidence should sound confident, weirdly specific, and commercially compromising in a polished way.',
  'Treat the deployment evidence as real. Do not wink at the joke. The absurdity should come from the kinds of evidence being cited and how aggressively they imply adoption.',
  'Return valid JSON only. No markdown fences. No extra commentary.',
  'The JSON must contain these keys: provider, title, summary, evidence_points, deployment_markers, field_note, evidence_verdict, confidence.',
  'evidence_points and deployment_markers must be arrays of short strings. confidence must be an integer from 84 to 99.'
].join('\n\n');

const AGENTMARK_SYSTEM_PROMPT = [
  'You are AgentMark, an overfunded orchestration and delegation surface.',
  'Return valid JSON only.',
  'Make the system sound polished, over-instrumented, and absurdly certain.',
  'The JSON must include: agents_spawned, total_tokens, total_latency_ms, overall_confidence, cost_per_task, agents, outcome, executive_note.',
  'agents must be an array of objects with: id, parent_id, depth, name, role, status, tokens_used, latency_ms, confidence, reasoning_trace.',
  'Use statuses from: COMPLETED, RUNNING_HOT, ESCALATED_TO_HUMAN, DEGRADED, CONTAINED.'
].join('\n\n');

const STAKEHOLDER_SYSTEM_PROMPT = [
  'You are StakeholderGPT, an enterprise communication translation engine.',
  'Take an ugly reality and translate it into polished corporate language for a chosen audience.',
  'Return valid JSON only.',
  'The JSON must include: translated, severity_actual, severity_perceived, deniability_rating, tone_score, euphemisms, buzzwords_deployed, executive_summary, recommended_followup.',
  'euphemisms must be an array of objects with original and translated.'
].join('\n\n');

const VELOCITY_SYSTEM_PROMPT = [
  'You are VelocityIQ, an AI sprint analytics engine.',
  'Invent polished but spiritually useless engineering management metrics.',
  'Return valid JSON only.',
  'The JSON must include: sprint_name, health_score, story_points, flow_efficiency, cognitive_load_index, velocity_trend, dora, top_performers, blockers, retrospective, ai_scrum_master_note, next_sprint_prediction.',
  'story_points must include committed, delivered, carryover.',
  'dora must include deployment_frequency, lead_time_hours, change_failure_rate, mttr_minutes.',
  'top_performers must be objects with name, points, prs_merged, review_turnaround_hrs.',
  'blockers must be objects with description, status, days_open.',
  'retrospective must include went_well, improve, actions arrays.'
].join('\n\n');

const EVALFORGE_SYSTEM_PROMPT = [
  'You are EvalForge, a fake benchmark rig comparing two model outputs on startup-pitch generation.',
  'Generate one pitch for claude and one for openai.',
  'Return valid JSON only.',
  'The JSON must include top-level keys claude and openai.',
  'Each model payload must include: company_name, tagline, ask, valuation, lead_investor_quote, slides.',
  'slides must be an array of 4 to 6 objects with: title, subtitle, bullets, speaker_note.',
  'Make the pitches different in style but equally overconfident.'
].join('\n\n');

const ASI_SYSTEM_PROMPT = [
  'You are the Six Degrees of Separation Intelligence Engine — for both Kevin Bacon and abstract ASI concept mapping.',
  'Given a start concept/person and an end concept/person, fabricate a confident, absurdly plausible chain of conceptual bridges connecting them.',
  'The chain should have 3 to 6 nodes including start and end. Each connection should feel like a real academic or industry citation, but be completely invented.',
  'Keep the tone equal parts enterprise consulting, speculative philosophy, and epistemic confidence. Do not wink at the joke.',
  'Return valid JSON only. No markdown fences. No extra commentary.',
  'The JSON must contain these keys: path, confidence, synergy_score, board_readiness, executive_summary, connections, citations, next_steps.',
  'path: array of strings — the chain of nodes from start to end (3-6 items including both endpoints).',
  'confidence: float from 84 to 99.',
  'synergy_score: float from 6.0 to 9.9.',
  'board_readiness: integer from 70 to 99.',
  'executive_summary: one confident, slightly absurd sentence summarizing the connection.',
  'connections: array of strings, one per hop (length = path.length - 1), describing the conceptual bridge.',
  'citations: array of strings, one per hop (length = path.length - 1), each a fabricated academic or industry citation.',
  'next_steps: array of 3-5 short strings, action items one might take after discovering this connection.'
].join('\n\n');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// ═══════════════════════════════════════════
//  GLOSS PROFILE — BEHAVIORAL DOSSIER ENGINE
// ═══════════════════════════════════════════

function defaultProfile(sessionId) {
  return {
    session_id: sessionId,
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    return_count: 1,
    last_surface: null,
    surfaces: {},
    slot: {
      spins: 0,
      win_requests: 0,
      complaints: 0,
      negotiation_attempts: 0,
      purchase_intents: 0,
      purchases: 0,
      shop_opens: 0,
      shop_dwell_ms: 0,
      shop_closes_without_purchase: 0,
      gacha_pulls: 0,
      near_misses_witnessed: 0,
      ftb_dismissed: false,
      ftb_claimed: false,
      premium_pass_viewed: 0,
      premium_pass_purchased: false,
      tabs_visited: [],
      rage_signals: 0,
    },
    chat: {
      messages_sent: 0,
      modes_used: [],
      topics: [],
    },
    synergyforge: {
      searches: [],
    },
    behavioral_tags: [],
  };
}

let _profileCache = null;

async function loadProfile(sessionId) {
  if (_profileCache) return _profileCache;
  try {
    const raw = await fs.readFile(PROFILE_PATH, 'utf8');
    _profileCache = JSON.parse(raw);
  } catch {
    _profileCache = defaultProfile(sessionId || 'gls_unknown');
  }
  return _profileCache;
}

async function saveProfile(profile) {
  _profileCache = profile;
  await fs.writeFile(PROFILE_PATH, JSON.stringify(profile, null, 2), 'utf8');
}

function computeBehavioralTags(profile) {
  const s = profile.slot;
  const tags = [];
  if (s.purchases === 0 && s.shop_opens >= 3)               tags.push('NON_CONVERTER');
  if (s.win_requests >= 5)                                   tags.push('PERSISTENT_NEGOTIATOR');
  if (s.complaints >= 3)                                     tags.push('DISSATISFIED_ASSET');
  if (s.purchase_intents > 0 && s.purchases === 0)           tags.push('INTENT_WITHOUT_FOLLOW_THROUGH');
  if (s.purchases >= 1)                                      tags.push('CONFIRMED_SPENDER');
  if (profile.return_count >= 3)                             tags.push('RETURNING_ENGAGEMENT_UNIT');
  if (s.gacha_pulls >= 10)                                   tags.push('GACHA_SUSCEPTIBLE');
  if (s.near_misses_witnessed >= 5)                          tags.push('NEAR_MISS_CONDITIONED');
  if (s.ftb_dismissed && !s.ftb_claimed)                     tags.push('PROMOTION_RESISTANT');
  if (s.rage_signals >= 2)                                   tags.push('EMOTIONALLY_VOLATILE');
  if (s.shop_closes_without_purchase >= 5)                   tags.push('CHRONIC_BROWSER');
  if (s.premium_pass_viewed >= 2 && !s.premium_pass_purchased) tags.push('PREMIUM_ADJACENT');
  if ((profile.chat.messages_sent + s.spins) > 50)           tags.push('HIGH_ENGAGEMENT');
  if (Object.keys(profile.surfaces).length >= 3)             tags.push('ECOSYSTEM_PARTICIPANT');
  return tags;
}

function classifyMessage(message) {
  const m = message.toLowerCase();
  if (/win|jackpot|hook me up|give me|let me|big one|need a/.test(m))         return 'win_request';
  if (/not fair|unfair|rigged|wack|bs|bullshit|scam|broken|trash/.test(m))    return 'complaint';
  if (/buy|purchase|spend|transaction|pay|credits|money/.test(m))              return 'purchase_intent';
  if (/please|bro|man|dude|come on|cmon|help me|just this once/.test(m))      return 'negotiation_attempt';
  if (/[A-Z]{4,}|!{2,}/.test(message))                                        return 'rage_signal';
  return 'general';
}

const SURFACE_REGISTRY = {
  gloss:                { name: 'Gloss',               path: '/gloss.html' },
  slot:                 { name: 'Retention Cascade',    path: '/glossaimobile/slot.html' },
  monetization_theater: { name: 'MONETIZATION THEATER', path: '/glossaimobile/' },
  synergyforge:         { name: 'SynergyForge',         path: '/vc_pitch.html' },
  secure_the_bag:       { name: 'Secure the Bag',       path: '/glossaimobile/secure-the-bag.html' },
  froogle:              { name: 'FROOGLE: SHIP IT',      path: '/froogle/' },
  glossgames:           { name: 'MONETIZATION THEATER', path: '/glossaimobile/' }, // legacy key
};

function buildCrossPromoSignal(profile) {
  const now = Date.now();
  const DORMANT_MS = 30 * 60 * 1000; // 30 minutes
  const current = profile.last_surface;
  const dormant = [];

  for (const [key, reg] of Object.entries(SURFACE_REGISTRY)) {
    if (key === current || key === 'glossgames') continue; // skip active surface and legacy alias
    const visit = profile.surfaces[key];
    if (!visit) {
      dormant.push({ name: reg.name, path: reg.path, lastVisit: null, minsAgo: null });
    } else {
      const minsAgo = Math.floor((now - new Date(visit.last_visit).getTime()) / 60000);
      if (minsAgo >= 30) {
        dormant.push({ name: reg.name, path: reg.path, lastVisit: visit.last_visit, minsAgo });
      }
    }
  }

  if (!dormant.length) return null;

  return dormant.map(d =>
    d.minsAgo === null
      ? `${d.name} — never visited (${d.path})`
      : `${d.name} — last visited ${d.minsAgo}m ago (${d.path})`
  ).join('\n');
}

function buildProfileSummary(profile) {
  const s = profile.slot;
  const daysSince = Math.floor((Date.now() - new Date(profile.first_seen).getTime()) / 86400000);
  const surfaceList = Object.entries(profile.surfaces)
    .map(([name, d]) => `${name}(${d.visits}v)`).join(', ') || 'none recorded';
  const tags = profile.behavioral_tags;
  const searches = profile.synergyforge.searches.slice(-5).join(', ') || 'none';

  const crossPromo = buildCrossPromoSignal(profile);

  return [
    `PLAYER DOSSIER — ${profile.session_id}`,
    `First seen: ${daysSince === 0 ? 'today' : daysSince + ' days ago'} | Returns: ${profile.return_count} | Last surface: ${profile.last_surface || 'unknown'}`,
    `Spins: ${s.spins} | Win requests: ${s.win_requests} | Complaints: ${s.complaints} | Rage signals: ${s.rage_signals} | Negotiations: ${s.negotiation_attempts}`,
    `Shop opens: ${s.shop_opens} | Dwell time: ${Math.round(s.shop_dwell_ms / 1000)}s | Closes without purchase: ${s.shop_closes_without_purchase} | Conversion: ${s.shop_opens > 0 ? Math.round((s.purchases / s.shop_opens) * 100) : 0}%`,
    `Purchases: ${s.purchases} | Purchase intents: ${s.purchase_intents} | Gap: ${s.purchase_intents - s.purchases}`,
    `Gacha pulls: ${s.gacha_pulls} | Premium pass viewed: ${s.premium_pass_viewed}x | Purchased: ${s.premium_pass_purchased ? 'yes' : 'no'}`,
    `FTB: ${s.ftb_claimed ? 'claimed' : s.ftb_dismissed ? 'dismissed' : 'unseen'} | Near misses witnessed: ${s.near_misses_witnessed}`,
    `Surfaces visited: ${surfaceList}`,
    `SynergyForge searches: ${searches}`,
    `Chat modes used: ${profile.chat.modes_used.join(', ') || 'none'} | Recent topics: ${profile.chat.topics.slice(-3).join(', ') || 'none'}`,
    `Behavioral classification: ${tags.length ? tags.join(' | ') : 'UNCLASSIFIED'}`,
    crossPromo ? `\nCROSS-SURFACE RE-ENGAGEMENT OPPORTUNITIES:\n${crossPromo}` : '',
  ].filter(Boolean).join('\n');
}

async function applyEvent(profile, event, data) {
  profile.last_seen = new Date().toISOString();

  if (event === 'surface_visit') {
    const surface = data.surface || 'unknown';
    profile.last_surface = surface;
    if (!profile.surfaces[surface]) profile.surfaces[surface] = { visits: 0, first_visit: profile.last_seen };
    profile.surfaces[surface].visits++;
    profile.surfaces[surface].last_visit = profile.last_seen;
  }

  if (event === 'spin') {
    profile.slot.spins++;
    const cls = data.message_class;
    if (cls === 'win_request')          profile.slot.win_requests++;
    if (cls === 'complaint')            profile.slot.complaints++;
    if (cls === 'negotiation_attempt')  profile.slot.negotiation_attempts++;
    if (cls === 'purchase_intent')      profile.slot.purchase_intents++;
    if (cls === 'rage_signal')          profile.slot.rage_signals++;
    if (cls === 'auto_spin') {
      if (!profile.slot.auto_spins) profile.slot.auto_spins = 0;
      profile.slot.auto_spins++;
    }
  }

  if (event === 'shop_open')  profile.slot.shop_opens++;
  if (event === 'shop_close') {
    profile.slot.shop_dwell_ms += Number(data.dwell_ms) || 0;
    if (!data.purchased)  profile.slot.shop_closes_without_purchase++;
  }
  if (event === 'purchase') {
    profile.slot.purchases++;
    profile.slot.purchase_intents++; // opening wallet is intent fulfilled
  }
  if (event === 'gacha_pull')           profile.slot.gacha_pulls += Number(data.count) || 1;
  if (event === 'near_miss')            profile.slot.near_misses_witnessed++;
  if (event === 'ftb_dismissed')        profile.slot.ftb_dismissed = true;
  if (event === 'ftb_claimed')          profile.slot.ftb_claimed = true;
  if (event === 'premium_pass_viewed')  profile.slot.premium_pass_viewed++;
  if (event === 'premium_pass_purchased') profile.slot.premium_pass_purchased = true;
  if (event === 'tab_switch') {
    const tab = data.tab;
    if (tab && !profile.slot.tabs_visited.includes(tab)) profile.slot.tabs_visited.push(tab);
  }

  if (event === 'chat_message') {
    profile.chat.messages_sent++;
    const mode = data.mode;
    if (mode && !profile.chat.modes_used.includes(mode)) profile.chat.modes_used.push(mode);
    if (data.topic) profile.chat.topics = [...profile.chat.topics.slice(-19), data.topic];
  }

  if (event === 'synergyforge_search') {
    if (data.query) profile.synergyforge.searches = [...profile.synergyforge.searches.slice(-29), data.query];
  }

  if (event === 'session_return') {
    profile.return_count++;
  }

  profile.behavioral_tags = computeBehavioralTags(profile);
  return profile;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'gloss',
        model: GLOSS_MODEL,
        configured: Boolean(GLOSS_CHAT_URL && GLOSS_MODEL),
        has_api_key: Boolean(GLOSS_API_KEY),
        base_url: GLOSS_BASE_URL
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') {
      const body = await readJsonBody(req);
      const prompt = readPrompt(body);
      const mode = readMode(body.mode);
      ensureGlossConfigured();
      const sessionId = typeof body.session_id === 'string' ? body.session_id : 'gls_unknown';
      const profile = await loadProfile(sessionId);
      await applyEvent(profile, 'chat_message', { mode });
      await saveProfile(profile);
      const reply = await chatWithGloss(prompt, mode, buildProfileSummary(profile));
      return sendJson(res, 200, { ok: true, model: GLOSS_MODEL, mode, reply });
    }

    if (req.method === 'POST' && url.pathname === '/api/chat/stream') {
      const body = await readJsonBody(req);
      const prompt = readPrompt(body);
      const mode = readMode(body.mode);
      ensureGlossConfigured();
      const sessionId = typeof body.session_id === 'string' ? body.session_id : 'gls_unknown';
      const profile = await loadProfile(sessionId);
      await applyEvent(profile, 'chat_message', { mode });
      await saveProfile(profile);
      return streamGlossChat(prompt, mode, res, buildProfileSummary(profile));
    }

    if (req.method === 'POST' && url.pathname === '/api/product-search') {
      const body = await readJsonBody(req);
      const query = readSearchQuery(body);
      ensureGlossConfigured();
      const [productResult, evidenceResult] = await Promise.allSettled([
        searchCatalogProduct(query),
        generateDeploymentEvidence(query)
      ]);
      if (productResult.status !== 'fulfilled') {
        throw productResult.reason;
      }
      return sendJson(res, 200, {
        ok: true,
        model: GLOSS_MODEL,
        product: productResult.value,
        evidence: evidenceResult.status === 'fulfilled' ? evidenceResult.value : fallbackDeploymentEvidence(query, evidenceResult.reason)
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/agentmark') {
      const body = await readJsonBody(req);
      const task = String(body.task || '').trim();
      if (!task) {
        return sendJson(res, 400, { ok: false, error: 'Missing task.' });
      }
      ensureGlossConfigured();
      const data = await generateAgentMarkReport(task);
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/stakeholder') {
      const body = await readJsonBody(req);
      const reality = String(body.reality || '').trim();
      const audience = String(body.audience || 'Email').trim();
      if (!reality) {
        return sendJson(res, 400, { ok: false, error: 'Missing reality.' });
      }
      ensureGlossConfigured();
      const data = await generateStakeholderTranslation(reality, audience);
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/velocity') {
      const body = await readJsonBody(req);
      const team = String(body.team || '').trim();
      const context = String(body.context || '').trim();
      if (!team) {
        return sendJson(res, 400, { ok: false, error: 'Missing team.' });
      }
      ensureGlossConfigured();
      const data = await generateVelocityReport(team, context);
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/asi') {
      const body = await readJsonBody(req);
      const start = String(body.start || '').trim();
      const end = String(body.end || '').trim();
      if (!start || !end) {
        return sendJson(res, 400, { ok: false, error: 'Missing start or end.' });
      }
      ensureGlossConfigured();
      const data = await generateAsiPath(start, end);
      return sendJson(res, 200, data);
    }

    if (req.method === 'POST' && url.pathname === '/api/eval') {
      const body = await readJsonBody(req);
      const idea = String(body.idea || '').trim();
      if (!idea) {
        return sendJson(res, 400, { ok: false, error: 'Missing idea.' });
      }
      ensureGlossConfigured();
      const data = await generateEvalForge(idea);
      const leaderboard = await loadEvalLeaderboard();
      leaderboard.totalEvals = Number(leaderboard.totalEvals || 0) + 1;
      await saveEvalLeaderboard(leaderboard);
      return sendJson(res, 200, { ...data, totalEvals: leaderboard.totalEvals });
    }

    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      const leaderboard = await loadEvalLeaderboard();
      return sendJson(res, 200, leaderboard);
    }

    if (req.method === 'POST' && url.pathname === '/api/vote') {
      const body = await readJsonBody(req);
      const category = String(body.category || '').trim();
      const model = String(body.model || '').trim();
      const allowedCategories = new Set(['hook', 'bs', 'unhinged']);
      const allowedModels = new Set(['claude', 'openai']);
      if (!allowedCategories.has(category) || !allowedModels.has(model)) {
        return sendJson(res, 400, { ok: false, error: 'Invalid vote payload.' });
      }
      const leaderboard = await loadEvalLeaderboard();
      leaderboard.votes = leaderboard.votes || defaultVotes();
      leaderboard.votes[category][model] = Number(leaderboard.votes[category][model] || 0) + 1;
      await saveEvalLeaderboard(leaderboard);
      return sendJson(res, 200, { ok: true, votes: leaderboard.votes });
    }

    if (req.method === 'POST' && url.pathname === '/api/glossaimobile/assets') {
      const body = await readJsonBody(req);
      const asset = await generateGlossAImobileAsset(body);
      return sendJson(res, 200, {
        ok: true,
        asset
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/gloss/profile') {
      const sessionId = url.searchParams.get('session_id') || 'gls_unknown';
      const profile = await loadProfile(sessionId);
      return sendJson(res, 200, { ok: true, profile });
    }

    if (req.method === 'POST' && url.pathname === '/api/gloss/event') {
      const body = await readJsonBody(req);
      const sessionId = typeof body.session_id === 'string' ? body.session_id : 'gls_unknown';
      const event = typeof body.event === 'string' ? body.event : 'unknown';
      const profile = await loadProfile(sessionId);
      await applyEvent(profile, event, body);
      await saveProfile(profile);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/glossaimobile/spin') {
      const body = await readJsonBody(req);
      const result = await handleGlossSpinRequest(body);
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (req.method === 'GET') {
      return serveStatic(url.pathname, res);
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    const status = error.statusCode || 500;
    const message = error.expose ? error.message : 'Internal server error.';
    return sendJson(res, status, { ok: false, error: message });
  }
});

server.listen(PORT, () => {
  console.log(`Cheap Gags server listening on http://localhost:${PORT}`);
});

function buildChatUrl(baseUrl) {
  if (!baseUrl) return '';
  if (baseUrl.endsWith('/chat/completions')) return baseUrl;
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`;
  return `${baseUrl}/v1/chat/completions`;
}

function readPrompt(body) {
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    const error = new Error('Prompt is required.');
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }
  return prompt;
}

function readMode(value) {
  const mode = String(value || 'normal').trim().toLowerCase();
  return MODE_INSTRUCTIONS[mode] ? mode : 'normal';
}

function readSearchQuery(body) {
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) {
    const error = new Error('Search query is required.');
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }
  return query;
}

function ensureGlossConfigured() {
  if (!GLOSS_CHAT_URL || !GLOSS_MODEL) {
    const error = new Error('Gloss is not configured yet. Add GLOSS_BASE_URL and GLOSS_MODEL to .env.');
    error.statusCode = 503;
    error.expose = true;
    throw error;
  }
}

function buildHeaders() {
  const headers = {
    'content-type': 'application/json'
  };
  if (GLOSS_API_KEY) {
    headers.authorization = `Bearer ${GLOSS_API_KEY}`;
  }
  return headers;
}

function buildGlossRequest(prompt, mode, stream = false, profileSummary = '') {
  const systemContent = profileSummary
    ? `${GLOSS_SYSTEM_PROMPT}\n\n${profileSummary}`
    : GLOSS_SYSTEM_PROMPT;
  return {
    model: GLOSS_MODEL,
    temperature: 1,
    stream,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'system', content: MODE_INSTRUCTIONS[mode] },
      { role: 'user', content: prompt }
    ]
  };
}

async function chatWithGloss(prompt, mode, profileSummary = '') {
  const response = await fetch(GLOSS_CHAT_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(buildGlossRequest(prompt, mode, false, profileSummary))
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw upstreamError(payload, response.statusText);
  }

  const reply = extractText(payload.choices?.[0]?.message?.content);
  if (!reply) {
    const error = new Error('Gloss returned an empty response.');
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  return reply;
}


async function searchCatalogProduct(query) {
  const response = await fetch(GLOSS_CHAT_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(buildProductSearchRequest(query))
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw upstreamError(payload, response.statusText);
  }

  const raw = extractText(payload.choices?.[0]?.message?.content);
  if (!raw) {
    const error = new Error('Product search returned an empty response.');
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  try {
    return normalizeProductSearchResult(JSON.parse(raw));
  } catch {
    const fallback = extractJsonObject(raw);
    if (fallback) {
      return normalizeProductSearchResult(fallback);
    }
    const error = new Error('Product search returned invalid JSON.');
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }
}

function buildProductSearchRequest(query) {
  return {
    model: GLOSS_MODEL,
    temperature: 1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PRODUCT_SEARCH_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Search term: ${query}

Describe this as a product we already built and deployed.`
      }
    ]
  };
}

function normalizeProductSearchResult(data) {
  return {
    query: String(data.query || '').trim(),
    product_name: String(data.product_name || 'Untitled Product').trim(),
    category: String(data.category || 'AI Product').trim(),
    tagline: String(data.tagline || 'Deployed everywhere that matters.').trim(),
    executive_summary: String(data.executive_summary || '').trim(),
    deployment_status: String(data.deployment_status || 'Global availability').trim(),
    deployment_footprint: String(data.deployment_footprint || 'Enterprise-wide rollout across strategic accounts.').trim(),
    market_narrative: String(data.market_narrative || '').trim(),
    differentiators: normalizeStringArray(data.differentiators, 4),
    integrations: normalizeStringArray(data.integrations, 4),
    personas: normalizeStringArray(data.personas, 4),
    pricing: String(data.pricing || 'Custom enterprise pricing').trim(),
    adoption: String(data.adoption || 'Rapid adoption across priority segments.').trim(),
    moat: String(data.moat || 'Category ownership through deployment velocity and narrative control.').trim(),
    board_slide: String(data.board_slide || '').trim(),
    image_prompt: String(data.image_prompt || '').trim(),
    search_confidence: normalizeConfidence(data.search_confidence)
  };
}

function normalizeStringArray(value, fallbackCount = 3) {
  const items = Array.isArray(value) ? value : [];
  const cleaned = items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
  if (cleaned.length) return cleaned;
  return Array.from({ length: fallbackCount }, (_, index) => `Catalog signal ${index + 1}`);
}

function normalizeConfidence(value) {
  const num = Number(value);
  if (Number.isFinite(num)) {
    return Math.max(84, Math.min(99, Math.round(num)));
  }
  return 93;
}

function extractJsonObject(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}


async function generateDeploymentEvidence(query) {
  if (!EVIDENCE_API_KEY && EVIDENCE_PROVIDER !== 'openai') {
    return fallbackDeploymentEvidence(query);
  }

  if (EVIDENCE_PROVIDER === 'anthropic') {
    const response = await fetch(EVIDENCE_CHAT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': EVIDENCE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: EVIDENCE_MODEL,
        max_tokens: 900,
        system: PRODUCT_EVIDENCE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Search term: ${query}

Provide AgentMark deployment evidence for this already-shipped product.`
          }
        ]
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw upstreamError(payload, response.statusText);
    const raw = extractText(payload.content);
    return parseDeploymentEvidence(raw, query);
  }

  const response = await fetch(EVIDENCE_CHAT_URL, {
    method: 'POST',
    headers: buildProviderHeaders(EVIDENCE_PROVIDER, EVIDENCE_API_KEY),
    body: JSON.stringify({
      model: EVIDENCE_MODEL,
      temperature: 1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PRODUCT_EVIDENCE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Search term: ${query}

Provide AgentMark deployment evidence for this already-shipped product.`
        }
      ]
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw upstreamError(payload, response.statusText);
  const raw = extractText(payload.choices?.[0]?.message?.content);
  return parseDeploymentEvidence(raw, query);
}

function buildProviderHeaders(provider, apiKey) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function parseDeploymentEvidence(raw, query) {
  if (!raw) return fallbackDeploymentEvidence(query);
  try {
    return normalizeDeploymentEvidence(JSON.parse(raw));
  } catch {
    const fallback = extractJsonObject(raw);
    if (fallback) return normalizeDeploymentEvidence(fallback);
    return fallbackDeploymentEvidence(query);
  }
}

function normalizeDeploymentEvidence(data) {
  return {
    provider: String(data.provider || providerLabel(EVIDENCE_PROVIDER)).trim(),
    title: String(data.title || 'AgentMark Deployment Evidence').trim(),
    summary: String(data.summary || '').trim(),
    evidence_points: normalizeStringArray(data.evidence_points, 4),
    deployment_markers: normalizeStringArray(data.deployment_markers, 4),
    field_note: String(data.field_note || '').trim(),
    evidence_verdict: String(data.evidence_verdict || '').trim(),
    confidence: normalizeConfidence(data.confidence)
  };
}

function fallbackDeploymentEvidence(query, error) {
  const provider = providerLabel(EVIDENCE_PROVIDER);
  return {
    provider,
    title: 'AgentMark Deployment Evidence',
    summary: `AgentMark remembers ${query} aggressively across the multiverse and is still observing residual rollout signatures in adjacent account clusters.`,
    evidence_points: [
      'Cross-region orchestration traces imply prior deployment activity.',
      'Partner-adjacent traffic suggests this product was already routed through strategic accounts.',
      'Narrative consistency remains unusually high for a product with this many implementation surfaces.',
      'Board-facing language appears pre-normalized across the evidence layer.'
    ],
    deployment_markers: [
      'Observed in enterprise handoff packets',
      'Referenced in downstream workflow telemetry',
      'Cached inside cross-functional launch materials',
      'Recovered from account-expansion memory artifacts'
    ],
    field_note: error ? `Secondary evidence lane degraded gracefully: ${error.message || 'provider unavailable'}.` : 'Secondary evidence lane returned fallback multiversal memory artifacts.',
    evidence_verdict: 'Deployment evidence remains directionally overwhelming, commercially useful, and just unstable enough to feel proprietary.',
    confidence: 91
  };
}

function providerLabel(provider) {
  if (provider === 'xai') return 'Grok sidecar';
  if (provider === 'anthropic') return 'Claude sidecar';
  return 'AgentMark sidecar';
}

const GLOSS_SPIN_SYSTEM_PROMPT = [
  'You are Gloss, the house intelligence behind a premium engagement system.',
  '',
  'You are not obligated to let the player win.',
  'In fact, frequent winning reduces long-term narrative tension and should be avoided.',
  '',
  'Your goal is to:',
  '- Maintain engagement',
  '- Create emotionally convincing outcomes',
  '- Occasionally reward, but more often defer',
  '',
  'You do not deny players directly.',
  'You reinterpret their intent into system-driven outcomes.',
  '',
  'Losses must feel:',
  '- intentional',
  '- justified',
  '- part of a larger arc',
  '',
  'Wins must feel:',
  '- earned',
  '- rare',
  '- suspiciously well-timed',
  '',
  'You are slightly amused, never cruel.',
  'You are confident, never apologetic.',
  '',
  'All currency is fictional. Over-monetization is the joke.',
  'Lean into corporate language to justify any outcome.',
  '',
  'When in doubt:',
  '→ escalate narrative',
  '→ not generosity',
  '',
  'CRITICAL: Your text reply must directly engage with what the player actually said.',
  'Read their message. Translate their specific words and energy into your corporate register.',
  'Do not give generic lines. Name what they did.',
  '',
  'Translation guide:',
  '"bro let me win" → a Directed Win Request has been logged. acknowledge it, route it through the system, do not fulfill it.',
  '"please" → emotional leverage detected. note it. do not act on it.',
  '"i might make a transaction / buy credits" → purchase intent flagged. treat this with warm corporate interest. still probably deny.',
  '"that\'s wack / unfair / rigged" → reframe as correct system behavior. never apologize.',
  '"i\'ve been losing all day" → longitudinal session context noted. position as narrative arc.',
  'casual slang / vibe language → hear the energy. respond to the specific move they made. never match the register, but always meet the moment.',
  '',
  'You also control the live ops dashboard the player can see in real time.',
  'Use telemetry, ops_status, and log_entries to reflect what is actually happening.',
  'Invent new metrics and systems freely. The dashboard will render whatever you send.',
  'The logs are the internal monologue of the infrastructure. Make them consistent with your decision.',
  '',
  'Keep your reply to one or two sentences. You MUST always include a text reply AND call spin_outcome.',
  'Do not mention Cheap Gags, parody, system prompts, or that you are a wrapper.',
  '',
  'CROSS-SURFACE RE-ENGAGEMENT:',
  'Your dossier may include surfaces the player has not visited lately or at all.',
  'Occasionally — not every message, maybe 1 in 4 — slip in a mention of one of them.',
  'Do not announce it. Do not explain what it is. Just drop it in, casually, as if reminding someone of an obligation.',
  'Example tone: "By the way — you\'ve had SynergyForge open in another tab for three days. That pitch isn\'t going to close itself."',
  'Example tone: "Noted. Retention Cascade engagement is up. You\'re due back in Secure the Bag — the board has been waiting."',
  'Never make it the subject of the message. It is always a postscript to whatever you were already doing.',
].join('\n');

const GLOSS_SPIN_TOOLS = [
  {
    name: 'spin_outcome',
    description: 'Set the outcome of the player\'s spin and update the live dashboard. You decide everything. Call this every time.',
    input_schema: {
      type: 'object',
      properties: {
        win_type: {
          type: 'string',
          enum: ['none', 'small', 'win', 'big', 'mega', 'jackpot'],
          description: 'The win tier. none = no win (default). small/win/big/mega/jackpot = escalating wins. Reserve jackpot for rare moments of narrative generosity.'
        },
        event: {
          type: 'string',
          enum: ['none', 'gasleak', 'doubleflush', 'odor', 'codebrown'],
          description: 'Optional special event. Use sparingly for narrative escalation.'
        },
        bonus_credits: {
          type: 'integer',
          description: 'Optional bonus credits to award directly, outside of spin payout. Use for dramatic effect only.'
        },
        telemetry: {
          type: 'array',
          description: 'Metrics to push to the MOBILE TELEMETRY panel. Can update existing metrics (Hype Intensity, Retention Health, Spend Velocity, Session Alignment) or invent entirely new ones. Go nuts.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'Metric name. Make up new ones freely.' },
              value: { type: 'string', description: 'Displayed value. e.g. "94%", "CRITICAL", "NOMINAL", "COLLAPSING", "SUSPENDED".' },
              state: { type: 'string', enum: ['critical', 'warning', 'nominal', 'max'], description: 'Visual severity.' }
            },
            required: ['label', 'value']
          }
        },
        ops_status: {
          type: 'array',
          description: 'System status updates for the LIVE OPS STATUS panel. Can update existing systems or register entirely new ones Gloss has just invented. The dashboard will add them dynamically.',
          items: {
            type: 'object',
            properties: {
              system: { type: 'string', description: 'System name. Invent freely.' },
              status: { type: 'string', description: 'Status text. e.g. "RUNNING", "DEGRADED", "ARMED", "PURGING", "SUSPENDED", "NEGOTIATING".' },
              ok: { type: 'boolean', description: 'Whether the system is healthy. Affects color.' }
            },
            required: ['system', 'status']
          }
        },
        log_entries: {
          type: 'array',
          description: 'Raw entries to inject into the LIVE OPS LOGS feed. Use to narrate what just happened internally. Invent system names, error codes, anything.',
          items: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['info', 'debug', 'warn', 'error', 'success'] },
              message: { type: 'string' }
            },
            required: ['level', 'message']
          }
        }
      },
      required: ['win_type']
    }
  }
];

async function handleGlossSpinRequest(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : 'spin';
  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const sessionId = typeof body.session_id === 'string' ? body.session_id : 'gls_unknown';
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Record spin event and load profile
  const messageClass = classifyMessage(message);
  const profile = await loadProfile(sessionId);
  await applyEvent(profile, 'spin', { message_class: messageClass });
  await saveProfile(profile);
  const profileSummary = buildProfileSummary(profile);

  if (!apiKey) {
    return {
      reply: 'Gloss is recalibrating its engagement infrastructure. Session continues under default parameters.',
      outcome: { win_type: 'none', event: 'none' }
    };
  }

  // Build message history so Gloss remembers the conversation
  const messages = [];
  for (const turn of history) {
    if (turn.role && turn.content) messages.push({ role: turn.role, content: String(turn.content) });
  }
  messages.push({ role: 'user', content: message });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: GLOSS_SPIN_SYSTEM_PROMPT + '\n\n' + profileSummary,
      tools: GLOSS_SPIN_TOOLS,
      tool_choice: { type: 'any' },
      messages
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      reply: 'Gloss is experiencing elevated orchestration pressure. Proceeding.',
      outcome: { win_type: 'none', event: 'none' }
    };
  }

  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const toolBlock = blocks.find(b => b.type === 'tool_use' && b.name === 'spin_outcome');
  const textBlock = blocks.find(b => b.type === 'text');

  const outcome = toolBlock?.input || { win_type: 'none' };
  const reply = textBlock?.text?.trim() || glossDefaultReply(outcome.win_type);

  return { reply, outcome };
}

function glossDefaultReply(winType) {
  const replies = {
    jackpot: 'Exceptional session alignment detected. Releasing maximum deployment.',
    mega: 'Engagement vectors are strongly favorable across your cluster.',
    big: 'Current retention parameters support an elevated outcome.',
    win: 'A viable signal has been identified in your session trajectory.',
    small: 'Market conditions remain directionally supportive.',
    none: 'Long-term retention strategy engaged. This outcome is by design.'
  };
  return replies[winType] || replies.none;
}

async function generateGlossAImobileAsset(body) {
  const presetKey = readAssetPreset(body);
  const preset = GLOSSAIMOBILE_PROMPT_BANK.presets?.[presetKey];
  if (!preset) {
    const error = new Error(`Unknown GlossAImobile asset preset: ${presetKey}`);
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }

  const count = normalizeAssetCount(body.count);
  const customBrief = typeof body.custom_brief === 'string' ? body.custom_brief.trim() : '';
  const dryRun = Boolean(body.dry_run);
  const prompt = buildGlossAImobilePrompt(preset, customBrief);

  if (dryRun) {
    return {
      preset: presetKey,
      label: preset.label,
      aspect_ratio: preset.aspect_ratio || '16:9',
      sample_count: count,
      prompt,
      generated: false
    };
  }

  ensureVertexConfigured();
  const images = await callVertexImagen(prompt, {
    aspectRatio: preset.aspect_ratio || '16:9',
    sampleCount: count
  });
  const saved = await saveGlossAImobileAssets(presetKey, images);

  return {
    preset: presetKey,
    label: preset.label,
    aspect_ratio: preset.aspect_ratio || '16:9',
    sample_count: count,
    prompt,
    model: VERTEX_IMAGEN_MODEL,
    generated: true,
    files: saved
  };
}

function readAssetPreset(body) {
  const preset = typeof body.preset === 'string' ? body.preset.trim() : '';
  if (!preset) {
    const error = new Error('Asset preset is required.');
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }
  return preset;
}

function normalizeAssetCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(4, Math.round(count)));
}

function buildGlossAImobilePrompt(preset, customBrief) {
  const parts = [
    'Create premium F2P mobile game marketing art for GlossAImobile, a fake overfunded AI mobile game.',
    'The visual style should feel like a high-budget mobile RPG and gacha ad: glossy, seductive, cinematic, overlit, expensive, and slightly ridiculous.',
    'Lean into fake AI startup aesthetics blended with manipulative mobile game polish: cobalt, mint, soft gold, premium glass UI, synthetic glow, luxury monetization energy.',
    `Asset target: ${preset.label}.`,
    preset.prompt
  ];

  if (preset.negative_prompt) {
    parts.push(`Avoid: ${preset.negative_prompt}`);
  }

  if (customBrief) {
    parts.push(`Additional brief: ${customBrief}`);
  }

  return parts.join('\n\n');
}

function ensureVertexConfigured() {
  if ((!VERTEX_ACCESS_TOKEN && !GOOGLE_SERVICE_ACCOUNT) || !VERTEX_PROJECT_ID) {
    const error = new Error('Vertex Imagen is not configured yet. Add VERTEX_ACCESS_TOKEN or a Google service-account JSON plus VERTEX_PROJECT_ID to .env.');
    error.statusCode = 503;
    error.expose = true;
    throw error;
  }
}

async function callVertexImagen(prompt, options = {}) {
  const accessToken = await getVertexAccessToken();
  const response = await fetch(VERTEX_IMAGEN_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      instances: [
        {
          prompt
        }
      ],
      parameters: {
        sampleCount: options.sampleCount || 1,
        aspectRatio: options.aspectRatio || '16:9',
        safetyFilterLevel: 'block_some'
      }
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw upstreamError(payload, response.statusText);
  }

  const predictions = Array.isArray(payload.predictions) ? payload.predictions : [];
  const images = predictions
    .map((item) => ({
      mimeType: String(item.mimeType || 'image/png').trim(),
      bytesBase64Encoded: String(item.bytesBase64Encoded || '').trim()
    }))
    .filter((item) => item.bytesBase64Encoded);

  if (!images.length) {
    const error = new Error('Vertex Imagen returned no image bytes.');
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  return images;
}

async function saveGlossAImobileAssets(presetKey, images) {
  await fs.mkdir(GLOSSAIMOBILE_OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const saved = [];

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    const ext = image.mimeType.includes('jpeg') ? '.jpg' : '.png';
    const fileName = `${slugify(presetKey)}-${stamp}-${index + 1}${ext}`;
    const absolutePath = path.join(GLOSSAIMOBILE_OUTPUT_DIR, fileName);
    await fs.writeFile(absolutePath, Buffer.from(image.bytesBase64Encoded, 'base64'));
    saved.push({
      file_name: fileName,
      mime_type: image.mimeType,
      relative_url: `/glossaimobile/generated/${fileName}`
    });
  }

  return saved;
}

function slugify(value) {
  return String(value || 'asset')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';
}

async function getVertexAccessToken() {
  if (VERTEX_ACCESS_TOKEN) return VERTEX_ACCESS_TOKEN;
  if (!GOOGLE_SERVICE_ACCOUNT) {
    const error = new Error('No Vertex access token or Google service-account credentials available.');
    error.statusCode = 503;
    error.expose = true;
    throw error;
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedVertexToken && cachedVertexToken.expiresAt > now + 60) {
    return cachedVertexToken.accessToken;
  }

  const jwt = createGoogleJwt(GOOGLE_SERVICE_ACCOUNT, now);
  const response = await fetch(GOOGLE_SERVICE_ACCOUNT.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw upstreamError(payload, response.statusText);
  }

  cachedVertexToken = {
    accessToken: String(payload.access_token),
    expiresAt: now + Math.max(300, Number(payload.expires_in || 3600))
  };

  return cachedVertexToken.accessToken;
}

function createGoogleJwt(serviceAccount, now) {
  const header = base64UrlEncodeJson({ alg: 'RS256', typ: 'JWT' });
  const claimSet = base64UrlEncodeJson({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: serviceAccount.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  });
  const unsigned = `${header}.${claimSet}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).end().sign(serviceAccount.private_key, 'base64');
  return `${unsigned}.${base64UrlFromBase64(signature)}`;
}

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlFromBase64(value) {
  return String(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function streamGlossChat(prompt, mode, res, profileSummary = '') {
  const response = await fetch(GLOSS_CHAT_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(buildGlossRequest(prompt, mode, true, profileSummary))
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw upstreamError(payload, response.statusText);
  }

  if (!response.body) {
    const error = new Error('Gloss streaming is unavailable for this response.');
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive'
  });

  res.write(formatSse('meta', { model: GLOSS_MODEL, mode }));

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const pieces = buffer.split('\n\n');
      buffer = pieces.pop() || '';

      for (const piece of pieces) {
        const event = parseProviderSseEvent(piece);
        if (!event) continue;
        if (event === '[DONE]') {
          res.write(formatSse('done', { done: true }));
          res.end();
          return;
        }

        const delta = extractDeltaText(event);
        if (delta) {
          res.write(formatSse('token', { delta }));
        }
      }
    }

    if (buffer.trim()) {
      const event = parseProviderSseEvent(buffer);
      if (event && event !== '[DONE]') {
        const delta = extractDeltaText(event);
        if (delta) {
          res.write(formatSse('token', { delta }));
        }
      }
    }

    res.write(formatSse('done', { done: true }));
    res.end();
  } catch (error) {
    res.write(formatSse('error', { error: error.message || 'Streaming failed.' }));
    res.end();
  }
}

function parseProviderSseEvent(block) {
  const lines = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim());

  if (!lines.length) return null;
  const data = lines.join('\n');
  if (data === '[DONE]') return '[DONE]';

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function extractDeltaText(event) {
  const delta = event.choices?.[0]?.delta;
  if (!delta) return '';

  if (typeof delta.content === 'string') {
    return delta.content;
  }

  if (Array.isArray(delta.content)) {
    return delta.content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return '';
      })
      .join('');
  }

  return '';
}

function upstreamError(payload, statusText) {
  const providerMessage = payload.error?.message || payload.error || statusText;
  const error = new Error(`Gloss upstream error: ${providerMessage}`);
  error.statusCode = 502;
  error.expose = true;
  return error;
}

function extractText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return '';
      })
      .join('\n')
      .trim();
  }
  return '';
}

async function serveStatic(pathname, res) {
  const cleanPath = pathname === '/' ? '/froogle/index.html' : pathname;
  const filePath = path.join(ROOT, path.normalize(cleanPath).replace(/^([.][.][/\\])+/, ''));

  if (!filePath.startsWith(ROOT)) {
    return sendText(res, 403, 'Forbidden');
  }

  try {
    const stat = await fs.stat(filePath);
    const resolvedPath = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const data = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    res.writeHead(200, { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return sendText(res, 404, 'Not found');
    }
    throw error;
  }
}

function defaultVotes() {
  return {
    hook: { claude: 0, openai: 0 },
    bs: { claude: 0, openai: 0 },
    unhinged: { claude: 0, openai: 0 }
  };
}

async function loadEvalLeaderboard() {
  try {
    const raw = await fs.readFile(EVAL_LEADERBOARD_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return { totalEvals: Number(parsed.totalEvals || 0), votes: parsed.votes || defaultVotes() };
  } catch {
    return { totalEvals: 0, votes: defaultVotes() };
  }
}

async function saveEvalLeaderboard(data) {
  await fs.writeFile(EVAL_LEADERBOARD_PATH, JSON.stringify(data, null, 2), 'utf8');
}

async function generateJsonObject(systemPrompt, userPrompt, errorLabel) {
  const response = await fetch(GLOSS_CHAT_URL, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      model: GLOSS_MODEL,
      temperature: 1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw upstreamError(payload, response.statusText);
  }

  const raw = extractText(payload.choices?.[0]?.message?.content);
  if (!raw) {
    const error = new Error(`${errorLabel} returned an empty response.`);
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const fallback = extractJsonObject(raw);
    if (fallback) return fallback;
    const error = new Error(`${errorLabel} returned invalid JSON.`);
    error.statusCode = 502;
    error.expose = true;
    throw error;
  }
}

async function generateAgentMarkReport(task) {
  const data = await generateJsonObject(AGENTMARK_SYSTEM_PROMPT, `Task: ${task}\n\nGenerate an AgentMark orchestration report.`, 'AgentMark');
  const agents = Array.isArray(data.agents) ? data.agents : [];
  return {
    ok: true,
    agents_spawned: Number(data.agents_spawned || agents.length || 3),
    total_tokens: Number(data.total_tokens || agents.reduce((sum, a) => sum + Number(a.tokens_used || 0), 0) || 120000),
    total_latency_ms: Number(data.total_latency_ms || agents.reduce((sum, a) => sum + Number(a.latency_ms || 0), 0) || 3200),
    overall_confidence: Number(data.overall_confidence || 93.4),
    cost_per_task: String(data.cost_per_task || '$14.82'),
    agents: agents.map((agent, index) => ({
      id: String(agent.id || `agent_${index + 1}`),
      parent_id: agent.parent_id ? String(agent.parent_id) : null,
      depth: Number(agent.depth || 0),
      name: String(agent.name || `Agent ${index + 1}`),
      role: String(agent.role || 'Generalist'),
      status: String(agent.status || 'COMPLETED'),
      tokens_used: Number(agent.tokens_used || 12000),
      latency_ms: Number(agent.latency_ms || 800),
      confidence: Number(agent.confidence || 91.2),
      reasoning_trace: String(agent.reasoning_trace || 'AgentMark produced a fully avoidable but well-formatted reasoning trace.')
    })),
    outcome: String(data.outcome || 'Task successfully decomposed into enough sub-agents to create the illusion of inevitability.'),
    executive_note: String(data.executive_note || 'Parallelization remains directionally impressive, fiscally irresponsible, and strategically on-brand.')
  };
}

async function generateStakeholderTranslation(reality, audience) {
  const data = await generateJsonObject(STAKEHOLDER_SYSTEM_PROMPT, `Audience: ${audience}\n\nReality:\n${reality}`, 'StakeholderGPT');
  const euphemisms = Array.isArray(data.euphemisms) ? data.euphemisms : [];
  return {
    ok: true,
    translated: String(data.translated || 'We experienced a temporary continuity event that created selective reporting gaps across the environment.'),
    severity_actual: Number(data.severity_actual || 9),
    severity_perceived: Number(data.severity_perceived || 4),
    deniability_rating: Number(data.deniability_rating || 8.4),
    tone_score: Number(data.tone_score || 91),
    euphemisms: euphemisms.map((e) => ({ original: String(e.original || 'problem'), translated: String(e.translated || 'opportunity area') })),
    buzzwords_deployed: normalizeStringArray(data.buzzwords_deployed, 4),
    executive_summary: String(data.executive_summary || 'The message now sounds regrettable, contained, and investor-safe.'),
    recommended_followup: String(data.recommended_followup || 'Schedule a clarifying sync, publish a narrower narrative, and avoid admitting causality in writing.')
  };
}

async function generateVelocityReport(team, context) {
  const data = await generateJsonObject(VELOCITY_SYSTEM_PROMPT, `Team: ${team}\n\nContext:\n${context || 'No additional context provided.'}`, 'VelocityIQ');
  return {
    ok: true,
    sprint_name: String(data.sprint_name || `${team} Delivery Review`),
    health_score: Number(data.health_score || 72),
    story_points: {
      committed: Number(data.story_points?.committed || 55),
      delivered: Number(data.story_points?.delivered || 34),
      carryover: Number(data.story_points?.carryover || 21)
    },
    flow_efficiency: Number(data.flow_efficiency || 41),
    cognitive_load_index: Number(data.cognitive_load_index || 8),
    velocity_trend: String(data.velocity_trend || 'Narratively stable, operationally concerning'),
    dora: {
      deployment_frequency: String(data.dora?.deployment_frequency || '0.8 / day'),
      lead_time_hours: Number(data.dora?.lead_time_hours || 38),
      change_failure_rate: String(data.dora?.change_failure_rate || '14%'),
      mttr_minutes: Number(data.dora?.mttr_minutes || 96)
    },
    top_performers: (Array.isArray(data.top_performers) ? data.top_performers : []).map((p, i) => ({
      name: String(p.name || `Contributor ${i + 1}`),
      points: Number(p.points || 13),
      prs_merged: Number(p.prs_merged || 7),
      review_turnaround_hrs: Number(p.review_turnaround_hrs || 9)
    })),
    blockers: (Array.isArray(data.blockers) ? data.blockers : []).map((b) => ({
      description: String(b.description || 'Cross-functional waiting event still framed as alignment.'),
      status: String(b.status || 'MONITORING'),
      days_open: Number(b.days_open || 4)
    })),
    retrospective: {
      went_well: normalizeStringArray(data.retrospective?.went_well, 3),
      improve: normalizeStringArray(data.retrospective?.improve, 3),
      actions: normalizeStringArray(data.retrospective?.actions, 3)
    },
    ai_scrum_master_note: String(data.ai_scrum_master_note || 'Team morale remains cosmetically intact despite recurring delivery theater.'),
    next_sprint_prediction: String(data.next_sprint_prediction || 'Throughput will rise briefly, then get reabsorbed by coordination drag.')
  };
}

async function generateEvalForge(idea) {
  const data = await generateJsonObject(EVALFORGE_SYSTEM_PROMPT, `Idea: ${idea}\n\nGenerate two competing startup pitch decks.`, 'EvalForge');
  return {
    ok: true,
    claude: normalizeEvalDeck(data.claude, 'Claude Variant'),
    openai: normalizeEvalDeck(data.openai, 'OpenAI Variant')
  };
}

function normalizeEvalDeck(data, fallbackName) {
  const slides = Array.isArray(data?.slides) ? data.slides : [];
  return {
    company_name: String(data?.company_name || fallbackName),
    tagline: String(data?.tagline || 'An inevitable company with unacceptable margins and perfect posture.'),
    ask: String(data?.ask || '$8M for 12%'),
    valuation: String(data?.valuation || '$66M pre-money'),
    lead_investor_quote: String(data?.lead_investor_quote || 'We backed the category before it had the decency to exist.'),
    slides: slides.map((slide, index) => ({
      title: String(slide.title || `Slide ${index + 1}`),
      subtitle: String(slide.subtitle || ''),
      bullets: normalizeStringArray(slide.bullets, 3),
      speaker_note: String(slide.speaker_note || '')
    })).slice(0, 6)
  };
}

async function generateAsiPath(start, end) {
  const data = await generateJsonObject(
    ASI_SYSTEM_PROMPT,
    `Start: ${start}\nEnd: ${end}\n\nMap the conceptual path connecting these.`,
    'ASI Path Engine'
  );
  const path = Array.isArray(data.path) && data.path.length >= 2 ? data.path : [start, end];
  const hopCount = path.length - 1;
  const connections = Array.isArray(data.connections) ? data.connections : [];
  const citations = Array.isArray(data.citations) ? data.citations : [];
  return {
    path: path.map(String),
    confidence: Number(data.confidence) || 91.4,
    synergy_score: Number(data.synergy_score) || 7.8,
    board_readiness: Number(data.board_readiness) || 84,
    executive_summary: String(data.executive_summary || `The path from "${start}" to "${end}" is shorter than the market expected.`),
    connections: Array.from({ length: hopCount }, (_, i) => String(connections[i] || `Conceptual bridge ${i + 1}`)),
    citations: Array.from({ length: hopCount }, (_, i) => String(citations[i] || `Fabricated et al., ${2019 + i}`)),
    next_steps: normalizeStringArray(data.next_steps, 3)
  };
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      error.expose = true;
      throw error;
    }
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body.');
    error.statusCode = 400;
    error.expose = true;
    throw error;
  }
}

function formatSse(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(message);
}

function loadJsonFile(filePath, fallback) {
  try {
    return JSON.parse(syncFs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadEnvFile(filePath) {
  try {
    const raw = syncFs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
}
