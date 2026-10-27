#!/usr/bin/env node
/**
 * List all apps stored in the R2 distribution system. Local read-only tool.
 *
 * Usage (run from anywhere, resolves .env relative to this file):
 *   node functions/list-apps.js            # Mode 1: scan the R2 bucket directly
 *                                          #   (works NOW, before deploy; shows
 *                                          #   app ids / platforms / object count
 *                                          #   / total size from bucket layout)
 *   node functions/list-apps.js --api      # Mode 2: query the deployed backend
 *                                          #   GET {R2_ENDPOINT}/r2/apps with the
 *                                          #   x-api-key from .env. Full roster
 *                                          #   with version counts from Firestore.
 *                                          #   Optional: --api https://.../appdownload
 * 
 * node functions/list-apps.js --tree          # 全 bucket
 * node functions/list-apps.js --tree cosmo    # 只看某个 App
 *
 */
const fs = require('fs');
const path = require('path');

// --- load .env (same folder as this script) ---
const env = {};
fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
});

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : null;
};

const pad = (s, n) => String(s == null ? '' : s).slice(0, n).padEnd(n);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1) + 'M';

function table(headers, rows) {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)) + 2);
  console.log(headers.map((h, i) => pad(h, widths[i])).join(''));
  console.log(widths.map((w) => '-'.repeat(w)).join(''));
  rows.forEach((r) => console.log(r.map((c, i) => pad(c, widths[i])).join('')));
}

async function modeR2Scan() {
  const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const list = async (Prefix, Delimiter) =>
    (await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix, Delimiter })));

  console.log(`Scanning R2 bucket "${env.R2_BUCKET}" (prefix apps/) ...\n`);
  // Level 1: app ids
  const l1 = await list('apps/', '/');
  const appIds = (l1.CommonPrefixes || []).map((p) => p.Prefix.replace(/^apps\/|\/$/g, '')).filter((x) => x && !x.startsWith('__'));

  if (appIds.length === 0) { console.log('No apps found in the bucket yet (only test leftovers would live under apps/__r2test__).'); return; }

  const rows = [];
  for (const appId of appIds) {
    // Level 2: platforms; then full listing for stats
    let token, objects = [], prefix = `apps/${appId}/`;
    do {
      const rsp = await list(prefix, undefined);
      (rsp.Contents || []).forEach((o) => objects.push(o));
      token = rsp.NextContinuationToken;
    } while (token);
    const platforms = [...new Set(objects.map((o) => o.Key.split('/')[2]).filter(Boolean))];
    const builds = [...new Set(objects.map((o) => o.Key.split('/')[4] || o.Key.split('/')[3]).filter((x) => x && x.startsWith('b')))];
    const size = objects.reduce((a, o) => a + (o.Size || 0), 0);
    const newest = objects.reduce((a, o) => ((o.LastModified || 0) > (a.LastModified || 0) ? o : a), {});
    rows.push([appId, platforms.join(','), builds.length, objects.length, mb(size), newest.LastModified ? newest.LastModified.toISOString().slice(0, 16).replace('T', ' ') : '']);
  }
  table(['appId', 'platforms', 'builds', 'objects', 'size', 'lastUpload'], rows);

  const versionsFilter = arg('--versions');
  if (versionsFilter && typeof versionsFilter === 'string') {
    console.log(`\nBuild folders of "${versionsFilter}":`);
    const prefix = `apps/${versionsFilter}/`;
    let token, keys = [];
    do {
      const rsp = await list(prefix, undefined);
      (rsp.Contents || []).forEach((o) => keys.push(o.Key));
      token = rsp.NextContinuationToken;
    } while (token);
    keys.sort().reverse().forEach((k) => console.log('  ' + k));
  }
}

async function modeApi() {
  const endpoint = (typeof arg('--api') === 'string' ? arg('--api') : null)
    || env.R2_ENDPOINT || 'https://us-central1-aigensstoretest.cloudfunctions.net/appdownload';
  const r = await fetch(`${endpoint.replace(/\/+$/, '')}/r2/apps`, { headers: { 'x-api-key': env.R2_API_TOKEN } });
  const json = await r.json().catch(() => null);
  if (!r.ok || !json) { console.error(`Request failed (${r.status}):`, JSON.stringify(json)); process.exit(1); }
  console.log(`Source: ${endpoint}/r2/apps  (R2 meta.json aggregate)\n`);
  if (!json.apps || json.apps.length === 0) { console.log('No builds registered yet (deploy + upload first).'); return; }
  const rows = json.apps.map((a) => [a.appId, a.builds, `a:${a.android}`, `i:${a.ios}`, (a.envs || []).join(','), a.latestVersion, (a.latestAt || '').slice(0, 16).replace('T', ' ')]);
  table(['appId', 'builds', 'android', 'ios', 'envs', 'latest', 'latestAt'], rows);
}



