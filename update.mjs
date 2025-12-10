/**
 * @file update.mjs
 * @author Tamwood Technology @tamwoodtech
 * @org Radiants @RadiantsDAO
 * @description A standalone, zero-dependency auto-updater script.
 * It checks the GitHub repository for version changes, downloads the latest files,
 * installs dependencies, and restarts the main application.
 * @project lodestar-cli
 * @license MIT
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

// --- Path Setup ---
// Native Node.js ESM workaround to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const REPO_OWNER = 'Radiants-DAO';
const REPO_NAME = 'lodestar-cli';
const GITHUB_API_BASE = 'https://api.github.com';
const RAW_CONTENT_BASE = 'https://raw.githubusercontent.com';
const LOCAL_PACKAGE_PATH = path.join(__dirname, 'package.json');

// Files/Folders to strictly ignore during the overwrite process
// This prevents the updater from deleting itself or overwriting local config/git files.
const IGNORE_LIST = ['.git', 'node_modules', '.env', 'update.js', 'update.mjs'];

// --- Helper Functions ---

/**
 * Wraps https.get in a Promise to fetch and parse JSON.
 * Includes necessary User-Agent headers for GitHub API compliance.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<object|null>} Parsed JSON or null if 404.
 */
const fetchJson = (url) => {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'node.js-updater' }
    };
    https.get(url, options, (res) => {
      let data = '';

      // Handle non-200 responses
      if (res.statusCode !== 200) {
        if (res.statusCode === 404) return resolve(null);
        return reject(new Error(`Request failed: ${res.statusCode} ${url}`));
      }

      // Collect data chunks
      res.on('data', (chunk) => data += chunk);

      // Parse on end
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
};

/**
 * Downloads a file from a URL and writes it to the local filesystem.
 * @param {string} url - Source URL.
 * @param {string} destPath - Local destination path.
 */
const downloadFile = (url, destPath) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Validate response
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
      }

      // Pipe data to file
      const file = fs.createWriteStream(destPath);
      res.pipe(file);

      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      // Cleanup partially downloaded file on error
      fs.unlink(destPath, () => reject(err));
    });
  });
};

/**
 * Compares two semantic version strings (e.g., "1.0.0" vs "1.0.1").
 * @returns {boolean} True if remote is newer than local.
 */
const compareVersions = (local, remote) => {
  const v1 = local.split('.').map(Number);
  const v2 = remote.split('.').map(Number);

  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;
    if (num2 > num1) return true; // Remote is strictly greater
    if (num2 < num1) return false; // Remote is strictly smaller
  }
  return false; // Versions are equal
};

// --- Main Logic ---

/**
 * Main entry point: Checks GitHub for a newer version.
 */
async function checkForUpdate() {
  console.log('Checking for updates...');

  // 1. Get Repository Info to dynamically find the default branch (main/master)
  const repoInfo = await fetchJson(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}`);
  if (!repoInfo) throw new Error('Repository not found or private.');
  const defaultBranch = repoInfo.default_branch;

  // 2. Fetch Remote package.json to check version
  // Attempt raw fetch first for speed
  const remotePackageUrl = `${RAW_CONTENT_BASE}/${REPO_OWNER}/${REPO_NAME}/${defaultBranch}/package.json`;
  const remotePackage = await fetchJson(remotePackageUrl);

  // Fallback: If raw fetch fails, try the GitHub API content endpoint
  if (!remotePackage) {
    const apiPkg = await fetchJson(`${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/package.json?ref=${defaultBranch}`);
    if (apiPkg && apiPkg.content) {
      const buff = Buffer.from(apiPkg.content, 'base64');
      Object.assign(remotePackage, JSON.parse(buff.toString('utf-8')));
    }
  }

  // 3. Read Local package.json
  const localPackage = JSON.parse(fs.readFileSync(LOCAL_PACKAGE_PATH, 'utf-8'));

  console.log(`Local version: ${localPackage.version}`);
  console.log(`Remote version: ${remotePackage.version}`);

  // 4. Compare and Act
  if (compareVersions(localPackage.version, remotePackage.version)) {
    console.log('New version found! Starting update process. . .');
    await performUpdate(defaultBranch);
  } else {
    console.log('App is up to date.');
    restartApp();
  }
}

/**
 * Performs the actual update by fetching the file tree and overwriting local files.
 * @param {string} branch - The branch to pull from (e.g., 'main').
 */
async function performUpdate(branch) {
  // 1. Fetch the recursive git tree (lists every file in the repo)
  const treeUrl = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${branch}?recursive=1`;
  const treeData = await fetchJson(treeUrl);

  if (!treeData || !treeData.tree) {
    throw new Error('Failed to fetch file tree.');
  }

  console.log(`Found ${treeData.tree.length} files to process.`);

  // 2. Iterate through all files in the repository
  for (const item of treeData.tree) {
    // Skip ignored files/folders (config, git internals, etc.)
    if (IGNORE_LIST.some(ignored => item.path.startsWith(ignored))) {
      continue;
    }

    const localPath = path.join(__dirname, item.path);

    if (item.type === 'tree') {
      // It's a directory: ensure it exists locally
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }
    } else if (item.type === 'blob') {
      // It's a file: download and overwrite
      const downloadUrl = `${RAW_CONTENT_BASE}/${REPO_OWNER}/${REPO_NAME}/${branch}/${item.path}`;
      console.log(`Downloading: ${item.path}`);

      // Ensure parent directory exists before writing file
      const parentDir = path.dirname(localPath);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      await downloadFile(downloadUrl, localPath);
    }
  }

  console.log('Update files downloaded successfully.');

  // 3. Update Dependencies
  // We run npm install just in case package.json dependencies changed
  console.log('Updating dependencies...');
  execSync('npm install', { stdio: 'inherit' });

  // 4. Launch the updated app
  restartApp();
}

/**
 * Spawns the main application process and exits the updater.
 */
function restartApp() {
  console.log('Starting application. . .');

  // Spawn the main process using 'npm run miner'
  // shell: true ensures compatibility across Windows and Unix
  const subprocess = spawn('npm run miner', {
    stdio: 'inherit', // Pass stdin/stdout/stderr to the child process (TUI needs this)
    shell: true,
  });

  // When the app closes, we exit the updater process with the same code
  subprocess.on('close', (code) => {
    process.exit(code);
  });
}

// --- Execution ---
checkForUpdate().catch(err => {
  console.error('Update failed:', err.message);
  process.exit(1);
});
