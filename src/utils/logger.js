import path from 'node:path';
import fs from 'node:fs';

import pino from 'pino';

export function createLogger() {
  const logDir = path.join(process.cwd(), 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  return pino({
    level: 'info',
    transport: {
      target: 'pino/file',
      options: {
        destination: path.join(logDir, 'app.log'),
        mkdir: true
      }
    }
  });
}
