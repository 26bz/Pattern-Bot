import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import { logger, patternStats, PerformanceLogger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();

export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

export const questionsCache = new Map();

const config = {
  debug: process.env.DEBUG === 'true',
  blacklistedChannels: process.env.BLACKLISTED_CHANNELS ? process.env.BLACKLISTED_CHANNELS.split(',').map((id) => id.trim()) : [],
  confidenceThreshold: {
    mention: parseFloat(process.env.CONFIDENCE_THRESHOLD_MENTION) || 0.6,
    question: parseFloat(process.env.CONFIDENCE_THRESHOLD_QUESTION) || 0.6,
    default: parseFloat(process.env.CONFIDENCE_THRESHOLD_DEFAULT) || 0.85,
  },
};

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

const botStartTime = Date.now();
loadQuestions(path.join(__dirname, 'questions'));

client.once('clientReady', () => {
  logger.info('Bot successfully logged in', {
    botTag: client.user.tag,
    botId: client.user.id,
    guildCount: client.guilds.cache.size,
    userCount: client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
    patternsLoaded: questionsCache.size,
  });

  PerformanceLogger.logBotStartup(botStartTime);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const startTime = Date.now();

  try {
    const content = message.content.toLowerCase();
    const cleanContent = message.content
      .replace(/<@!?\d+>/g, '')
      .trim()
      .toLowerCase();

    if (config.blacklistedChannels.includes(message.channel.id)) return;

    if (message.guild && message.author.id === message.guild.ownerId) {
      if (content === '!pattern-report') {
        const reportFile = patternStats.generateReport();
        if (reportFile) {
          const embed = new EmbedBuilder()
            .setTitle('Pattern Match Report Generated')
            .setDescription(`Report has been generated and saved to: \`${reportFile}\``)
            .setColor('#00FF00')
            .setFooter({ text: 'Use !export-stats to export raw data' });

          message.reply({ embeds: [embed] });
          logger.info(`📊 Report generated: ${reportFile}`);
        } else {
          message.reply('Failed to generate pattern report. Check console for errors.');
          logger.error('Failed to generate pattern report');
        }
        return;
      }

      if (content === '!export-stats') {
        const exportFile = patternStats.exportStats();
        if (exportFile) {
          const embed = new EmbedBuilder()
            .setTitle('Pattern Statistics Exported')
            .setDescription(`Statistics have been exported to: \`${exportFile}\``)
            .setColor('#00FF00')
            .setFooter({ text: 'Use !pattern-report for a formatted report' });

          message.reply({ embeds: [embed] });
          logger.info(`📤 Stats exported: ${exportFile}`);
        } else {
          message.reply('Failed to export pattern statistics. Check console for errors.');
          logger.error('Failed to export pattern statistics');
        }
        return;
      }

      if (content === '!top-patterns') {
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
        logger.info(`📈 Showed top ${topPatterns.length} patterns`);
        return;
      }
    }

    // Check for matches in our questions cache
    // Only process messages that are likely to be questions or commands
    // Ignore very short messages or messages that are likely part of normal conversation
    if (content.length < 3) return;

    const isBotMention = message.mentions.users.has(client.user.id);
    const isQuestion = content.includes('?') || /^(what|who|when|where|why|how|can|could|would|is|are|am|do|does|did|will|should).+/.test(content);

    const confidenceThreshold = isBotMention ? config.confidenceThreshold.mention : isQuestion ? config.confidenceThreshold.question : config.confidenceThreshold.default;

    if (config.debug) {
      logger.debug(`Message: "${content}" | Clean: "${cleanContent}" | Mention: ${isBotMention} | Question: ${isQuestion} | Threshold: ${confidenceThreshold}`);
    }

    let matchFound = false;

    for (const [pattern, response] of questionsCache.entries()) {
      try {
        const regex = new RegExp(pattern, 'i');
        const messageContent = isBotMention ? cleanContent : content;
        const match = messageContent.match(regex);

        if (match) {
          const matchLength = match[0].length;
          const confidence = matchLength / messageContent.length;

          if (config.debug) {
            logger.debug(`Pattern: "${pattern}" | Match: "${match[0]}" | Confidence: ${confidence.toFixed(2)} | Threshold: ${confidenceThreshold} | Pass: ${confidence >= confidenceThreshold}`);
          }

          if (confidence >= confidenceThreshold) {
            const processingTime = Date.now() - startTime;
            message.reply(response);

            logger.info('Pattern matched and response sent', {
              pattern,
              user: `${message.author.username} (${message.author.id})`,
              channel: `${message.channel.name || 'DM'} (${message.channel.id})`,
              guild: message.guild ? `${message.guild.name} (${message.guild.id})` : 'Direct Message',
              confidence: confidence.toFixed(3),
              duration: processingTime,
              messageLength: message.content.length,
              responseLength: response.length,
            });

            patternStats.trackPatternMatch(message, pattern, confidence, processingTime, response);
            matchFound = true;
            break;
          }
        }
      } catch (error) {
        logger.error(`Error with pattern ${pattern}: ${error.message}`);
      }
    }

    if (!matchFound && config.debug) {
      const processingTime = Date.now() - startTime;
      logger.debug('No pattern match found', {
        user: `${message.author.username} (${message.author.id})`,
        channel: `${message.channel.name || 'DM'} (${message.channel.id})`,
        guild: message.guild ? `${message.guild.name} (${message.guild.id})` : 'Direct Message',
        messageContent: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        messageLength: content.length,
        duration: processingTime,
        patternsChecked: questionsCache.size,
        confidenceThreshold,
      });
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    logger.error('Error processing message', {
      error: error.message,
      stack: error.stack,
      user: `${message.author.username} (${message.author.id})`,
      channel: `${message.channel.name || 'DM'} (${message.channel.id})`,
      guild: message.guild ? `${message.guild.name} (${message.guild.id})` : 'Direct Message',
      messageContent: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
      duration: processingTime,
    });
  }
});

client.on('error', (error) => {
  logger.error('Discord client error', {
    error: error.message,
    stack: error.stack,
    code: error.code || 'UNKNOWN',
  });
});

client.on('warn', (warning) => {
  logger.warn('Discord client warning', {
    warning: warning.toString(),
    timestamp: new Date().toISOString(),
  });
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', {
    error: error.message || error,
    stack: error.stack,
    name: error.name || 'UnhandledRejection',
  });
});

process.on('SIGINT', () => {
  logger.info(`👋 Shutting down... (uptime: ${Math.round(process.uptime())}s)`);
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info(`👋 Shutting down... (uptime: ${Math.round(process.uptime())}s)`);
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
