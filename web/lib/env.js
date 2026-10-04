// Settings that mustn't be committed (API keys), read from the environment
// or else from web/.env (gitignored), e.g.
//
//   ETSY_KEYSTRING=...        Etsy API key (web/lib/etsy.js)
//   ETSY_SHARED_SECRET=...
//   GITHUB_TOKEN=...          GitHub token for publishing (admin/publish.js)
import * as fs from 'node:fs';
import { parseEnv } from 'node:util';

const ENV_PATH = new URL('../.env', import.meta.url);

// The setting's value, or undefined. web/.env is re-read every time, so
// editing it needs no restart.
export function envValue(name) {
    if (process.env[name]) return process.env[name];
    if (!fs.existsSync(ENV_PATH)) return undefined;
    return parseEnv(fs.readFileSync(ENV_PATH, 'utf8'))[name] || undefined;
}
