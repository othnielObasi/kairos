import { existsSync } from 'fs';
import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';

const envCandidates = ['.env.arc', '.env'];

for (const file of envCandidates) {
  const envPath = resolve(process.cwd(), file);
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: false });
  }
}

export {};
