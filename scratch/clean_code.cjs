const fs = require('fs');
const path = require('path');

function cleanFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Remove multi-line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments (but not URL protocols)
  content = content.replace(/([^:])\/\/.*/g, '$1');
  // Remove leading single-line comments
  content = content.replace(/^\/\/.*/gm, '');
  
  fs.writeFileSync(filePath, content, 'utf8');
}

const srcDir = path.join(__dirname, 'src');
const files = fs.readdirSync(srcDir);

files.forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
    cleanFile(path.join(srcDir, file));
  }
});
