// Publishes the built bundle (out/index.js) to a PUBLIC GitHub repo instead of
// Cloudinary, then PATCHes the /builds metadata map with the raw URL. The runtime
// loader fetches whatever URL /builds holds, so it needs no change.
//
// Storage repo: github.com/shruthie1/builds  (public)
// Raw URL served: https://raw.githubusercontent.com/shruthie1/builds/<branch>/<file>
//   raw.githubusercontent.com always serves the latest push (no CDN staleness).
//
// Auth: BUILDS_REPO_TOKEN — a fine-grained PAT with contents:write on shruthie1/builds.
//
// Usage: node upload-build.js <branch> [keyPrefix]   (keyPrefix default 'cts')

const fs = require('fs');

const REPO_OWNER = process.env.BUILDS_REPO_OWNER || 'shruthie1';
const REPO_NAME = process.env.BUILDS_REPO_NAME || 'builds';
const REPO_BRANCH = process.env.BUILDS_REPO_BRANCH || 'main';

function logUploadError(error) {
  let message;
  if (error instanceof Error) {
    message = error.stack || error.message;
  } else if (error && typeof error === 'object') {
    message = error.message || JSON.stringify(error);
  } else {
    message = String(error);
  }
  console.error('[upload-build] Failed to upload build:', message);
  const missing = ['BUILDS_REPO_TOKEN'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[upload-build] Missing env vars: ${missing.join(', ')} — set them as GitHub Actions secrets.`);
  }
}

// Contents API requires the current file sha to overwrite an existing file.
async function getExistingSha(token, filePath) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(filePath)}?ref=${REPO_BRANCH}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cts-upload-build',
    },
  });
  if (resp.status === 404) return undefined;
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to read existing build file: ${resp.status} ${resp.statusText} ${text}`.trim());
  }
  const json = await resp.json();
  return json.sha;
}

async function overwriteFile(branch, keyPrefix) {
  const token = process.env.BUILDS_REPO_TOKEN;
  if (!token) {
    logUploadError(new Error('BUILDS_REPO_TOKEN is not set'));
    process.exitCode = 1;
    return;
  }

  const localFilePath = './out/index.js';
  const fileName = `${keyPrefix}-${branch}.js`;
  const buildKey = keyPrefix; // CMS stores the metadata under the bare prefix key ('cts')

  try {
    const content = fs.readFileSync(localFilePath).toString('base64');
    const sha = await getExistingSha(token, fileName);

    const putUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURIComponent(fileName)}`;
    const putResp = await fetch(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'cts-upload-build',
      },
      body: JSON.stringify({
        message: `build: ${fileName}`,
        content,
        branch: REPO_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    });

    if (!putResp.ok) {
      const text = await putResp.text().catch(() => '');
      throw new Error(`GitHub upload failed: ${putResp.status} ${putResp.statusText} ${text}`.trim());
    }

    const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/${fileName}`;

    const url = `https://ums.paidgirls.site/builds`;
    const bodyData = { [buildKey]: rawUrl };

    const resp = await fetch(url, {
      method: 'PATCH',
      body: JSON.stringify(bodyData),
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_KEY || 'santoor',
      },
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Build metadata update failed: ${resp.status} ${resp.statusText} ${text}`.trim());
    }

    console.log(`[upload-build] Uploaded ${fileName} -> ${rawUrl}`);
    console.log(`[upload-build] Updated build metadata for ${buildKey}`);
  } catch (error) {
    logUploadError(error);
    process.exitCode = 1;
  }
}

const branchName = process.argv[2];
const keyPrefix = process.argv[3] || 'cts';
overwriteFile(branchName, keyPrefix);
