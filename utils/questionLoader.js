import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { questionsCache } from '../index.js';

export function loadQuestions(dir) {
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
