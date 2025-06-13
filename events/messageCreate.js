import { EmbedBuilder } from "discord.js";
import { client, questionsCache } from "../index.js";
import { logger, patternStats } from "../logger.js";

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // Check for admin commands (server owner only)
  if (message.guild && message.author.id === message.guild.ownerId) {
    if (content === "!pattern-report") {
      logger.info(
        `Server owner ${message.author.username} requested a pattern report`
      );
      const reportFile = patternStats.generateReport();
      if (reportFile) {
        const embed = new EmbedBuilder()
          .setTitle("Pattern Match Report Generated")
          .setDescription(
            `Report has been generated and saved to: \`${reportFile}\``
          )
          .setColor("#00FF00")
          .setFooter({ text: "Use !export-stats to export raw data" });

        message.reply({ embeds: [embed] });
      } else {
        message.reply(
          "Failed to generate pattern report. Check console for errors."
        );
      }
      return;
    }

    // Command to export raw stats data
    if (content === "!export-stats") {
      logger.info(
        `Server owner ${message.author.username} requested stats export`
      );
      const exportFile = patternStats.exportStats();
      if (exportFile) {
        const embed = new EmbedBuilder()
          .setTitle("Pattern Statistics Exported")
          .setDescription(`Statistics have been exported to: \`${exportFile}\``)
          .setColor("#00FF00")
          .setFooter({ text: "Use !pattern-report for a formatted report" });

        message.reply({ embeds: [embed] });
      } else {
        message.reply(
          "Failed to export pattern statistics. Check console for errors."
        );
      }
      return;
    }

    // Command to show top patterns directly in Discord
    if (content === "!top-patterns") {
      logger.info(
        `Server owner ${message.author.username} requested top patterns`
      );
      const topPatterns = patternStats.getTopPatterns(10);

      if (topPatterns.length === 0) {
        message.reply("No pattern statistics available yet.");
        return;
      }

      let description = "Top 10 most matched patterns:\n\n";
      topPatterns.forEach((data, index) => {
        description += `**${index + 1}.** Pattern: \`${data.pattern}\` [${data.count}]\n`;
        description += `   Last matched: ${new Date(data.lastMatched).toLocaleString()}\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle("Pattern Match Statistics")
        .setDescription(description)
        .setColor("#00FF00")
        .setFooter({ text: "Use !pattern-report for a full report" });

      message.reply({ embeds: [embed] });
      return;
    }
  }

  // Check for matches in our questions cache
  // Only process messages that are likely to be questions or commands
  // Ignore very short messages or messages that are likely part of normal conversation
  if (content.length < 3) return;

  const isBotMention = message.mentions.users.has(client.user.id);
  const isQuestion =
    content.includes("?") ||
    /^(what|who|when|where|why|how|can|could|would|is|are|am|do|does|did|will|should).+/.test(
      content
    );

  // If it's a direct mention or a question, process with higher confidence
  const confidenceThreshold = isBotMention || isQuestion ? 0.6 : 0.85;

  let matchFound = false;

  for (const [pattern, response] of questionsCache.entries()) {
    try {
      const regex = new RegExp(pattern, "i");
      const match = content.match(regex);

      if (match) {
        // Calculate confidence based on match length vs content length
        const matchLength = match[0].length;
        const confidence = matchLength / content.length;

        if (confidence >= confidenceThreshold) {
          message.reply(response);
          logger.info(
            `Matched pattern: ${pattern} with confidence: ${confidence.toFixed(2)}`
          );
          patternStats.trackPatternMatch(message, pattern, confidence);
          matchFound = true;
          break;
        }
      }
    } catch (error) {
      console.error(`Error with pattern ${pattern}: ${error.message}`);
    }
  }

  if (!matchFound && process.env.DEBUG === "true") {
    logger.debug(`No high-confidence match found for: "${content}"`);
  }
});
