import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import { logger, patternStats } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

export const questionsCache = new Map();

function loadQuestions(dir) {
  try {
    if (!fs.existsSync(dir)) {
      logger.error(`Questions directory not found: ${dir}`);
      return;
    }

    const files = fs.readdirSync(dir);
    let loadedPatterns = 0;
    let invalidPatterns = 0;

    files.forEach((file) => {
      if (file.endsWith('.json') && !file.startsWith('!')) {
        const filePath = path.join(dir, file);
        try {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          const fileQuestions = JSON.parse(fileContent);

          for (const key in fileQuestions) {
            try {
              const { pattern, response } = fileQuestions[key];

              if (!pattern || typeof pattern !== 'string') {
                logger.warn(`Invalid pattern in ${file} for key ${key}`);
                invalidPatterns++;
                continue;
              }

              if (!response || typeof response !== 'string') {
                logger.warn(`Invalid response in ${file} for key ${key}`);
                invalidPatterns++;
                continue;
              }

              try {
                new RegExp(pattern, 'i');
                questionsCache.set(pattern, response);
                loadedPatterns++;
              } catch (regexError) {
                logger.warn(`Invalid regex pattern in ${file} for key ${key}: ${regexError.message}`);
                invalidPatterns++;
              }
            } catch (keyError) {
              logger.warn(`Error processing key ${key} in ${file}: ${keyError.message}`);
              invalidPatterns++;
            }
          }
        } catch (fileError) {
          logger.error(`Error reading or parsing ${filePath}: ${fileError.message}`);
        }
      }
    });

    logger.info(`Loaded ${loadedPatterns} question patterns (${invalidPatterns} invalid patterns skipped)`);
  } catch (error) {
    logger.error(`Error loading questions: ${error.message}`);
  }
}

loadQuestions(path.join(__dirname, 'questions'));

client.once('ready', () => {
  logger.info(`Logged in as ${client.user.tag}`);
  logger.info('Bot is ready to respond to questions!');
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // Check for admin commands (server owner only)
  if (message.guild && message.author.id === message.guild.ownerId) {
    if (content === '!pattern-report') {
      logger.info(`Server owner ${message.author.username} requested a pattern report`);
      const reportFile = patternStats.generateReport();
      if (reportFile) {
        const embed = new EmbedBuilder()
          .setTitle('Pattern Match Report Generated')
          .setDescription(`Report has been generated and saved to: \`${reportFile}\``)
          .setColor('#00FF00')
          .setFooter({ text: 'Use !export-stats to export raw data' });

        message.reply({ embeds: [embed] });
      } else {
        message.reply('Failed to generate pattern report. Check console for errors.');
      }
      return;
    }

    // Command to export raw stats data
    if (content === '!export-stats') {
      logger.info(`Server owner ${message.author.username} requested stats export`);
      const exportFile = patternStats.exportStats();
      if (exportFile) {
        const embed = new EmbedBuilder()
          .setTitle('Pattern Statistics Exported')
          .setDescription(`Statistics have been exported to: \`${exportFile}\``)
          .setColor('#00FF00')
          .setFooter({ text: 'Use !pattern-report for a formatted report' });

        message.reply({ embeds: [embed] });
      } else {
        message.reply('Failed to export pattern statistics. Check console for errors.');
      }
      return;
    }

    // Command to show top patterns directly in Discord
    if (content === '!top-patterns') {
      logger.info(`Server owner ${message.author.username} requested top patterns`);
      const topPatterns = patternStats.getTopPatterns(10);

      if (topPatterns.length === 0) {
        message.reply('No pattern statistics available yet.');
        return;
      }

      let description = 'Top 10 most matched patterns:\n\n';
      topPatterns.forEach((data, index) => {
        description += `**${index + 1}.** Pattern: \`${data.pattern}\` [${data.count}]\n`;
        description += `   Last matched: ${new Date(data.lastMatched).toLocaleString()}\n`;
      });

      const embed = new EmbedBuilder().setTitle('Pattern Match Statistics').setDescription(description).setColor('#00FF00').setFooter({ text: 'Use !pattern-report for a full report' });

      message.reply({ embeds: [embed] });
      return;
    }
  }

  // Check for matches in our questions cache
  // Only process messages that are likely to be questions or commands
  // Ignore very short messages or messages that are likely part of normal conversation
  if (content.length < 3) return;

  const isBotMention = message.mentions.users.has(client.user.id);
  const isQuestion = content.includes('?') || /^(what|who|when|where|why|how|can|could|would|is|are|am|do|does|did|will|should).+/.test(content);

  // If it's a direct mention or a question, process with higher confidence
  const confidenceThreshold = isBotMention || isQuestion ? 0.6 : 0.85;

  let matchFound = false;

  for (const [pattern, response] of questionsCache.entries()) {
    try {
      const regex = new RegExp(pattern, 'i');
      const match = content.match(regex);

      if (match) {
        // Calculate confidence based on match length vs content length
        const matchLength = match[0].length;
        const confidence = matchLength / content.length;

        if (confidence >= confidenceThreshold) {
          message.reply(response);
          logger.info(`Matched pattern: ${pattern} with confidence: ${confidence.toFixed(2)}`);
          patternStats.trackPatternMatch(message, pattern, confidence);
          matchFound = true;
          break;
        }
      }
    } catch (error) {
      console.error(`Error with pattern ${pattern}: ${error.message}`);
    }
  }

  if (!matchFound && process.env.DEBUG === 'true') {
    logger.debug(`No high-confidence match found for: "${content}"`);
  }
});

client.on('error', (error) => {
  logger.error('Discord client error:', error);
});

client.on('warn', (warning) => {
  logger.warn('Discord client warning:', warning);
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
  logger.info('Bot is shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Bot is shutting down...');
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
