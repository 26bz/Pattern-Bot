# Pattern Bot

A Discord bot using discord.js v14+ that listens for questions or phrases and responds with related replies. It features pattern matching, statistics tracking, logging, and some admin commands.

![Pattern Bot Screenshot](/.images/patternbot.png)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure your bot:**
   - Copy `.env.example` to `.env` and configure:
     ```env
     DISCORD_TOKEN=your-bot-token-here
     DEBUG=false
     BLACKLISTED_CHANNELS=123456789012345678,987654321098765432
     CONFIDENCE_THRESHOLD_MENTION=0.6
     CONFIDENCE_THRESHOLD_QUESTION=0.6
     CONFIDENCE_THRESHOLD_DEFAULT=0.85
     ```
3. **Run the bot:**
   ```bash
   npm start
   ```

## Configuration Options

### Environment Variables

- **`DISCORD_TOKEN`** (Required) - Your Discord bot token
- **`DEBUG`** - Enable debug logging (`true` or `false`)
- **`BLACKLISTED_CHANNELS`** - Comma-separated channel IDs to ignore

### Confidence Thresholds

These control how sensitive the pattern matching is (0.0 = very loose, 1.0 = exact match):

**How Confidence is Calculated:**
Confidence = (Pattern match length) / (Total message length)

#### Examples with pattern `"how are you"`:

| Message                     | Type     | Confidence   | Threshold | Result          |
| --------------------------- | -------- | ------------ | --------- | --------------- |
| `"@bot how are you doing?"` | Mention  | 0.61 (11/18) | 0.6       | ✅ **Responds** |
| `"How are you?"`            | Question | 0.85 (11/13) | 0.6       | ✅ **Responds** |
| `"hey how are you today"`   | Regular  | 0.50 (11/22) | 0.85      | ❌ Too low      |
| `"how are you"`             | Regular  | 1.0 (11/11)  | 0.85      | ✅ **Responds** |
| `"how are you doing well?"` | Regular  | 0.52 (11/21) | 0.85      | ❌ Too low      |

#### Configuration Options:

- **`CONFIDENCE_THRESHOLD_MENTION=0.6`** - When the bot is @mentioned

  - More lenient since user is directly addressing the bot
  - Allows partial matches in longer messages

- **`CONFIDENCE_THRESHOLD_QUESTION=0.6`** - For question-like messages

  - Applies to messages with "?" or starting with question words (what, how, etc.)
  - Questions indicate intentional information seeking

- **`CONFIDENCE_THRESHOLD_DEFAULT=0.85`** - For regular messages
  - Strict threshold prevents interrupting casual conversation
  - Only responds to very close pattern matches

#### Tuning Guidelines:

- **Lower values (0.3-0.6)**: More responsive, may interrupt conversations
- **Medium values (0.6-0.8)**: Balanced, good for mentions/questions
- **Higher values (0.8-1.0)**: Very selective, only near-perfect matches

**Recommended Values:**

- Mentions/Questions: `0.6` (responsive when directly asked)
- Default: `0.85` (avoids interrupting normal chat)

## Adding & Customizing Patterns

Patterns and responses are defined in JSON files inside `questions`.

- Each file can have multiple entries:
  ```json
  {
    "general question": {
      "pattern": "(i have a question|i need help|can you help me|i have a query)",
      "response": "Maybe I can help! What do you need assistance with?"
    }
  }
  ```
- Patterns are regular expressions (case-insensitive by default)
- Responses are plain text

**To add new patterns:**

1. Create or edit a `.json` file in `questions`
2. Add your pattern/response pairs
3. Restart the bot to reload patterns

## How Pattern Matching Works

- Messages are filtered by length (minimum 3 characters) and blacklisted channels
- Bot mentions and question-like messages get priority with lower confidence thresholds
- Each pattern is tested using regex; matches are scored by length/confidence ratio
- Configurable confidence thresholds prevent accidental responses:
  - **Mentions**: Uses `CONFIDENCE_THRESHOLD_MENTION` (default: 0.6)
  - **Questions**: Uses `CONFIDENCE_THRESHOLD_QUESTION` (default: 0.6)
  - **Regular messages**: Uses `CONFIDENCE_THRESHOLD_DEFAULT` (default: 0.85)
- The first high-confidence match triggers a response and stops further checking

## Statistics & Logging

- Every pattern match is logged (in `logs/pattern_matches.log`)
- Statistics tracked per pattern:
  - Total match count
  - Example triggering messages
  - Top channels and users
  - Last matched timestamp
- All stats are saved in `logs/pattern_stats.json`
- Activity and error logs are in `logs/bot_activity.log` and `logs/error.log`

## Admin Commands (Server Owner Only)

- `!pattern-report` — Generates a detailed text report of pattern usage (saved to `logs/`)
- `!export-stats` — Exports raw statistics as JSON (saved to `logs/`)
- `!top-patterns` — Shows the top 10 matched patterns directly in Discord

## Requirements

- Node.js v16.9.0 or higher
- A Discord bot token ([How to create a bot](https://discordjs.guide/preparations/setting-up-a-bot-application.html#creating-your-bot))
