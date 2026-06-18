const fs = require('fs');
const path = require('path');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', 'dist', '.turbo', '.pnpm-store']);
const BINARY_EXTS = new Set(['.jar', '.class', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.zip', '.tar', '.gz']);

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  content = content.replace(/agentmesh/g, 'agentmesh');
  content = content.replace(/AgentMesh/g, 'AgentMesh');
  content = content.replace(/AGENTMESH/g, 'AGENTMESH');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  }
  return false;
}

function moveDirContents(src, dest) {
  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    if (fs.existsSync(destPath)) {
      if (fs.statSync(srcPath).isDirectory()) {
        moveDirContents(srcPath, destPath);
        fs.rmdirSync(srcPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      }
    } else {
      fs.renameSync(srcPath, destPath);
    }
  }
}

function processDirectory(dir) {
  let changedCount = 0;
  let items = fs.readdirSync(dir);
  
  for (const item of items) {
    if (SKIP_DIRS.has(item)) continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      changedCount += processDirectory(fullPath);
    } else if (stat.isFile()) {
      const ext = path.extname(fullPath);
      if (!BINARY_EXTS.has(ext)) {
        if (replaceInFile(fullPath)) {
          changedCount++;
        }
      }
    }
  }

  const basename = path.basename(dir);
  let newName = basename;
  if (basename === 'agentmesh') newName = 'agentmesh';
  else if (basename === 'conductor') newName = 'agentmesh';

  if (newName !== basename) {
    const newPath = path.join(path.dirname(dir), newName);
    if (fs.existsSync(newPath)) {
      moveDirContents(dir, newPath);
      fs.rmdirSync(dir);
    } else {
      fs.renameSync(dir, newPath);
    }
  }
  
  return changedCount;
}

const changed = processDirectory(process.cwd());
console.log(`Updated ${changed} files.`);
