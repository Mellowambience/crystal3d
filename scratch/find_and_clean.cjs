const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (!full.includes('node_modules') && !full.includes('Cache') && !full.includes('logs')) {
          searchDir(full);
        }
      } else if (f.isFile() && f.name.endsWith('.json')) {
        try {
          const txt = fs.readFileSync(full, 'utf8');
          if (txt.includes('window.commandCenter')) {
            console.log('FOUND IN:', full);
            const cleaned = txt.replace(/"window\.commandCenter"\s*:\s*(true|false|[0-9]+|"[^"]*")\s*,?/g, '');
            fs.writeFileSync(full, cleaned, 'utf8');
            console.log('CLEANED:', full);
          }
        } catch(e) {}
      }
    }
  } catch(e) {}
}

const appData = process.env.APPDATA || '';
const userProfile = process.env.USERPROFILE || '';

if (appData) {
  searchDir(path.join(appData, 'Code'));
  searchDir(path.join(appData, 'Antigravity'));
}
if (userProfile) {
  searchDir(path.join(userProfile, '.gemini'));
  searchDir(path.join(userProfile, '.vscode'));
}

console.log('Search & clean complete.');
