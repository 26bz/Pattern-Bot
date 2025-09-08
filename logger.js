import { createConsola } from 'consola';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    pattern: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    pattern: 'cyan',
    debug: 'blue',
  },
};

winston.addColors(logLevels.colors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let output = `[${timestamp}] ${level}: ${message}`;

    if (meta.guild) output += ` | Guild: ${meta.guild}`;
    if (meta.channel) output += ` | Channel: ${meta.channel}`;
    if (meta.user) output += ` | User: ${meta.user}`;
    if (meta.pattern) output += ` | Pattern: "${meta.pattern}"`;
    if (meta.confidence) output += ` | Confidence: ${meta.confidence}`;
    if (meta.duration) output += ` | Duration: ${meta.duration}ms`;

    if (stack) output += `\n${stack}`;

    const remainingMeta = { ...meta };
    delete remainingMeta.guild;
    delete remainingMeta.channel;
    delete remainingMeta.user;
    delete remainingMeta.pattern;
    delete remainingMeta.confidence;
    delete remainingMeta.duration;

    if (Object.keys(remainingMeta).length > 0) {
      output += ` | Meta: ${JSON.stringify(remainingMeta)}`;
    }

    return output;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
  winston.format.json()
);

const logger = createConsola({
  level: process.env.LOG_LEVEL === 'debug' ? 4 : 3,
  formatOptions: {
    date: true,
    colors: true,
    compact: false,
  },
});

