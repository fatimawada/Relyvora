import fs from 'fs';
import path from 'path';

function searchDir(dir, patterns) {
  let matches = [];
  if (!fs.existsSync(dir)) return matches;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'cache') continue; // skip build cache
      matches = matches.concat(searchDir(fullPath, patterns));
    } else {
      if (fullPath.endsWith('.html') || fullPath.endsWith('.js') || fullPath.endsWith('.json')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pat of patterns) {
          if (content.includes(pat)) {
            matches.push({ file: fullPath, pattern: pat });
          }
        }
      }
    }
  }
  return matches;
}

const buildMatches = searchDir('.next', ['[TODO', 'OwnerTodo']);
console.log('=== BUILD OUTPUT SCAN FOR "[TODO" AND "OwnerTodo" ===');
if (buildMatches.length === 0) {
  console.log('RESULT: 0 matches found in .next build output.');
} else {
  console.log(`RESULT: Found ${buildMatches.length} occurrences:`);
  for (const m of buildMatches) {
    console.log(` - ${m.pattern} in ${m.file}`);
  }
}
