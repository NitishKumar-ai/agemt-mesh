const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'dist', '.turbo', '.pnpm-store']);
const ALLOWED_EXTS = new Set(['.ts', '.js', '.json', '.md', '.yml', '.yaml', '.gradle', '.properties']);

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replacements
  content = content.replace(/@conductor\//g, '@agentmesh/');
  content = content.replace(/Conductor/g, 'AgentMesh');
  content = content.replace(/conductor/g, 'agentmesh');
  content = content.replace(/CONDUCTOR/g, 'AGENTMESH');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function processDirectory(dir) {
  let changedCount = 0;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (SKIP_DIRS.has(file)) continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      changedCount += processDirectory(fullPath);
    } else if (stat.isFile()) {
      const ext = path.extname(fullPath);
      if (ALLOWED_EXTS.has(ext) || file === 'Dockerfile') {
        if (replaceInFile(fullPath)) {
          changedCount++;
        }
      }
    }
  }
  return changedCount;
}

const changed = processDirectory(process.cwd());
console.log(`Updated ${changed} files.`);
