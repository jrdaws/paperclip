/**
 * Maps all 28 Mission Control tools to Paperclip plugin tool declarations.
 * Each entry contains the tool name, display metadata, and JSON Schema
 * for the parameters that agents can pass.
 */

export interface McToolDeclaration {
  id: string;
  displayName: string;
  description: string;
  parametersSchema: Record<string, unknown>;
}

export const MC_TOOLS: McToolDeclaration[] = [
  {
    id: "stock-analysis",
    displayName: "Stock Analysis",
    description: "Regime-adaptive equity/crypto analysis with 9 dimensions, multi-source data, and actionable signals. Actions: analyze, compare, scan-hot, scan-rumors, regime.",
    parametersSchema: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "Stock/crypto ticker symbol" },
        analysisType: { type: "string", description: "Action: analyze | compare | scan-hot | scan-rumors | regime" },
        compareTo: { type: "string", description: "[compare] Second ticker to compare against" },
      },
      required: ["ticker"],
    },
  },
  {
    id: "search-synthesizer",
    displayName: "Search Synthesizer",
    description: "Perplexity-style web search: queries Brave Search, fetches top pages, synthesizes a grounded answer with citations using LLM.",
    parametersSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Research question or search query" },
        numResults: { type: "number", description: "Number of search results (default: 8)" },
        fetchPages: { type: "number", description: "Pages to fetch full content from (default: 3)" },
        model: { type: "string", description: "LLM model for synthesis" },
        rawOnly: { type: "boolean", description: "Return raw results only, skip synthesis" },
        dateFilter: { type: "string", description: "Recency filter: day | week | month | year" },
      },
      required: ["query"],
    },
  },
  {
    id: "web-scraper",
    displayName: "Web Scraper",
    description: "Fetch any URL and extract clean LLM-ready markdown content with title, metadata, links, and word count.",
    parametersSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to scrape" },
        maxChars: { type: "number", description: "Max output chars (default: 8000)" },
        extractLinks: { type: "boolean", description: "Include extracted links" },
      },
      required: ["url"],
    },
  },
  {
    id: "content-scorer",
    displayName: "Content Scorer",
    description: "Score a page's SEO content quality vs competitors. Returns 0-100 score with gap analysis and recommendations.",
    parametersSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Target page URL to score" },
        keyword: { type: "string", description: "Target keyword to optimize for" },
        competitors: { type: "array", description: "Competitor URLs to benchmark against" },
        fetchCompetitors: { type: "boolean", description: "Auto-fetch top 5 SERP competitors" },
      },
      required: ["url", "keyword"],
    },
  },
  {
    id: "text-humanizer",
    displayName: "Text Humanizer",
    description: "Detects AI writing patterns and auto-fixes replacements. Returns AI probability score (0-100) and corrected text.",
    parametersSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze and/or humanize" },
        mode: { type: "string", description: "analyze | fix | both (default: both)" },
      },
      required: ["text"],
    },
  },
  {
    id: "company-researcher",
    displayName: "Company Researcher",
    description: "Gather structured competitive intelligence: overview, products, funding, team, tech stack, competitors, and news.",
    parametersSchema: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company name to research" },
        website: { type: "string", description: "Company website URL" },
        focus: { type: "string", description: "Focus areas: overview, products, funding, team, tech, competitors, news, all" },
        depth: { type: "string", description: "Research depth: quick | thorough (default)" },
      },
      required: ["company"],
    },
  },
  {
    id: "fact-checker",
    displayName: "Fact Checker",
    description: "Extract factual claims from text, verify against web sources, return scored report with verdicts.",
    parametersSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text containing claims to verify" },
        maxClaims: { type: "number", description: "Max claims to verify (default: 10)" },
      },
      required: ["text"],
    },
  },
  {
    id: "llm-gateway",
    displayName: "LLM Gateway",
    description: "Intelligent LLM routing: routes to cheapest capable model by complexity, caches responses, retries with backoff, tracks cost.",
    parametersSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Prompt to send to the LLM" },
        complexity: { type: "string", description: "Task complexity: low | medium | high" },
        maxTokens: { type: "number", description: "Max tokens in response (default: 1000)" },
        temperature: { type: "number", description: "Temperature 0-1 (default: 0.7)" },
        noCache: { type: "boolean", description: "Skip cache lookup" },
      },
      required: ["prompt"],
    },
  },
  {
    id: "memory-core",
    displayName: "Memory Core",
    description: "Local long-term memory engine with curate/query commands, hybrid retrieval, dedupe, and embedding cache.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: curate | query | stats | benchmark" },
        content: { type: "string", description: "[curate] Memory content/body text" },
        title: { type: "string", description: "[curate] Optional title" },
        kind: { type: "string", description: "[curate] fact | decision | preference | rule | artifact | task" },
        query: { type: "string", description: "[query] Search query" },
        topK: { type: "number", description: "[query] Max results (default 10)" },
        tags: { type: "array", description: "Tags for filtering" },
      },
      required: ["action"],
    },
  },
  {
    id: "exa-search",
    displayName: "Exa Neural Search",
    description: "Neural web search via Exa API. Understands meaning, not just keywords. Returns results with optional full text and highlights.",
    parametersSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (natural language or URL)" },
        numResults: { type: "number", description: "Number of results (default: 10)" },
        type: { type: "string", description: "Search type: auto | neural | keyword" },
        contents: { type: "boolean", description: "Fetch full text content" },
        highlights: { type: "boolean", description: "Include highlighted snippets" },
        category: { type: "string", description: "Filter: company | research paper | news | github | tweet" },
      },
      required: ["query"],
    },
  },
  {
    id: "browser-automation",
    displayName: "Browser Automation",
    description: "Scrape JS-rendered pages using headless Chromium (Playwright). Handles SPAs, dynamic content, screenshots.",
    parametersSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to visit and scrape" },
        screenshot: { type: "boolean", description: "Take a screenshot" },
        waitFor: { type: "string", description: "CSS selector to wait for" },
        maxChars: { type: "number", description: "Max text output chars (default: 8000)" },
      },
      required: ["url"],
    },
  },
  {
    id: "telegram-formatter",
    displayName: "Telegram Formatter",
    description: "Format structured data into Telegram MarkdownV2 messages with tables, lists, keyboards, and proper escaping.",
    parametersSchema: {
      type: "object",
      properties: {
        format: { type: "string", description: "Output format: alert | report | table | list | keyvalue | custom" },
        title: { type: "string", description: "Message title" },
        body: { type: "string", description: "Main message body" },
        emoji: { type: "string", description: "Leading emoji" },
        data: { type: "object", description: "Structured data for table/list/keyvalue" },
      },
      required: ["format"],
    },
  },
  {
    id: "whatsapp-notifier",
    displayName: "WhatsApp Notifier",
    description: "Send WhatsApp messages via wacli CLI. Supports text messages and file attachments.",
    parametersSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient phone number or group JID" },
        message: { type: "string", description: "Text message to send" },
        file: { type: "string", description: "Path to file to send" },
      },
      required: ["to", "message"],
    },
  },
  {
    id: "error-tracker",
    displayName: "Error Tracker",
    description: "Sentry-style error capture, grouping, and querying with stack traces and deduplication.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: capture | query | groups | resolve" },
        error: { type: "string", description: "[capture] Error message" },
        stack: { type: "string", description: "[capture] Stack trace" },
        context: { type: "object", description: "[capture] Additional context" },
        fingerprint: { type: "string", description: "[resolve] Group fingerprint to resolve" },
      },
      required: ["action"],
    },
  },
  {
    id: "analytics",
    displayName: "Analytics",
    description: "PostHog-style local analytics. Track events, pageviews, funnel conversions without external services.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: track | pageview | query | funnel | topPages | uniqueUsers" },
        event: { type: "string", description: "Event name" },
        properties: { type: "object", description: "Event properties" },
        userId: { type: "string", description: "User identifier" },
        path: { type: "string", description: "[pageview] Page path" },
      },
      required: ["action"],
    },
  },
  {
    id: "gsc-api",
    displayName: "Google Search Console",
    description: "Query Google Search Console for search performance: impressions, clicks, CTR, position by query/page/device.",
    parametersSchema: {
      type: "object",
      properties: {
        siteUrl: { type: "string", description: "Site property URL" },
        action: { type: "string", description: "Action: top_queries | top_pages | opportunities | page_queries | inspect_url" },
        startDate: { type: "string", description: "Start date YYYY-MM-DD" },
        endDate: { type: "string", description: "End date YYYY-MM-DD" },
        url: { type: "string", description: "Specific page URL for page_queries/inspect_url" },
      },
      required: ["siteUrl", "action"],
    },
  },
  {
    id: "x-impact-lite",
    displayName: "X Impact Scorer",
    description: "Heuristic X post scoring from weighted engagement factors. Deterministic local scoring.",
    parametersSchema: {
      type: "object",
      properties: {
        post: { type: "string", description: "Post/tweet draft to evaluate" },
        language: { type: "string", description: "Language: en | ja" },
      },
      required: ["post"],
    },
  },
  {
    id: "x-researcher",
    displayName: "X Researcher",
    description: "X API v2: search tweets, profile lookup, thread retrieval. Caching and cost tracking built in.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: search | profile | thread | tweet" },
        query: { type: "string", description: "[search] Search query" },
        username: { type: "string", description: "[profile] Username to look up" },
        tweetId: { type: "string", description: "[thread/tweet] Tweet ID" },
      },
      required: ["action"],
    },
  },
  {
    id: "model-usage-analytics",
    displayName: "Model Usage Analytics",
    description: "Token/USD cost estimates across providers using centralized pricing.json.",
    parametersSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Provider: anthropic | openai | gemini | ollama" },
        model: { type: "string", description: "Model identifier" },
        inputTokens: { type: "number", description: "Input token count" },
        outputTokens: { type: "number", description: "Output token count" },
      },
      required: ["provider", "model", "inputTokens", "outputTokens"],
    },
  },
  {
    id: "system-monitor",
    displayName: "System Monitor",
    description: "Check CPU, memory, disk usage, process count, and service health with threshold alerts.",
    parametersSchema: {
      type: "object",
      properties: {
        cpuThreshold: { type: "number", description: "CPU usage % alert threshold (default: 80)" },
        memThreshold: { type: "number", description: "Memory usage % alert threshold (default: 85)" },
        diskThreshold: { type: "number", description: "Disk usage % alert threshold (default: 90)" },
      },
    },
  },
  {
    id: "api-health-checker",
    displayName: "API Health Checker",
    description: "Check API endpoints for uptime, latency, and response validity. Returns structured health report.",
    parametersSchema: {
      type: "object",
      properties: {
        endpoints: { type: "array", description: "List of endpoints to check" },
        parallel: { type: "boolean", description: "Run checks in parallel (default: true)" },
      },
      required: ["endpoints"],
    },
  },
  {
    id: "affiliate-link-validator",
    displayName: "Affiliate Link Validator",
    description: "Validate affiliate links for correct tags, HTTP status, redirect integrity, and ASIN extraction.",
    parametersSchema: {
      type: "object",
      properties: {
        urls: { type: "array", description: "Affiliate URLs to validate" },
        expectedTag: { type: "string", description: "Expected Amazon affiliate tag" },
      },
      required: ["urls"],
    },
  },
  {
    id: "qmd-search",
    displayName: "QMD Search",
    description: "Search local markdown notes and knowledge bases using BM25 keyword or semantic vector search.",
    parametersSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        collection: { type: "string", description: "Restrict to a specific collection" },
        numResults: { type: "number", description: "Number of results (default: 10)" },
        mode: { type: "string", description: "Search mode: keyword | semantic | hybrid" },
      },
      required: ["query"],
    },
  },
  {
    id: "elevenlabs-agents",
    displayName: "ElevenLabs Agents",
    description: "ElevenLabs integration: list voices and TTS for voice workflows.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: list-voices | tts" },
        text: { type: "string", description: "[tts] Text to convert to speech" },
        voiceId: { type: "string", description: "[tts] Voice ID to use" },
      },
      required: ["action"],
    },
  },
  {
    id: "whisper-transcriber",
    displayName: "Whisper Transcriber",
    description: "Transcribe audio using OpenAI Whisper from public audio URLs.",
    parametersSchema: {
      type: "object",
      properties: {
        audioUrl: { type: "string", description: "Public URL to audio file" },
        language: { type: "string", description: "Language hint (ISO 639-1)" },
      },
      required: ["audioUrl"],
    },
  },
  {
    id: "ga4-analytics",
    displayName: "GA4 Analytics",
    description: "Google Analytics 4: Measurement Protocol events and Data API reporting.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: track | report" },
        event: { type: "string", description: "[track] Event name" },
        params: { type: "object", description: "[track] Event parameters" },
        propertyId: { type: "string", description: "[report] GA4 property ID" },
      },
      required: ["action"],
    },
  },
  {
    id: "youtube-summarizer",
    displayName: "YouTube Summarizer",
    description: "Summarize YouTube videos from transcript text with video context.",
    parametersSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube video ID or URL" },
        transcript: { type: "string", description: "Transcript text to summarize" },
      },
      required: ["videoId"],
    },
  },
  {
    id: "onboard-memory-optimizer",
    displayName: "Memory Optimizer",
    description: "Onboarding step for memory optimization: hybrid search, embedding cache, compaction settings.",
    parametersSchema: {
      type: "object",
      properties: {
        action: { type: "string", description: "Action: status | preview | apply" },
        hybridSearch: { type: "boolean", description: "Enable hybrid search" },
        embeddingCache: { type: "boolean", description: "Enable embedding cache" },
      },
      required: ["action"],
    },
  },
];
