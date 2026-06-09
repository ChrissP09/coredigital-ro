'use strict';
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(
  process.execPath,
  ['--experimental-sqlite', path.join(__dirname, 'dist/server/entry.mjs')],
  { stdio: 'inherit', env: process.env }
);

child.on('error', err => { console.error('Server start failed:', err); process.exit(1); });
child.on('exit', code => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT',  () => child.kill('SIGINT'));
