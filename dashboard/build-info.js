// Build-time version info for the About sheet. Runs in Node (vite.config.js); never shipped as-is.
import { execSync } from 'node:child_process';

const git = (args) => { try { return execSync('git ' + args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

// "feat(fridge): add REWE feed" -> "Add REWE feed"
export function cleanSubject(s) {
  const t = s.replace(/^(feat|fix|docs|chore|refactor|perf|style|test)(\([^)]*\))?!?:\s*/i, '').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function buildInfo() {
  const tag = git('describe --tags --abbrev=0');
  // Sitting exactly on a tag: show what that tag added (previous tag..tag), not an empty list.
  const onTag = tag && git('describe --tags --exact-match') !== '';
  const prev = onTag ? git('describe --tags --abbrev=0 "' + tag + '^"') : tag;
  const range = onTag ? (prev ? prev + '..' + tag : tag) : (tag ? tag + '..HEAD' : 'HEAD');
  const log = git('log --no-merges -n 8 --format=%s ' + range).split('\n').filter(Boolean).map(cleanSubject);
  return {
    id: Date.now().toString(36), // changes on every build; /version.json carries the same id
    tag,
    sha: git('rev-parse --short HEAD'),
    branch: git('rev-parse --abbrev-ref HEAD'),
    dirty: git('status --porcelain') !== '',
    built: new Date().toISOString(),
    since: onTag ? '' : tag, // "since <tag>" label when ahead of it
    log
  };
}
