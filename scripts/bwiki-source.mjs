import { spawn } from 'node:child_process';

export const API_URL = 'https://wiki.biligame.com/umamusume/api.php';

// Only public MediaWiki reads. No browser profile, cookies, or executable wiki code.
export async function readWiki(fields) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await readWikiOnce(fields); }
    catch (error) {
      // Retry only transient connection failures, never HTTP/access-control errors.
      if (attempt === 2 || ![7, 28, 35, 52, 55, 56].includes(error.curlCode)) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
}

function readWikiOnce(fields) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--silent', '--show-error', '--max-time', '60',
      '--data-binary', '@-', API_URL]);
    const output = [], errors = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.on('data', chunk => errors.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code) return reject(Object.assign(new Error(`BWIKI request failed: ${Buffer.concat(errors)}`), { curlCode: code }));
      try {
        const result = JSON.parse(Buffer.concat(output).toString('utf8'));
        if (result.error) throw new Error(JSON.stringify(result.error));
        resolve(result);
      } catch (error) { reject(error); }
    });
    // Encode before entering curl: Windows command-line encodings must not alter Chinese titles.
    child.stdin.end(new URLSearchParams({ format: 'json', ...fields }).toString());
  });
}

export function decodeText(text) {
  return text.replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)))
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_, key) => ({ lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', amp:'&' })[key]);
}
export const plainText = text => decodeText(text.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')).trim();

// Expanded BWIKI templates can emit literal line breaks inside JSON strings.
function escapeJsonStringLineBreaks(text) {
  let insideString = false;
  let escaped = false;
  let result = '';
  for (const char of text) {
    if (escaped) {
      escaped = false;
    } else if (char === '"') {
      insideString = !insideString;
    } else if (insideString && char === '\\') {
      escaped = true;
    } else if (insideString && (char === '\r' || char === '\n')) {
      result += char === '\r' ? '\\r' : '\\n';
      continue;
    }
    result += char;
  }
  return result;
}

export function parseSkillRows(html, expectedTotal) {
  const parts = [...html.matchAll(/<div\b([^>]*(?:id="jn-json"|class="jn-json-part")[^>]*)>([\s\S]*?)<\/div>/g)];
  if (!parts.length) throw new Error('Missing BWIKI skill JSON');
  const batchIds = parts.map(([ , attrs]) => Number(attrs.match(/data-batch="(\d+)"/)?.[1] ?? 0));
  if (new Set(batchIds).size !== parts.length || batchIds.some((id, i) => id !== i)) throw new Error('Missing or duplicate BWIKI skill batch');
  const rows = parts.flatMap(([, , text]) => {
    const json = text.trim().replace(/,\s*\]$/, ']');
    const parsed = JSON.parse(escapeJsonStringLineBreaks(json));
    if (!Array.isArray(parsed) || parsed.some(row => !row['3'] || !row['17'] || !row['7'])) throw new Error('Invalid BWIKI skill row');
    return parsed;
  });
  if (expectedTotal !== undefined && rows.length !== expectedTotal) throw new Error(`Incomplete BWIKI skill table: ${rows.length}/${expectedTotal}`);
  return rows;
}

export function parseCardIndex(html) {
  const cards = new Map();
  for (const match of html.matchAll(/<a\b[^>]*title="简\/([^"]+)"[^>]*><img\b[^>]*alt="Support thumb (\d+)\.png"[^>]*src="([^"]+)"/g)) {
    const id = Number(match[2]), name = decodeText(match[1]);
    if (cards.has(id) && cards.get(id).name !== name) throw new Error(`Conflicting BWIKI card: ${id}`);
    const image = decodeText(match[3]).replace('/thumb/', '/').replace(/\/[^/]+$/, '');
    cards.set(id, { id, name, image });
  }
  if (!cards.size) throw new Error('Missing BWIKI card index');
  return [...cards.values()].sort((a, b) => a.id - b.id);
}

export function parseCardSkillBadges(html) {
  const start = html.indexOf('>所持技能</div>');
  const end = html.indexOf('class="support_card-bt"', start + 20);
  if (start < 0 || end < 0) throw new Error('Missing BWIKI card skill section');
  const section = html.slice(start, end);
  const eventStart = section.indexOf('<b>事件技能</b>'), trainingStart = section.indexOf('<b>训练技能</b>');
  if (eventStart < 0 || trainingStart < 0 || trainingStart < eventStart) throw new Error('Missing BWIKI card skill labels');
  function badges(text) {
    return [...text.matchAll(/<div class="sj-an"[^>]*>([\s\S]*?)<\/div>/g)].map(([, body]) => {
      const name = body.match(/title="简\/([^"]+)"/)?.[1];
      const iconId = body.match(/alt="Utx ico skill (\d+)\.png"/)?.[1];
      if (!name || !iconId) throw new Error('Invalid BWIKI skill badge');
      return { name: decodeText(name), iconId };
    });
  }
  return { event: badges(section.slice(eventStart, trainingStart)), training: badges(section.slice(trainingStart)) };
}
