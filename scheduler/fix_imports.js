const fs = require('fs');
const path = require('path');

function getFiles(dir) {
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

const modules = ['core', 'postgres-persistence', 'mysql-persistence', 'redis-persistence', 'sqlite-persistence', 'cassandra-persistence'];
let allSourceFiles = [];
modules.forEach(m => {
  allSourceFiles.push(...getFiles(path.join(m, 'src', 'main', 'typescript')));
  allSourceFiles.push(...getFiles(path.join(m, 'src', 'testFixtures', 'typescript')));
});

let testFiles = [];
modules.forEach(m => {
  testFiles.push(...getFiles(path.join(m, 'src', 'test', 'typescript')));
  testFiles.push(...getFiles(path.join(m, 'src', 'testFixtures', 'typescript')));
});

testFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;
  
  content = content.replace(/from\s+['"]([^'"]+)['"]/g, (match, importPath) => {
    if (!importPath.startsWith('.')) return match; // Not a relative import
    
    // Check if it's an import that targets our Java-migrated classes
    // The subagents might have used something like '../../main/typescript/io/orkes/...'
    const parts = importPath.split('/');
    const mainIdx = parts.indexOf('main');
    const fixturesIdx = parts.indexOf('testFixtures');
    const tsIdx = parts.indexOf('typescript');
    
    let targetPackagePath = null;
    if (mainIdx !== -1 && tsIdx === mainIdx + 1) {
      targetPackagePath = parts.slice(tsIdx + 1).join('/');
    } else if (fixturesIdx !== -1 && tsIdx === fixturesIdx + 1) {
      targetPackagePath = parts.slice(tsIdx + 1).join('/');
    } else {
      // It might be relative but missing the main/typescript part entirely!
      // Let's check if the basename matches any known file.
      const basename = parts[parts.length - 1];
      const matchingSources = allSourceFiles.filter(s => s.endsWith('/' + basename + '.ts'));
      if (matchingSources.length === 1) {
        let rel = path.relative(path.dirname(file), matchingSources[0]);
        if (!rel.startsWith('.')) rel = './' + rel;
        rel = rel.replace(/\.ts$/, '');
        return `from '${rel}'`;
      }
      return match;
    }
    
    if (targetPackagePath) {
      const matchingSources = allSourceFiles.filter(s => s.replace(/\\/g, '/').endsWith(targetPackagePath + '.ts'));
      if (matchingSources.length === 1) {
        let rel = path.relative(path.dirname(file), matchingSources[0]);
        if (!rel.startsWith('.')) rel = './' + rel;
        rel = rel.replace(/\.ts$/, '');
        return `from '${rel}'`;
      }
    }
    
    return match;
  });
  
  if (content !== fs.readFileSync(file, 'utf8')) {
    fs.writeFileSync(file, content);
  }
});

console.log('Fixed relative imports');
