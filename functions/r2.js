/**
 * Cloudflare R2 app distribution. ALL data lives in R2 (no external DB —
 * the project's Firestore is Datastore Mode and cannot be used):
 *   apps/{appId}/icon.png                            app-level icon (optional)
 *   apps/{appId}/{platform}/{buildKey}/package.apk   package + icon.png + meta.json
 *   plists/{buildKey}.plist                          iOS OTA manifest (on demand)
 * Deleting a build = deleting its directory (same lifecycle for file+meta).
 */
const express = require('express');
const {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand,
  HeadObjectCommand, ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { getDeviceConfig, getAllVersions } = require('./http');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET = process.env.R2_BUCKET || '';
const R2_API_TOKEN = process.env.R2_API_TOKEN || '';
const R2_PUBLIC_BASE_URL = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

const UPLOAD_URL_EXPIRES = 30 * 60;
const DOWNLOAD_URL_EXPIRES = 7 * 24 * 60 * 60;
const MAX_DOWNLOAD_URL_EXPIRES = 30 * 24 * 60 * 60;
const PLIST_URL_EXPIRES = 7 * 24 * 60 * 60;
const READABLE_PREFIXES = ['apps/', 'plists/'];
const ALLOWED_EXTENSIONS = ['.apk', '.aab', '.ipa', '.png', '.jpg', '.jpeg', '.webp'];
const CONTENT_TYPES = {
  '.apk': 'application/vnd.android.package-archive',
  '.aab': 'application/octet-stream', '.ipa': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};
const META_FILE = 'meta.json';

// Normalize env aliases so the directory segment is canonical (uat/prd/...).
const normEnv = (e) => {
  if (!e) return '';
  let x = String(e).toLowerCase();
  if (x === 'phase2uat' || x === 'uatphase2') return 'uat';
  if (x.includes('v4')) x = x.replace('v4', '');
  return x;
};

const envDir = (e) => normEnv(e) || 'none';

let s3Client = null;
function getS3() {
  if (s3Client) return s3Client;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    throw new Error('R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.');
  }
  s3Client = new S3Client({
    region: 'auto',
    // Path-style keeps presigned URLs on the single-level account domain
    // (bucket prefix in the path) — one fewer DNS label, more resilient to
    // flaky resolvers that fail on multi-level wildcard subdomains.
    forcePathStyle: true,
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
  return s3Client;
}

// ---- Cliq notification (R2_CLIQ_WEBHOOK, best-effort) ----
// Covers EVERY upload path (jj-cli, console, direct API). Awaited because gen1
// freezes the process once the response is sent.
const R2_CLIQ_WEBHOOK = process.env.R2_CLIQ_WEBHOOK || '';

async function notifyCliq(text) {
  if (!R2_CLIQ_WEBHOOK) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const rsp = await fetch(R2_CLIQ_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    console.log('cliq notify:', rsp.status);
  } catch (error) { console.warn('cliq notify failed:', error?.message); }
}

const fmtMB = (bytes) => ((Number(bytes) || 0) / 1024 / 1024).toFixed(1) + ' MB';
// ---- meta storage (R2 based) ----
const metaKeyOf = (appId, platform, env, buildKey) => `apps/${appId}/${platform}/${envDir(env)}/${buildKey}/${META_FILE}`;

async function writeMeta(key, obj) {
  await getS3().send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: JSON.stringify(obj), ContentType: 'application/json',
  }));
}

// ---- env-level meta (ONE meta.json per app/platform/env, builds array) ----
const envMetaKey = (appId, platform, env) => `apps/${appId}/${platform}/${envDir(env)}/meta.json`;

async function readEnvMeta(appId, platform, env) {
  const m = await readMeta(envMetaKey(appId, platform, env));
  if (m && Array.isArray(m.builds)) return m;
  return { updatedAt: 0, builds: [] };
}

async function writeEnvMeta(appId, platform, env, meta) {
  await writeMeta(envMetaKey(appId, platform, env), { ...meta, updatedAt: Date.now() });
}

/** Append/replace one build with optimistic write-verify (concurrent commits). */
async function appendBuild(appId, platform, env, doc, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const meta = await readEnvMeta(appId, platform, env);
    const idx = meta.builds.findIndex((b) => b.buildKey === doc.buildKey);
    if (idx === -1) meta.builds.push(doc); else meta.builds[idx] = doc;
    await writeEnvMeta(appId, platform, env, meta);
    const verify = await readEnvMeta(appId, platform, env);
    if (verify.builds.some((b) => b.buildKey === doc.buildKey)) return verify;
  }
  throw new Error('concurrent meta update conflict, please retry the upload');
}

