const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  if (dir.includes('node_modules') || dir.includes('dist')) return [];
  if (!fs.existsSync(dir)) return [];
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(getFiles(file));
    } else { 
      if (file.endsWith('.ts')) results.push(file);
    }
  });
  return results;
}

const allTsFiles = getFiles('.');

allTsFiles.forEach(file => {
  if (file === 'fix_aliases.js') return;
  let content = fs.readFileSync(file, 'utf8');
  
  content = content.replace(/from\s+['"](@(netflix|orkes|conductor)[^'"]+)['"]/g, (match, importPath) => {
    const parts = importPath.split('/');
    const basename = parts[parts.length - 1];
    
    // search for basename in allTsFiles
    const matches = allTsFiles.filter(f => f.endsWith(`/${basename}.ts`));
    
    if (matches.length > 0) {
      // rewrite to relative path
      let rel = path.relative(path.dirname(file), matches[0]);
      if (!rel.startsWith('.')) rel = './' + rel;
      rel = rel.replace(/\.ts$/, '');
      return `from '${rel}'`;
    } else {
      // rewrite to mock
      let rel = path.relative(path.dirname(file), 'mock.ts');
      if (!rel.startsWith('.')) rel = './' + rel;
      rel = rel.replace(/\.ts$/, '');
      return `from '${rel}'`;
    }
  });
  
  if (content !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, content);
  }
});
