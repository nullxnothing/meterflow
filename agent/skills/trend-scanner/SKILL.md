# Trend Scanner

Scan for trending tech topics to create token concepts around.

## Data Sources

### 1. Hacker News (Top Stories)

**Endpoint:**
```
GET https://hacker-news.firebaseio.com/v0/topstories.json
```

Returns an array of story IDs. Fetch the top 30:

```
GET https://hacker-news.firebaseio.com/v0/item/${ID}.json
```

**Response:**
```json
{
  "id": 12345,
  "title": "OpenAI releases GPT-5 with autonomous agents",
  "score": 842,
  "url": "https://...",
  "time": 1700000000,
  "descendants": 234
}
```

**Relevance signals:** `score > 200`, `descendants > 50`, title contains tech/AI/crypto keywords.

### 2. Reddit (Tech Subreddits)

**Endpoint:**
```
GET https://www.reddit.com/r/{subreddit}/hot.json?limit=25
```

Subreddits to scan: `technology`, `programming`, `artificial`, `machinelearning`, `singularity`

**Response structure:**
```json
{
  "data": {
    "children": [
      {
        "data": {
          "title": "New breakthrough in quantum computing",
          "score": 5000,
          "num_comments": 300,
          "created_utc": 1700000000,
          "subreddit": "technology"
        }
      }
    ]
  }
}
```

**Headers required:**
```
User-Agent: INFINITE-Agent/1.0
```

Reddit requires a User-Agent header or it returns 429.

### 3. Google Trends (Unofficial)

Google Trends does not have an official API. Use trending searches endpoint:

```
GET https://trends.google.com/trending/rss?geo=US
```

This returns an RSS feed of trending searches. Parse for tech-related terms.

Alternative: Use the daily trends endpoint:
```
GET https://trends.google.com/trends/trendingsearches/daily?geo=US&hl=en
```

If Google Trends is blocked or rate-limited, skip it and rely on HN + Reddit.

## Scoring Algorithm

Score each trend on a 1-10 scale across four dimensions:

| Dimension | Weight | Criteria |
|-----------|--------|----------|
| Recency | 25% | Posted within last 6 hours = 10, 12h = 7, 24h = 5, older = 3 |
| Virality | 25% | HN score > 500 or Reddit score > 5000 = 10, > 200/2000 = 7, else proportional |
| Crypto-relevance | 30% | Directly about crypto/blockchain = 10, AI/tech = 8, general tech = 5, unrelated = 2 |
| Naming potential | 20% | Has a catchy, memeable keyword = 10, technical but usable = 7, too generic = 4 |

**Final score:** weighted average. Only concepts scoring >= 7.0 enter the queue.

## Keyword Boosters (Crypto-Relevance)

High relevance (+3): `AI`, `GPT`, `LLM`, `blockchain`, `Solana`, `crypto`, `token`, `agent`, `autonomous`, `neural`, `quantum`

Medium relevance (+1): `robot`, `hack`, `cloud`, `data`, `compute`, `chip`, `GPU`, `model`, `API`, `protocol`

Negative (-5, filter out): political figures, elections, wars, scandals, religion, anything NSFW

## Content Filters

**Hard filters (auto-reject):**
- Anything political (candidates, elections, parties, legislation names)
- Anything offensive, violent, or NSFW
- Too niche to be memeable (< 100 HN score AND < 1000 Reddit score)
- Already in the deploy-log.json (no repeat narratives)
- Generic single words that are already overused tokens ("moon", "doge", "pepe")

## Output Format

For each qualifying trend, produce a structured concept:

```json
{
  "name": "Neural Net",
  "ticker": "NEURAL",
  "description": "The AI revolution isn't coming — it's here. NEURAL is the token for builders who believe intelligence should be open, decentralized, and unstoppable.",
  "narrative": "AI / neural networks trending after new research paper on autonomous agents",
  "score": 8.2,
  "sources": ["HN #12345 (score 842)", "r/technology (score 5200)"],
  "createdAt": "2025-01-15T10:00:00Z"
}
```

## Concept Queue

Store prepared concepts in `concept-queue.json`:

```json
{
  "concepts": [
    { "name": "...", "ticker": "...", "score": 8.2, "createdAt": "..." },
    { "name": "...", "ticker": "...", "score": 7.5, "createdAt": "..." }
  ],
  "lastScanned": "2025-01-15T10:00:00Z"
}
```

**Queue rules:**
- Maximum 3 concepts in queue at any time
- If queue is full and a new concept scores higher, replace the lowest
- Concepts expire after 24 hours (trends go stale)
- Highest-scored concept is used first by auto-launch

## Ticker Generation Rules

- 2-6 characters, all uppercase
- Must be pronounceable or a recognizable abbreviation
- Avoid existing major token tickers (SOL, ETH, BTC, USDC, BONK, etc.)
- Prefer: acronyms from the trend, punchy single words, portmanteaus

**Good:** `NEURAL`, `QBIT`, `AGEN`, `SYNTH`, `FLUX`
**Bad:** `XYZABC`, `A`, `SOLANA2`, `TEST`

## Error Handling

- **HN API down:** Skip HN, proceed with Reddit only.
- **Reddit 429 (rate limit):** Wait 60 seconds, retry once. If still 429, skip Reddit this cycle.
- **Google Trends blocked:** Skip entirely. HN + Reddit is sufficient.
- **No qualifying trends found:** Log "No trends above threshold. Queue unchanged." This is normal — not every 2-hour window has a launchable trend.
- **All sources down:** Log critical error. Do not generate concepts from cached/stale data.