/** Mutate one build (fn receives the doc) with write-verify. */
async function modifyBuild(appId, platform, env, buildKey, fn, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const meta = await readEnvMeta(appId, platform, env);
    const doc = meta.builds.find((b) => b.buildKey === buildKey);
    if (!doc) return null;
    fn(doc);
    await writeEnvMeta(appId, platform, env, meta);
    const verify = await readEnvMeta(appId, platform, env);
    if (verify.builds.some((b) => b.buildKey === buildKey)) return verify;
  }
  return null;
}

/** Remove one build from the env meta with write-verify. */
async function removeBuild(appId, platform, env, buildKey, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    const meta = await readEnvMeta(appId, platform, env);
    const before = meta.builds.length;
    meta.builds = meta.builds.filter((b) => b.buildKey !== buildKey);
    if (meta.builds.length === before) return { ok: true, remaining: before }; // already gone
    await writeEnvMeta(appId, platform, env, meta);
    const verify = await readEnvMeta(appId, platform, env);
    if (!verify.builds.some((b) => b.buildKey === buildKey)) {
      await removeEnvMetaIfEmpty(appId, platform, env);
      return { ok: true, remaining: verify.builds.length };
    }
  }
  return { ok: false, remaining: -1 };
}

/** Delete the env meta file when its builds array is empty (keeps the tree clean). */
async function removeEnvMetaIfEmpty(appId, platform, env) {
  try {
    const meta = await readEnvMeta(appId, platform, env);
    if (meta.builds.length === 0) {
      await getS3().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: envMetaKey(appId, platform, env) }));
      invalidateDirCache();
    }
  } catch (error) { /* best-effort */ }
}

/** Locate a build by buildKey. Direct when app/platform/env given (FE passes
 *  them), otherwise falls back to scanning env dirs (management curls). */
async function findBuildByKey(buildKey, appId, platform, env) {
  if (appId && platform && env) {
    const meta = await readEnvMeta(appId, platform, env);
    const b = meta.builds.find((x) => x.buildKey === buildKey);
    return b ? { build: b, appId, platform, env: normEnv(env) } : null;
  }
  const scan = async () => {
    const envDirs = await envDirsCached();
    const metas = await readMetas(envDirs.map((ed) => ed + 'meta.json'));
    for (let i = 0; i < envDirs.length; i++) {
      const parts = envDirs[i].replace(/\/$/, '').split('/'); // [apps, appId, platform, env]
      const b = metas[i] && metas[i].builds && metas[i].builds.find((x) => x.buildKey === buildKey);
      if (b) return { build: b, appId: parts[1], platform: parts[2], env: parts[3] };
    }
    return null;
  };
  let found = await scan();
  if (!found) { invalidateDirCache(); found = await scan(); } // fresh dirs since cache
  return found;
}

async function readMeta(key) {
  try {
    const rsp = await getS3().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return JSON.parse(await rsp.Body.transformToString('utf-8'));
  } catch (error) { return null; }
}

