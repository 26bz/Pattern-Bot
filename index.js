import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";
import { loadQuestions } from "./utils/questionLoader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config();

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

export const questionsCache = new Map();

loadQuestions(path.join(__dirname, "questions"));

import("./events/ready.js");
import("./events/messageCreate.js");
import("./events/error.js");

client.login(process.env.DISCORD_TOKEN);
