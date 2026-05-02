const path = require('path');
const { spawn } = require('child_process');

const cliPath = path.join(__dirname, 'node_modules', '@expo', 'cli', 'build', 'bin', 'cli');
const child = spawn(process.execPath, [cliPath, 'start', '--lan'], {
  stdio: 'inherit',
  cwd: __dirname,
  env: process.env,
});

child.on('close', (code) => process.exit(code));
