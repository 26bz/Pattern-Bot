import { client } from "../index.js";
import { logger } from "../logger.js";

client.once("ready", () => {
  logger.info(`Logged in as ${client.user.tag}`);
  logger.info("Bot is ready to respond to questions!");
});
