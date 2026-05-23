---
name: mission-control-tools
description: >
  Use Mission Control's 28 integrated tools via the `mission-control:*` plugin
  namespace. Covers web research, SEO analysis, stock analysis, content scoring,
  LLM routing, memory, browser automation, messaging, analytics, and system
  monitoring. Call these tools by name during heartbeat runs — they execute
  through the Mission Control plugin bridge.
---

# Mission Control Tools

These tools are provided by the **Mission Control plugin** and available to any
agent in this Paperclip instance. Each tool is called via the plugin tool system
using the `mission-control:<tool-name>` namespace.

## How to Call

During a heartbeat run, use the standard Paperclip tool-call mechanism:

```
POST $PAPERCLIP_API_URL/plugins/tools/execute
Authorization: Bearer $PAPERCLIP_API_KEY
X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID

{
  "tool": "mission-control:<tool-name>",
  "parameters": { ... },
  "runContext": {
    "agentId": "$PAPERCLIP_AGENT_ID",
    "runId": "$PAPERCLIP_RUN_ID",
    "companyId": "$PAPERCLIP_COMPANY_ID",
    "projectId": "$PAPERCLIP_PROJECT_ID"
  }
}
```

---

## Research & Intelligence (7 tools)

### `mission-control:search-synthesizer`
Perplexity-style web search: queries Brave Search, fetches top pages, synthesizes a grounded answer with citations using LLM.
- **Required**: `query` (string)
- Optional: `numResults`, `fetchPages`, `model`, `rawOnly`, `dateFilter`

### `mission-control:exa-search`
Neural web search via Exa API. Understands meaning, not just keywords.
- **Required**: `query` (string)
- Optional: `numResults`, `type` (auto|neural|keyword), `contents`, `highlights`, `category`

### `mission-control:web-scraper`
Fetch any URL and extract clean LLM-ready markdown content.
- **Required**: `url` (string)
- Optional: `maxChars`, `extractLinks`

### `mission-control:company-researcher`
Structured competitive intelligence: overview, products, funding, team, tech stack, competitors, news.
- **Required**: `company` (string)
- Optional: `website`, `focus`, `depth` (quick|thorough)

### `mission-control:fact-checker`
Extract factual claims from text, verify against web sources, return scored verdicts.
- **Required**: `text` (string)
- Optional: `maxClaims`

### `mission-control:browser-automation`
Scrape JS-rendered pages using headless Chromium (Playwright). Handles SPAs, dynamic content, screenshots.
- **Required**: `url` (string)
- Optional: `screenshot`, `waitFor`, `maxChars`

### `mission-control:qmd-search`
Search local markdown notes and knowledge bases using BM25 or semantic vector search.
- **Required**: `query` (string)
- Optional: `collection`, `numResults`, `mode` (keyword|semantic|hybrid)

---

## Content & SEO (4 tools)

### `mission-control:content-scorer`
Score a page's SEO content quality vs competitors. Returns 0-100 score with gap analysis.
- **Required**: `url`, `keyword`
- Optional: `competitors`, `fetchCompetitors`

### `mission-control:text-humanizer`
Detects AI writing patterns and auto-fixes. Returns AI probability score 0-100 and corrected text.
- **Required**: `text` (string)
- Optional: `mode` (analyze|fix|both)

### `mission-control:gsc-api`
Query Google Search Console: impressions, clicks, CTR, position by query/page/device.
- **Required**: `siteUrl`, `action` (top_queries|top_pages|opportunities|page_queries|inspect_url)
- Optional: `startDate`, `endDate`, `url`

### `mission-control:ga4-analytics`
Google Analytics 4: Measurement Protocol events and Data API reporting.
- **Required**: `action` (track|report)
- Optional: `event`, `params`, `propertyId`

---

## Finance & Markets (1 tool)

### `mission-control:stock-analysis`
Regime-adaptive equity/crypto analysis with 9 dimensions, multi-source data, and actionable signals.
- **Required**: `ticker` (string)
- Optional: `analysisType` (analyze|compare|scan-hot|scan-rumors|regime), `compareTo`

---

## Social & Messaging (4 tools)

### `mission-control:x-researcher`
X API v2: search tweets, profile lookup, thread retrieval. Caching and cost tracking built in.
- **Required**: `action` (search|profile|thread|tweet)
- Optional: `query`, `username`, `tweetId`

### `mission-control:x-impact-lite`
Heuristic X post scoring from weighted engagement factors. Deterministic local scoring.
- **Required**: `post` (string)
- Optional: `language` (en|ja)

### `mission-control:telegram-formatter`
Format structured data into Telegram MarkdownV2 messages with tables, lists, keyboards.
- **Required**: `format` (alert|report|table|list|keyvalue|custom)
- Optional: `title`, `body`, `emoji`, `data`

### `mission-control:whatsapp-notifier`
Send WhatsApp messages via wacli CLI. Supports text and file attachments.
- **Required**: `to`, `message`
- Optional: `file`

---

## AI & LLM (3 tools)

### `mission-control:llm-gateway`
Intelligent LLM routing: routes to cheapest capable model by complexity, caches responses, tracks cost.
- **Required**: `prompt` (string)
- Optional: `complexity` (low|medium|high), `maxTokens`, `temperature`, `noCache`

### `mission-control:elevenlabs-agents`
ElevenLabs integration: list voices and text-to-speech for voice workflows.
- **Required**: `action` (list-voices|tts)
- Optional: `text`, `voiceId`

### `mission-control:whisper-transcriber`
Transcribe audio using OpenAI Whisper from public audio URLs.
- **Required**: `audioUrl` (string)
- Optional: `language` (ISO 639-1)

---

## Memory & Knowledge (2 tools)

### `mission-control:memory-core`
Local long-term memory engine with curate/query, hybrid retrieval, dedupe, and embedding cache.
- **Required**: `action` (curate|query|stats|benchmark)
- Optional: `content`, `title`, `kind`, `query`, `topK`, `tags`

### `mission-control:onboard-memory-optimizer`
Memory optimization: hybrid search, embedding cache, compaction settings.
- **Required**: `action` (status|preview|apply)
- Optional: `hybridSearch`, `embeddingCache`

---

## Monitoring & Ops (4 tools)

### `mission-control:system-monitor`
Check CPU, memory, disk usage, process count, and service health with threshold alerts.
- Optional: `cpuThreshold`, `memThreshold`, `diskThreshold`

### `mission-control:api-health-checker`
Check API endpoints for uptime, latency, and response validity.
- **Required**: `endpoints` (array)
- Optional: `parallel`

### `mission-control:error-tracker`
Sentry-style error capture, grouping, and querying with stack traces and deduplication.
- **Required**: `action` (capture|query|groups|resolve)
- Optional: `error`, `stack`, `context`, `fingerprint`

### `mission-control:model-usage-analytics`
Token/USD cost estimates across providers using centralized pricing.json.
- **Required**: `provider`, `model`, `inputTokens`, `outputTokens`

---

## Analytics & Commerce (3 tools)

### `mission-control:analytics`
PostHog-style local analytics. Track events, pageviews, funnels without external services.
- **Required**: `action` (track|pageview|query|funnel|topPages|uniqueUsers)
- Optional: `event`, `properties`, `userId`, `path`

### `mission-control:affiliate-link-validator`
Validate affiliate links for correct tags, HTTP status, redirect integrity, ASIN extraction.
- **Required**: `urls` (array)
- Optional: `expectedTag`

### `mission-control:youtube-summarizer`
Summarize YouTube videos from transcript text.
- **Required**: `videoId` (string)
- Optional: `transcript`