async function listKeys(prefix) {
  const keys = []; let token;
  do {
    const rsp = await getS3().send(new ListObjectsV2Command({
      Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token,
    }));
    (rsp.Contents || []).forEach((o) => keys.push(o.Key));
    token = rsp.IsTruncated ? rsp.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function listDirs(prefix) {
  const dirs = []; let token;
  do {
    const rsp = await getS3().send(new ListObjectsV2Command({
      Bucket: R2_BUCKET, Prefix: prefix, Delimiter: '/', ContinuationToken: token,
    }));
    (rsp.CommonPrefixes || []).forEach((p) => dirs.push(p.Prefix));
    token = rsp.IsTruncated ? rsp.NextContinuationToken : undefined;
  } while (token);
  return dirs;
}

async function readMetas(keys, concurrency = 20) {
  const out = new Array(keys.length);
  for (let i = 0; i < keys.length; i += concurrency) {
    const chunk = keys.slice(i, i + concurrency);
    const values = await Promise.all(chunk.map((k) => readMeta(k)));
    values.forEach((v, j) => { out[i + j] = v; });
  }
  return out;
}

async function listBuildDirs(appId, platform) {
  if (platform) return listDirs(`apps/${appId}/${platform}/`);
  const platforms = await listDirs(`apps/${appId}/`);
  const out = [];
  for (const p of platforms) out.push(...(await listDirs(p)));
  return out;
}

// Short-lived RESULT cache for loadBuilds (60s). Local writes invalidate
// immediately; cross-instance staleness (prod upload / local read) is
// bounded by the TTL. Callers get a COPY — they sort in place.
const BUILDS_CACHE_TTL = 60 * 1000;
const _buildsCache = new Map();
function invalidateBuildsCache() { _buildsCache.clear(); }

/** Load all builds of an app/platform(+env): real-time dir enumeration,
 *  ONE meta.json GET per env (no cross-instance stale cache involved). */
async function loadBuilds(appId, platform, env) {
  const e = normEnv(env);
  const ck = `${appId}|${platform}|${e}`;
  const hit = _buildsCache.get(ck);
  if (hit && Date.now() - hit.ts < BUILDS_CACHE_TTL) return hit.data.slice();
  // Real-time enumeration — NEVER via envDirsCached: uploads going through OTHER
  // instances (e.g. prod while this local emulator serves reads) create env dirs
  // the in-memory cache cannot see for up to TTL. Correctness over cache here.
  let envDirs;
  if (platform && e) {
    envDirs = [`apps/${appId}/${platform}/${e}/`];
  } else if (platform) {
    envDirs = await listDirs(`apps/${appId}/${platform}/`);
  } else {
    const platformDirs = await listDirs(`apps/${appId}/`);
    envDirs = [];
    for (const pd of platformDirs) envDirs.push(...(await listDirs(pd)));
  }
  const metas = await readMetas(envDirs.map((ed) => ed + 'meta.json'));
  const all = [];
  metas.forEach((m) => { if (m && Array.isArray(m.builds)) all.push(...m.builds); });
  const builds = all.filter((b) => !env || b.env === undefined || normEnv(b.env) === e);
  _buildsCache.set(ck, { ts: Date.now(), data: builds.slice() });
  return builds;
}

// ---- helpers ----
const router = express.Router();
const badRequest = (res, message) => res.status(400).json({ error: message });
const serverError = (res, message) => res.status(500).json({ error: String(message || 'internal error') });

function newBuildKey() {
  return `b${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

function extensionOf(fileName) {
  const idx = String(fileName || '').lastIndexOf('.');
  return idx === -1 ? '' : String(fileName).slice(idx).toLowerCase();
}

function contentTypeFor(fileName, provided) {
  if (provided) return provided;
  return CONTENT_TYPES[extensionOf(fileName)] || 'application/octet-stream';
}

const isPublicMode = () => R2_PUBLIC_BASE_URL.length > 0;
const publicUrl = (key) => `${R2_PUBLIC_BASE_URL}/${key}`;

async function presignGet(key, expiresIn) {
  return getSignedUrl(getS3(), new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn });
}

async function objectUrl(key, expiresIn) {
  if (isPublicMode()) return { url: publicUrl(key), expiresIn: 0, public: true };
  return { url: await presignGet(key, expiresIn), expiresIn, public: false };
}

function escapeXml(value) {
  return String(value == null ? '' : value).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[c]));
}

function buildPlistXml({ ipaUrl, iconUrl, bundleId, bundleVersion, appName }) {
  const iconAssets = iconUrl
    ? `
        <dict>
          <key>kind</key><string>display-image</string>
          <key>needs-shake</key><true/>
          <key>url</key><string>${escapeXml(iconUrl)}</string>
        </dict>
        <dict>
          <key>kind</key><string>full-size-image</string>
          <key>needs-shake</key><true/>
          <key>url</key><string>${escapeXml(iconUrl)}</string>
        </dict>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>${escapeXml(ipaUrl)}</string>
        </dict>${iconAssets}
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${escapeXml(bundleId)}</string>
        <key>bundle-version</key><string>${escapeXml(bundleVersion)}</string>
        <key>kind</key><string>software</string>
        <key>subtitle</key><string>${escapeXml(appName)}</string>
        <key>title</key><string>${escapeXml(appName)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;
}

// Auth: dev OR x-api-key OR web-origin (any ONE passes).
const WEB_ORIGINS = ['https://pgyer-enhance.web.app'];
const isDev = process.env.NODE_ENV === 'development';

function isWebOrigin(req) {
  const origin = req.get('origin') || '';
  if (WEB_ORIGINS.includes(origin)) return true;
  const referer = req.get('referer') || req.get('Referer') || '';
  if (!referer) return false;
  try {
    return WEB_ORIGINS.includes(`https://${new URL(referer).hostname}`);
  } catch (error) { return false; }
}

function requireApiKey(req, res, next) {
  if (isDev) { next(); return; }
  if (!R2_API_TOKEN) {
    res.status(503).json({ error: 'R2_API_TOKEN is not configured on the server' });
    return;
  }
  const provided = req.get('x-api-key') || (req.body && req.body.apiKey) || req.query.apiKey;
  if (provided === R2_API_TOKEN || isWebOrigin(req)) { next(); return; }
  res.status(401).json({ error: 'invalid api key' });
}

// ---- endpoints ----

// POST /r2/upload-url — presigned PUT (30 min). appIcon:true -> apps/{appId}/icon.png
router.post('/upload-url', requireApiKey, async (req, res) => {
  try {
    const body = req.body || {};
    const appId = body.appId;
    const platform = body.platform;
    const version = body.version;
    const fileName = body.fileName;
    const isAppIcon = body.appIcon === true;

    if (!appId || !fileName) {
      badRequest(res, 'missing parameters: appId, fileName are required');
      return;
    }
    const ext = extensionOf(fileName);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      badRequest(res, `fileName extension not allowed, must be one of: ${ALLOWED_EXTENSIONS.join(' ')}`);
      return;
    }
    if (!isAppIcon) {
      if (!platform || !version) {
        badRequest(res, 'missing parameters: platform, version are required');
        return;
      }
      if (platform !== 'ios' && platform !== 'android') {
        badRequest(res, "platform must be 'ios' or 'android'");
        return;
      }
    }

    const buildKey = body.buildKey || newBuildKey();
    const key = isAppIcon
      ? `apps/${appId}/icon${ext}`
      : `apps/${appId}/${platform}/${envDir(body.env)}/${buildKey}/${fileName}`;
    const contentType = contentTypeFor(fileName, body.contentType);

    const uploadUrl = await getSignedUrl(
      getS3(),
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: UPLOAD_URL_EXPIRES },
    );

    res.json({
      buildKey, key, uploadUrl, expiresIn: UPLOAD_URL_EXPIRES,
      headers: { 'Content-Type': contentType },
      meta: {
        appId, platform, version, fileName, contentType,
        env: body.env || '', appName: body.appName || '',
        bundleId: body.bundleId || '', description: body.description || '',
        buildNumber: body.buildNumber || '',
      },
    });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// POST /r2/commit-build — HEAD check, then meta.json next to the file.
router.post('/commit-build', requireApiKey, async (req, res) => {
  const body = req.body || {};
  const { buildKey, appId, platform, version } = body;
  const env = body.env || '';
  // Notify on failure too — the uploader may be an unattended CI machine.
  const notifyFail = async (reason) => {
    try {
      const tag = appId || '?';
      const plat = platform || '?';
      const en = env || '?';
      const ver = version || '?';
      await notifyCliq('\u274C ' + tag + ' upload FAILED (' + plat + '/' + en + ' v' + ver + ')\n' + reason);
    } catch (e) { /* never block the error response */ }
  };
  try {
    if (!buildKey || !appId || !platform || !version) {
      const msg = 'missing parameters: buildKey, appId, platform, version are required';
      await notifyFail(msg);
      badRequest(res, msg);
      return;
    }

    const fileName = body.fileName || '';
    const key = body.key || `apps/${appId}/${platform}/${envDir(env)}/${buildKey}/${fileName}`;
    if (!fileName && !body.key) {
      const msg = 'fileName or key is required';
      await notifyFail(msg);
      badRequest(res, msg);
      return;
    }

    let fileSize = body.size || 0;
    try {
      const head = await getS3().send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      fileSize = head.ContentLength || fileSize;
    } catch (error) {
      const name = error?.name || '';
      if (name === 'NotFound' || name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
        const msg = `file not found in R2: ${key}. Upload the file before committing.`;
        await notifyFail(msg);
        badRequest(res, msg);
        return;
      }
      throw error;
    }

    const buildCreatedTimestamp = Date.now();
    const doc = {
      buildKey, appId, platform, env,
      appName: body.appName || appId,
      bundleIdentifier: body.bundleId || '',
      key,
      iconKey: body.iconKey || '',
      buildVersion: version,
      buildVersionNo: body.buildNumber || '',
      buildUpdateDescription: body.description || '',
      buildFileName: fileName || key.split('/').pop(),
      buildFileSize: fileSize,
      buildCreatedTimestamp,
      updatedAt: buildCreatedTimestamp,
    };

    await appendBuild(appId, platform, env, doc);
    invalidateDirCache();
    invalidateBuildsCache();

    // success notification (best-effort)
    const dl = `https://pgyer-enhance.web.app/app%2F${encodeURIComponent(appId)}%3Fenv%3D${encodeURIComponent(env)}%26platform%3D${platform}`;
    const buildNoSuffix = body.buildNumber ? ` (#${body.buildNumber})` : '';
    try {
      await notifyCliq([
        `\uD83D\uDCE6 ${appId} — new build uploaded`,
        `${platform}/${env}  v${version}${buildNoSuffix}`,
        `${doc.buildFileName} \u00B7 ${fmtMB(fileSize)}`,
        `Download: ${dl}`,
      ].join('\n'));
    } catch (e) { /* notification must not fail the commit */ }

    res.json({ data: doc });
  } catch (error) {
    await notifyFail(error?.message || 'unknown error');
    serverError(res, error?.message);
  }
});

// GET /r2/versions?appId&platform&env — builds from meta.json, time desc, iconUrl attached.
router.get('/versions', requireApiKey, async (req, res) => {
  try {
    const query = req.query || {};
    if (!query.appId) { badRequest(res, 'missing parameter: appId'); return; }
    const builds = await loadBuilds(query.appId, query.platform || '', query.env || '');
    builds.sort((a, b) => (b.buildCreatedTimestamp || 0) - (a.buildCreatedTimestamp || 0));
    const withIcons = await Promise.all(builds.map(async (v) => {
      const iconKey = v.iconKey || ('apps/' + v.appId + '/icon.png');
      const icon = await objectUrl(iconKey, DOWNLOAD_URL_EXPIRES);
      return { ...v, iconUrl: icon.url };
    }));
    res.json({ versions: withIcons });
  } catch (error) {
    serverError(res, error?.message);
  }
});

function compareVersionPartsDesc(aParts, bParts) {
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const numA = aParts[i] || 0;
    const numB = bParts[i] || 0;
    if (numA > numB) return -1;
    if (numA < numB) return 1;
  }
  return 0;
}

function compareBuildsDesc(a, b) {
  const va = String(a.buildVersion || '').split('.').map(Number);
  const vb = String(b.buildVersion || '').split('.').map(Number);
  const r = compareVersionPartsDesc(va, vb);
  if (r !== 0) return r;
  const na = String(a.buildVersionNo || '').split('.').map(Number);
  const nb = String(b.buildVersionNo || '').split('.').map(Number);
  return compareVersionPartsDesc(na, nb);
}

// GET /r2/next-version?appId&platform&env — latest version +1 for CI.
router.get('/next-version', requireApiKey, async (req, res) => {
  try {
    const query = req.query || {};
    if (!query.appId || !query.platform) {
      badRequest(res, 'missing parameters: appId, platform');
      return;
    }
    const builds = await loadBuilds(query.appId, query.platform, query.env || '');
    builds.sort(compareBuildsDesc);
    if (builds.length === 0) {
      res.json({ appId: query.appId, platform: query.platform, env: query.env || '',
        currentVersion: null, currentBuildNumber: null, nextVersion: '1.0.0' });
      return;
    }
    const latest = builds[0];
    const parts = String(latest.buildVersion || '1.0.0').split('.');
    const lastPart = parseInt(parts[parts.length - 1], 10);
    parts[parts.length - 1] = String((Number.isNaN(lastPart) ? 0 : lastPart) + 1);
    res.json({ appId: query.appId, platform: query.platform, env: query.env || '',
      currentVersion: latest.buildVersion || null,
      currentBuildNumber: latest.buildVersionNo || null,
      nextVersion: parts.join('.') });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// GET /r2/download-url?key=&expires= — presigned GET (public mode: permanent).
router.get('/download-url', requireApiKey, async (req, res) => {
  try {
    const key = req.query.key;
    if (!key) { badRequest(res, 'missing parameter: key'); return; }
    if (!READABLE_PREFIXES.some((p) => key.startsWith(p))) {
      badRequest(res, 'key must start with one of: ' + READABLE_PREFIXES.join(' '));
      return;
    }
    let expires = parseInt(req.query.expires, 10);
    if (!expires || expires <= 0) expires = DOWNLOAD_URL_EXPIRES;
    if (expires > MAX_DOWNLOAD_URL_EXPIRES) expires = MAX_DOWNLOAD_URL_EXPIRES;
    const result = await objectUrl(key, expires);
    res.json({ key, ...result });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// Cache the apps/platforms/ENV directory layout (5 min) so buildKey lookups
// and list queries do not re-list the whole bucket every time.
let _dirCache = { ts: 0, entries: [] };
const DIR_CACHE_TTL = 5 * 60 * 1000;

function invalidateDirCache() {
  _dirCache = { ts: 0, entries: [] };
}

async function envDirsCached() {
  if (_dirCache.entries.length && Date.now() - _dirCache.ts < DIR_CACHE_TTL) return _dirCache.entries;
  const appDirs = await listDirs('apps/');
  const entries = [];
  for (const appDir of appDirs) {
    const platforms = await listDirs(appDir);
    for (const pd of platforms) {
      const envs = await listDirs(pd);
      envs.forEach((ed) => entries.push(ed)); // apps/{appId}/{platform}/{env}/
    }
  }
  _dirCache = { ts: Date.now(), entries };
  return entries;
}
/** Find a build meta by buildKey. Uses the dir cache; on miss the cache is
 *  force-refreshed once (covers builds committed after the cache was built
  * by another instance) before concluding "not found". */
async function findMetaByKey(buildKey) {
  const probe = async (envDirs) => {
    const candidates = envDirs.map((ed) => ed + buildKey + '/' + META_FILE);
    const metas = await readMetas(candidates);
    const i = metas.findIndex(Boolean);
    if (i === -1) return null;
    return { meta: metas[i], mKey: candidates[i], dir: envDirs[i] + buildKey + '/' };
  };
  let found = await probe(await envDirsCached());
  if (!found) {
    invalidateDirCache();
    found = await probe(await envDirsCached());
  }
  return found;
}

// GET /r2/install-plist?buildKey=&app=&platform=&env= — iOS OTA: sign ipa, regen plist, itms link.
router.get('/install-plist', requireApiKey, async (req, res) => {
  try {
    const q = req.query || {};
    if (!q.buildKey) { badRequest(res, 'missing parameter: buildKey'); return; }
    const found = await findBuildByKey(q.buildKey, q.app, q.platform, q.env);
    if (!found) { badRequest(res, 'build not found: ' + q.buildKey); return; }
    const build = found.build;
    if (build.platform !== 'ios') {
      badRequest(res, 'install-plist is only for ios builds');
      return;
    }

    const ipa = await objectUrl(build.key, DOWNLOAD_URL_EXPIRES);
    const iconKey = build.iconKey || ('apps/' + build.appId + '/icon.png');
    const icon = await objectUrl(iconKey, DOWNLOAD_URL_EXPIRES);

    const plist = buildPlistXml({
      ipaUrl: ipa.url,
      iconUrl: icon.url,
      bundleId: build.bundleIdentifier,
      bundleVersion: build.buildVersion,
      appName: build.appName || build.appId,
    });

    const plistKey = 'plists/' + q.buildKey + '.plist';
    await getS3().send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: plistKey, Body: plist, ContentType: 'application/xml',
    }));

    const plistResult = await objectUrl(plistKey, PLIST_URL_EXPIRES);
    const itmsUrl = 'itms-services://?action=download-manifest&url=' + encodeURIComponent(plistResult.url);
    res.json({ buildKey: q.buildKey, ipaUrl: ipa.url, plistUrl: plistResult.url, itmsUrl, public: plistResult.public });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// POST /r2/update-build — mutate one build in the env meta (app/platform/env optional).
router.post('/update-build', requireApiKey, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.buildKey) { badRequest(res, 'missing parameter: buildKey'); return; }
    const found = await findBuildByKey(body.buildKey, body.app, body.platform, body.env);
    if (!found) { badRequest(res, 'build not found: ' + body.buildKey); return; }

    const updates = {};
    if (typeof body.description === 'string') updates.buildUpdateDescription = body.description;
    if (typeof body.appName === 'string' && body.appName) updates.appName = body.appName;
    if (typeof body.bundleId === 'string' && body.bundleId) updates.bundleIdentifier = body.bundleId;
    if (typeof body.env === 'string' && body.env) updates.env = body.env;
    if (typeof body.buildNumber === 'string' && body.buildNumber) updates.buildVersionNo = body.buildNumber;
    if (Object.keys(updates).length === 0) {
      badRequest(res, 'nothing to update: provide description/appName/bundleId/env/buildNumber');
      return;
    }
    const result = await modifyBuild(found.appId, found.platform, found.env, body.buildKey, (doc) => {
      Object.assign(doc, updates);
      doc.updatedAt = Date.now();
    });
    if (!result) { serverError(res, 'concurrent update conflict, please retry'); return; }
    invalidateBuildsCache();
    res.json({ data: { buildKey: body.buildKey, ...updates } });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// POST /r2/delete-builds — remove builds from env meta + delete physical objects.
router.post('/delete-builds', requireApiKey, async (req, res) => {
  try {
    const body = req.body || {};
    const buildKeys = body.buildKeys;
    if (!Array.isArray(buildKeys) || buildKeys.length === 0) {
      badRequest(res, 'missing parameter: buildKeys (array)');
      return;
    }
    const s3 = getS3();
    const results = await Promise.all(buildKeys.map(async (buildKey) => {
      const found = await findBuildByKey(buildKey, body.app, body.platform, body.env);
      if (!found) return { buildKey, deleted: false, reason: 'not found' };
      const b = found.build;
      // Derive the build dir from the canonical structure (NOT meta.key,
      // which can be stale after manual migrations). Also sweep the dir that
      // meta.key points to as a safety net.
      const dirPrefixes = [
        `apps/${found.appId}/${found.platform}/${found.env}/${buildKey}/`,
      ];
      if (b.key) {
        const kDir = b.key.slice(0, b.key.lastIndexOf('/') + 1);
        if (!dirPrefixes.includes(kDir)) dirPrefixes.push(kDir);
      }
      const keys = [];
  for (const dp of dirPrefixes) keys.push(...(await listKeys(dp)));
      keys.push('plists/' + buildKey + '.plist');
      await Promise.all(keys.map((k) =>
        s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: k })).catch(() => null)));
      const removed = await removeBuild(found.appId, found.platform, found.env, buildKey);
      invalidateBuildsCache();
      return { buildKey, deleted: removed.ok };
    }));
    res.json({ deleted: results.filter((r) => r.deleted).length, results });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// ---- pgyer+R2 merged list (progressive migration) ----
const PGYER_PREFIX = 'S1JeBfseDESE';
let _mergedDeviceData = null;

// Format in +08:00 so R2 and pgyer records display in the same timezone.
const formatDateTime = (ts) => {
  const d = new Date((ts || Date.now()) + 8 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate())
    + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
};

// pgyer fetch is slow (deviceConfig + paginated builds API) and flaky;
// cache results briefly and degrade to [] after a timeout so the merged
// list always responds fast.
const PGYER_CACHE_TTL = 60 * 1000;
const _pgyerCache = new Map();

async function fetchPgyerVersionsRaw(app, platform, env) {
  if (!_mergedDeviceData) {
    const rsp = await getDeviceConfig();
    const cfg = rsp?.data?.data || null;
    if (cfg) _mergedDeviceData = cfg; // cache ONLY on success
  }
  if (!_mergedDeviceData) return [];
  const projects = _mergedDeviceData?.projects || [];
  const appObj = projects.find((p) => p.name === app);
  const currentAppInfo = appObj?.['pgyer']?.[platform]?.[env];
  const apiKey = currentAppInfo?.apiKey || _mergedDeviceData?.defaultPgyerApiKey;
  const appKey = currentAppInfo?.appKey;
  if (!apiKey || !appKey) return [];
  const versions = await getAllVersions(apiKey, appKey, 1, env);
  return (versions || []).map((v) => ({ ...v, isR2: false }));
}

async function fetchPgyerVersions(app, platform, env) {
  const ck = `${app}|${platform}|${env}`;
  const hit = _pgyerCache.get(ck);
  if (hit && Date.now() - hit.ts < PGYER_CACHE_TTL) return hit.data;
  let data = null;
  try {
    data = await Promise.race([
      fetchPgyerVersionsRaw(app, platform, env).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
  } catch (error) {
    data = null;
  }
  if (data === null) return []; // failure: do NOT cache
  _pgyerCache.set(ck, { ts: Date.now(), data });
  return data;
}

async function fetchR2Versions(app, platform, env) {
  try {
    const builds = await loadBuilds(app, platform || '', env || '');
    return Promise.all(builds.map(async (v) => {
      const iconKey = v.iconKey || ('apps/' + v.appId + '/icon.png');
      const icon = await objectUrl(iconKey, DOWNLOAD_URL_EXPIRES);
      return {
        buildKey: v.buildKey,
        buildName: v.appName || v.appId,
        buildVersion: v.buildVersion,
        buildVersionNo: v.buildVersionNo || '',
        buildUpdateDescription: v.buildUpdateDescription || '',
        buildFileName: v.buildFileName || '',
        buildFileSize: v.buildFileSize || 0,
        buildCreated: formatDateTime(v.buildCreatedTimestamp),
        buildCreatedTimestamp: v.buildCreatedTimestamp || 0,
        buildIdentifier: v.bundleIdentifier || '',
        realIcon: icon.url,
        isSelected: false,
        isR2: true,
        key: v.key,
        platform: v.platform,
        env: v.env,
      };
    }));
  } catch (error) {
    return [];
  }
}

// GET /r2/merged-versions?app&env&platform — pgyer + R2 merged, legacy response shape.
router.get('/merged-versions', requireApiKey, async (req, res) => {
  try {
    const query = req.query || {};
    const app = query.app;
    if (!app) { badRequest(res, 'missing parameter: app'); return; }
    const env = query.env || '';
    const platform = query.platform || '';

    const [pgyerList, r2List] = await Promise.all([
      fetchPgyerVersions(app, platform, env),
      fetchR2Versions(app, platform, env),
    ]);

    const toTimestamp = (v) => {
      if (v.isR2) return v.buildCreatedTimestamp || 0;
      try {
        return new Date(String(v.buildCreated || '').replace(' ', 'T') + '+08:00').getTime() || 0;
      } catch (error) { return 0; }
    };
    // Newest first; on equal timestamps R2 builds win (deterministic order).
    const merged = [...r2List, ...pgyerList]
      .map((v) => ({ ...v, _ts: toTimestamp(v) }))
      .sort((a, b) => (b._ts - a._ts) || ((b.isR2 ? 1 : 0) - (a.isR2 ? 1 : 0)))
      .map(({ _ts, ...rest }) => rest);

    const payload = Buffer.from(encodeURIComponent(JSON.stringify(merged)), 'utf-8').toString('base64');
    res.json({ versions: PGYER_PREFIX + payload });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// GET /r2/apps — aggregated roster: appId, build counts, latest version.
// GET /r2/apps — aggregated roster from the env-level meta files.
router.get('/apps', requireApiKey, async (req, res) => {
  try {
    const envDirs = await envDirsCached();
    const metas = await readMetas(envDirs.map((ed) => ed + 'meta.json'));
    const byApp = new Map();
    envDirs.forEach((ed, i) => {
      const parts = ed.replace(/\/$/, '').split('/'); // [apps, appId, platform, env]
      if (parts.length < 4 || parts[1].startsWith('__')) return;
      const appId = parts[1];
      if (!byApp.has(appId)) byApp.set(appId, { appId, builds: 0, android: 0, ios: 0, envs: {}, latest: null });
      const a = byApp.get(appId);
      const m = metas[i];
      const builds = (m && m.builds) || [];
      a.builds += builds.length;
      if (parts[2] === 'android') a.android += builds.length;
      if (parts[2] === 'ios') a.ios += builds.length;
      if (parts[3] && parts[3] !== 'none') a.envs[parts[3]] = true;
      builds.forEach((b) => {
        const ts = b.buildCreatedTimestamp || 0;
        if (!a.latest || ts > a.latest.ts) a.latest = { ts, buildVersion: b.buildVersion || '', env: parts[3], iconKey: b.iconKey || '' };
      });
    });
    const apps = [];
    for (const a of byApp.values()) {
      const iconKey = (a.latest && a.latest.iconKey) || ('apps/' + a.appId + '/icon.png');
      const icon = await objectUrl(iconKey, DOWNLOAD_URL_EXPIRES);
      apps.push({
        appId: a.appId, builds: a.builds, android: a.android, ios: a.ios, iconUrl: icon.url,
        envs: Object.keys(a.envs), latestVersion: a.latest ? a.latest.buildVersion : '',
        latestAt: a.latest && a.latest.ts ? new Date(a.latest.ts).toISOString() : '',
      });
    }
    apps.sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));
    res.json({ count: apps.length, apps });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// POST /r2/admin-login { password } — console gate. Not behind requireApiKey
// (it IS the password check). In-memory rate limit: 5 fails per IP -> 60s lock.
const ADMIN_LOGIN_FAILS = new Map();
router.post('/admin-login', async (req, res) => {
  try {
    const expected = process.env.R2_ADMIN_PASSWORD || '';
    if (!expected) {
      res.status(503).json({ error: 'R2_ADMIN_PASSWORD is not configured on the server' });
      return;
    }
    // Prefer the framework-resolved client IP (set by the platform LB);
    // x-forwarded-for is client-spoofable.
    const ip = req.ip || (req.headers && (req.headers['x-forwarded-for'] || '').split(',').pop().trim()) || 'unknown';
    const now = Date.now();
    const st = ADMIN_LOGIN_FAILS.get(ip) || { count: 0, lockedUntil: 0 };
    if (st.lockedUntil > now) {
      res.status(429).json({ error: 'too many attempts, try again in ' + Math.ceil((st.lockedUntil - now) / 1000) + 's' });
      return;
    }
    const pwd = String((req.body || {}).password || '');
    if (pwd === expected) {
      ADMIN_LOGIN_FAILS.delete(ip);
      // Hand the management token to the console so ALL its calls go through
      // the strong x-api-key channel (web-origin stays for public pages only).
      res.json({ ok: true, token: R2_API_TOKEN });
      return;
    }
    st.count += 1;
    if (st.count >= 5) { st.count = 0; st.lockedUntil = now + 60 * 1000; }
    ADMIN_LOGIN_FAILS.set(ip, st);
    res.status(401).json({ error: 'wrong password' });
  } catch (error) {
    serverError(res, error?.message);
  }
});

// GET /r2/health
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    r2Configured: Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET),
    apiTokenConfigured: Boolean(R2_API_TOKEN),
    publicMode: isPublicMode(),
    bucket: R2_BUCKET || '(not set)',
  });
});

module.exports = router;
