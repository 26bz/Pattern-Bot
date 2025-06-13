# Pattern Bot

A Discord bot using discord.js v14+ that listens for questions or phrases and responds with related replies. It features pattern matching, statistics tracking, logging, and some admin commands.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Configure your bot token:**
   - Create a `.env` file with:
     ```env
     DISCORD_TOKEN=your-bot-token-here
     ```
     Optionally add `DEBUG=true` for verbose debug logging or `BLACKELISTED_CHANNELS=channelID1,channelID2` to ignore specific channels.
3. **Run the bot:**
   ```bash
   npm start
   ```

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

- Only messages that look like questions or mention the bot are checked
- Each pattern is checked using regex; matches are scored by length/confidence
- A confidence threshold (0.6 for questions/mentions, 0.85 otherwise) avoids accidental matches
- The first high-confidence match triggers a response

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
