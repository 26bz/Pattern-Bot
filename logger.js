import winston from "winston";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logDir = path.join(__dirname, "logs");
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
    error: "red",
    warn: "yellow",
    info: "green",
    pattern: "cyan",
    debug: "blue",
  },
};

winston.addColors(logLevels.colors);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.json()
);

const logger = winston.createLogger({
  levels: logLevels.levels,
  format: fileFormat,
  defaultMeta: { service: "discord-bot" },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      level: "pattern",
    }),
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
  ],
});

const patternTransport = new winston.transports.File({
  filename: path.join(logDir, "pattern_matches.log"),
  level: "pattern",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json()
  ),
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json(),
    winston.format.printf((info) => {
      if (info.level === "pattern") {
        return JSON.stringify(info);
      }
      return null; // Don't log other levels in this transport
    })
  ),
});

const activityTransport = new winston.transports.File({
  filename: path.join(logDir, "bot_activity.log"),
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json(),
    winston.format.printf((info) => {
      if (info.level !== "pattern" && info.level !== "debug") {
        return JSON.stringify(info);
      }
      return null;
    })
  ),
});

logger.add(patternTransport);
logger.add(activityTransport);

class PatternStats {
  constructor() {
    this.statsFile = path.join(logDir, "pattern_stats.json");
    this.patternStats = {};
    this.loadStats();
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = fs.readFileSync(this.statsFile, "utf8");
        this.patternStats = JSON.parse(data);
        logger.info(
          `Loaded ${Object.keys(this.patternStats).length} pattern statistics`
        );
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
      fs.writeFileSync(
        this.statsFile,
        JSON.stringify(this.patternStats, null, 2)
      );
    } catch (error) {
      logger.error(`Error saving pattern stats: ${error.message}`);
    }
  }

  trackPatternMatch(message, pattern, confidence) {
    const userId = message.author.id;
    const username = message.author.username;
    const channelId = message.channel.id;
    const channelName = message.channel.name;
    const content = message.content;
    const guildId = message.guild ? message.guild.id : "DM";
    const guildName = message.guild ? message.guild.name : "Direct Message";

    if (!this.patternStats[pattern]) {
      this.patternStats[pattern] = {
        count: 0,
        examples: [],
        lastMatched: new Date().toISOString(),
        channels: {},
        users: {},
      };
    }

    this.patternStats[pattern].count++;
    this.patternStats[pattern].lastMatched = new Date().toISOString();

    // Track channel statistics
    if (!this.patternStats[pattern].channels[channelId]) {
      this.patternStats[pattern].channels[channelId] = {
        name: channelName,
        count: 0,
      };
    }
    this.patternStats[pattern].channels[channelId].count++;

    // Track user statistics
    if (!this.patternStats[pattern].users[userId]) {
      this.patternStats[pattern].users[userId] = {
        name: username,
        count: 0,
      };
    }
    this.patternStats[pattern].users[userId].count++;

    if (this.patternStats[pattern].examples.length < 5) {
      this.patternStats[pattern].examples.push(content);
    }

    logger.log(
      "pattern",
      `Pattern matched: "${pattern}" | User: ${username} | Channel: ${channelName} | Guild: ${guildName} | Confidence: ${confidence.toFixed(2)} | Message: "${content}"`
    );

    this.saveStats();
  }

  generateReport() {
    const sortedPatterns = Object.entries(this.patternStats).sort(
      (a, b) => b[1].count - a[1].count
    );

    let report = "Pattern Match Statistics Report\n";
    report += "================================\n\n";
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

      // Top channels for this pattern
      const topChannels = Object.entries(data.channels || {})
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);

      if (topChannels.length > 0) {
        report += `   Top Channels:\n`;
        topChannels.forEach(([channelId, channelData]) => {
          report += `   - ${channelData.name} (${channelId}): ${channelData.count} matches\n`;
        });
      }

      // Top users for this pattern
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
    const exportFile = path.join(
      logDir,
      `pattern_stats_export_${Date.now()}.json`
    );

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
}

const patternStats = new PatternStats();

export { logger, patternStats };
export default { logger, patternStats };