const fileLogger = winston.createLogger({
  levels: logLevels.levels,
  format: fileFormat,
  defaultMeta: { service: 'discord-bot' },
  exitOnError: false,
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

const patternFilter = winston.format((info) => {
  return info.level === 'pattern' ? info : false;
});

const patternTransport = new DailyRotateFile({
  filename: path.join(logDir, 'pattern_matches-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'pattern',
  maxSize: '20m',
  maxFiles: '30d',
  zippedArchive: true,
  format: winston.format.combine(
    patternFilter(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    winston.format.json()
  ),
});

const activityFilter = winston.format((info) => {
  return info.level !== 'pattern' && info.level !== 'debug' ? info : false;
});

const activityTransport = new DailyRotateFile({
  filename: path.join(logDir, 'bot_activity-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'info',
  maxSize: '20m',
  maxFiles: '30d',
  zippedArchive: true,
  format: winston.format.combine(
    activityFilter(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    winston.format.json()
  ),
});

patternTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info(`Pattern log rotated from ${oldFilename} to ${newFilename}`);
});

activityTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info(`Activity log rotated from ${oldFilename} to ${newFilename}`);
});

patternTransport.on('error', (err) => {
  console.error('Pattern transport error:', err);
});

activityTransport.on('error', (err) => {
  console.error('Activity transport error:', err);
});

fileLogger.add(patternTransport);
fileLogger.add(activityTransport);

const hybridLogger = {
  info: (message, meta = {}) => {
    if (message.includes('Pattern matched and response sent')) {
      fileLogger.info(message, meta);
      return;
    }

    if (message.includes('Bot shutdown initiated')) {
      fileLogger.info(message, meta);
      return;
    }

    if (typeof message === 'string' && meta && Object.keys(meta).length > 0) {
      if (message.includes('Bot successfully logged in')) {
        logger.success(`🤖 ${meta.botTag} online | 🏠 ${meta.guildCount} servers | 👥 ${meta.userCount} users | 🎯 ${meta.patternsLoaded} patterns`);
      } else {
        logger.info(message);
      }
    } else {
      logger.info(message);
    }
    fileLogger.info(message, meta);
  },

  error: (message, meta = {}) => {
    if (typeof message === 'string' && meta && Object.keys(meta).length > 0) {
      if (meta.error && meta.user) {
        logger.error(`❌ ${message} | 👤 ${meta.user} | Error: ${meta.error}`);
      } else {
        logger.error(`❌ ${message}`);
      }
    } else {
      logger.error(`❌ ${message}`);
    }
    fileLogger.error(message, meta);
  },

  warn: (message, meta = {}) => {
    logger.warn(`⚠️ ${message}`);
    fileLogger.warn(message, meta);
  },

  debug: (message, meta = {}) => {
    if (process.env.DEBUG === 'true') {
      if (meta && meta.user && meta.duration !== undefined) {
        logger.debug(`🔍 ${message} | 👤 ${meta.user} | ⏱️ ${meta.duration}ms`);
      } else {
        logger.debug(`🔍 ${message}`);
      }
    }
    fileLogger.debug(message, meta);
  },

  log: (level, message, meta = {}) => {
    hybridLogger[level] ? hybridLogger[level](message, meta) : hybridLogger.info(message, meta);
  },
};

class PerformanceLogger {
  static logBotStartup(startTime) {
    const bootTime = Date.now() - startTime;
    fileLogger.info('Bot startup completed', {
      bootTime: `${bootTime}ms`,
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
    });
    logger.success(`🚀 Ready in ${bootTime}ms`);
  }

  static logMemoryUsage() {
    const usage = process.memoryUsage();
    fileLogger.info('Memory usage report', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`,
    });
    logger.info(`💾 Memory: ${Math.round(usage.heapUsed / 1024 / 1024)}MB used / ${Math.round(usage.heapTotal / 1024 / 1024)}MB total`);
  }

  static startPerformanceTimer(label) {
    const startTime = Date.now();
    return {
      end: (metadata = {}) => {
        const duration = Date.now() - startTime;
        fileLogger.debug(`Performance: ${label}`, {
          duration: `${duration}ms`,
          ...metadata,
        });
        logger.debug(`⏱️ ${label}: ${duration}ms`);
        return duration;
      },
    };
  }
}

setInterval(() => {
  PerformanceLogger.logMemoryUsage();
}, 30 * 60 * 1000);

fileLogger.on('error', (err) => {
  console.error('Logger error:', err);
});

class PatternStats {
  constructor() {
    this.statsFile = path.join(logDir, 'pattern_stats.json');
    this.patternStats = {};
    this.loadStats();
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = fs.readFileSync(this.statsFile, 'utf8');
        this.patternStats = JSON.parse(data);
        logger.info(`Loaded ${Object.keys(this.patternStats).length} pattern statistics`);
      } else {
        this.saveStats();
      }
    } catch (error) {
      logger.error(`Error loading pattern stats: ${error.message}`);
      this.patternStats = {};
    }
  }

  saveStats() {
    try {
      fs.writeFileSync(this.statsFile, JSON.stringify(this.patternStats, null, 2));
    } catch (error) {
      logger.error(`Error saving pattern stats: ${error.message}`);
    }
  }

  trackPatternMatch(message, pattern, confidence, processingTime = null, response = '') {
    const userId = message.author.id;
    const username = message.author.username;
    const channelId = message.channel.id;
    const channelName = message.channel.name || 'Unknown';
    const content = message.content;
    const guildId = message.guild ? message.guild.id : 'DM';
    const guildName = message.guild ? message.guild.name : 'Direct Message';

    if (!this.patternStats[pattern]) {
      this.patternStats[pattern] = {
        count: 0,
        examples: [],
        lastMatched: new Date().toISOString(),
        channels: {},
        users: {},
        avgConfidence: 0,
        totalConfidence: 0,
      };
    }

    this.patternStats[pattern].count++;
    this.patternStats[pattern].lastMatched = new Date().toISOString();
    this.patternStats[pattern].totalConfidence += confidence;
    this.patternStats[pattern].avgConfidence = this.patternStats[pattern].totalConfidence / this.patternStats[pattern].count;

    if (!this.patternStats[pattern].channels[channelId]) {
      this.patternStats[pattern].channels[channelId] = {
        name: channelName,
        count: 0,
      };
    }
    this.patternStats[pattern].channels[channelId].count++;

    if (!this.patternStats[pattern].users[userId]) {
      this.patternStats[pattern].users[userId] = {
        name: username,
        count: 0,
      };
    }
    this.patternStats[pattern].users[userId].count++;

    if (this.patternStats[pattern].examples.length < 5) {
      this.patternStats[pattern].examples.push({
        content,
        timestamp: new Date().toISOString(),
        confidence: confidence.toFixed(3),
      });
    }

    fileLogger.log('pattern', 'Pattern matched successfully', {
      pattern,
      user: `${username} (${userId})`,
      channel: `${channelName} (${channelId})`,
      guild: `${guildName} (${guildId})`,
      confidence: confidence.toFixed(3),
      message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      messageLength: content.length,
      processingTime: processingTime ? `${processingTime}ms` : 'N/A',
      totalMatches: this.patternStats[pattern].count,
      avgConfidence: this.patternStats[pattern].avgConfidence.toFixed(3),
    });

    const cleanMessage = content.replace(/[\r\n]+/g, ' ').substring(0, 35);
    const messagePreview = cleanMessage.length < content.length ? cleanMessage + '...' : cleanMessage;
    const responsePreview = response.substring(0, 25) + (response.length > 25 ? '...' : '');
    const channelShort = channelName.length > 12 ? channelName.substring(0, 12) + '...' : channelName;

    logger.success(`🎯 "${messagePreview}" → "${responsePreview}" | 👤 ${username} in #${channelShort} | 📊 ${confidence.toFixed(2)} | ⏱️ ${processingTime || 0}ms`);

    this.saveStats();
  }

  generateReport() {
    const sortedPatterns = Object.entries(this.patternStats).sort((a, b) => b[1].count - a[1].count);

    let report = 'Pattern Match Statistics Report\n';
    report += '================================\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += `Total Patterns: ${sortedPatterns.length}\n\n`;

    sortedPatterns.forEach(([pattern, data], index) => {
      report += `${index + 1}. Pattern: "${pattern}" [${data.count}]\n`;
      report += `   Last Matched: ${data.lastMatched}\n`;
      report += `   Examples:\n`;

      if (data.examples.length > 0) {
        data.examples.forEach((example) => {
          report += `   - "${example}"\n`;
        });
      } else {
        report += `   - No examples stored\n`;
      }

      const topChannels = Object.entries(data.channels || {})
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

      if (topChannels.length > 0) {
        report += `   Top Channels:\n`;
        topChannels.forEach(([channelId, channelData]) => {
          report += `   - ${channelData.name} (${channelId}): ${channelData.count} matches\n`;
        });
      }

      const topUsers = Object.entries(data.users || {})
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

      if (topUsers.length > 0) {
        report += `   Top Users:\n`;
        topUsers.forEach(([userId, userData]) => {
          report += `   - ${userData.name} (${userId}): ${userData.count} matches\n`;
        });
      }

      report += `\n`;
    });

    const reportFile = path.join(logDir, `pattern_report_${Date.now()}.txt`);

    try {
      fs.writeFileSync(reportFile, report);
      logger.info(`Report generated at ${reportFile}`);
      return reportFile;
    } catch (error) {
      logger.error(`Error generating report: ${error.message}`);
      return null;
    }
  }

  exportStats() {
    const exportFile = path.join(logDir, `pattern_stats_export_${Date.now()}.json`);

    try {
      fs.writeFileSync(exportFile, JSON.stringify(this.patternStats, null, 2));
      logger.info(`Stats exported to ${exportFile}`);
      return exportFile;
    } catch (error) {
      logger.error(`Error exporting stats: ${error.message}`);
      return null;
    }
  }

  getTopPatterns(limit = 10) {
    return Object.entries(this.patternStats)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([pattern, data]) => ({
        pattern,
        count: data.count,
        lastMatched: data.lastMatched,
      }));
  }

  getTotalPatterns() {
    return Object.keys(this.patternStats).length;
  }
}

const patternStats = new PatternStats();

export { hybridLogger as logger, patternStats, PerformanceLogger };
export default { logger: hybridLogger, patternStats, PerformanceLogger };
