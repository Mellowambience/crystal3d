const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    if (txt.includes('window.commandCenter')) {
      console.log('FOUND IN:', filePath);
      const cleaned = txt.replace(/"window\.commandCenter"\s*:\s*(true|false|[0-9]+|"[^"]*")\s*,?/g, '');
      fs.writeFileSync(filePath, cleaned, 'utf8');
      console.log('CLEANED:', filePath);
    }
  } catch(e) {}
}

function searchAll(dir) {
  try {
    const list = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of list) {
      const full = path.join(dir, item.name);
      if (item.isDirectory() && !full.includes('node_modules')) {
        searchAll(full);
      } else if (item.isFile()) {
        checkFile(full);
      }
    }
  } catch(e) {}
}

searchAll('C:\\Users\\nator\\.gemini');
searchAll('C:\\Users\\nator\\AppData\\Roaming\\Code');
searchAll('C:\\Users\\nator\\AppData\\Roaming\\Antigravity');
searchAll('C:\\Users\\nator\\AppData\\Roaming\\antigravity-ide');

console.log('Done scanning all IDE configs.');
