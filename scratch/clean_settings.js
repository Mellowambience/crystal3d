const fs = require('fs');
const path = require('path');

const possiblePaths = [
  path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json'),
  path.join(process.env.APPDATA || '', 'Code - Insiders', 'User', 'settings.json'),
  path.join(process.env.APPDATA || '', 'Antigravity', 'User', 'settings.json'),
  path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity-ide', 'settings.json'),
  path.join(process.env.USERPROFILE || '', '.gemini', 'antigravity-ide', 'User', 'settings.json')
];

possiblePaths.forEach((filePath) => {
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('window.commandCenter')) {
        console.log('Found window.commandCenter in:', filePath);
        const updated = content.replace(/"window\.commandCenter"\s*:\s*(true|false|[0-9]+|"[^"]*")\s*,?/g, '');
        fs.writeFileSync(filePath, updated, 'utf8');
        console.log('Cleaned window.commandCenter from:', filePath);
      } else {
        console.log('Checked:', filePath, '(Clean)');
      }
    } catch (err) {
      console.error('Error reading/writing:', filePath, err.message);
    }
  }
});