/** Tree view of the bucket layout (optionally one app): node list-apps.js --tree [appId] */
async function modeTree(appFilter) {
  const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: 'https://' + env.R2_ACCOUNT_ID + '.r2.cloudflarestorage.com',
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
  const listAll = async (prefix) => {
    const out = []; let token;
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix, ContinuationToken: token }));
    (r.Contents || []).forEach((o) => out.push(o));
      token = r.IsTruncated ? r.NextContinuationToken : undefined;
    } while (token);
    return out;
  };

  const roots = appFilter ? ['apps/' + appFilter + '/'] : ['apps/', 'plists/'];
  const objects = [];
  for (const r of roots) objects.push(...(await listAll(r)));

  // build tree from keys
  const root = { children: new Map() };
  objects.forEach((o) => {
    const parts = o.Key.split('/');
    let node = root;
    parts.forEach((part, i) => {
      if (!part) return;
      if (!node.children.has(part)) node.children.set(part, { children: new Map(), size: 0, isLeaf: i === parts.length - 1 });
      node = node.children.get(part);
    });
    node.size = o.Size || 0;
  });

  // fetch meta.json contents (concurrently) to annotate builds
  const metaKeys = objects.filter((o) => o.Key.endsWith('/meta.json')).map((o) => o.Key);
  const metaByKey = new Map();
  for (let i = 0; i < metaKeys.length; i += 10) {
    const chunk = metaKeys.slice(i, i + 10);
    const vals = await Promise.all(chunk.map(async (k) => {
      try {
        const r = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: k }));
        return JSON.parse(await r.Body.transformToString('utf-8'));
      } catch (e) { return null; }
    }));
    chunk.forEach((k, j) => { if (vals[j]) metaByKey.set(k, vals[j]); });
  }

  const fmtSize = (b) => {
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
    if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  };
  const beijing = (ts) => {
    const d = new Date((ts || 0) + 8 * 3600 * 1000);
    const p2 = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
  };

  const lines = [];
  const walk = (node, label, prefix, isLast, keyPath) => {
    const connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
    let note = '';
    if (keyPath.endsWith('meta.json') && metaByKey.has(keyPath)) {
      const m = metaByKey.get(keyPath);
      if (Array.isArray(m.builds)) {
        const latest = m.builds.slice().sort((a, b) => (b.buildCreatedTimestamp || 0) - (a.buildCreatedTimestamp || 0))[0];
        note = '   [' + m.builds.length + ' build(s) \u00B7 latest ' + (latest ? (latest.buildVersion || '?') + ' \u00B7 ' + beijing(latest.buildCreatedTimestamp) : '-') + ']';
      } else {
        note = '   [' + (m.buildVersion || '?') + ' \u00B7 ' + (m.env || '?') + ' \u00B7 ' + beijing(m.buildCreatedTimestamp) + ']';
      }
    } else if (node.isLeaf) {
      note = '   ' + fmtSize(node.size);
    }
    lines.push(prefix + connector + label + note);
    const kids = [...node.children.entries()];
    kids.forEach(([name, child], i) => {
      const last = i === kids.length - 1;
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      walk(child, name, childPrefix, last, keyPath ? keyPath + '/' + name : name);
    });
  };

  const top = [...root.children.entries()];
  top.forEach(([name, child], i) => {
    walk(child, name + '/', '', i === top.length - 1, name);
  });
  console.log(lines.join('\n'));
  console.log('\ntotal objects:', objects.length);
}

(async () => {
  try {
    if (arg('--tree') !== null) await modeTree(typeof arg('--tree') === 'string' ? arg('--tree') : undefined);
    else if (arg('--api')) await modeApi();
    else await modeR2Scan();
  } catch (e) {
    console.error('ERROR:', e.message);
    process.exit(1);
  }
})();
