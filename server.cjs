'use strict';
const { spawn } = require('child_process');
const path = require('path');

// works whether this file sits at repo root (dist/server/) or inside dist/ (server/)
const fs = require('fs');
const entryFromRoot = path.join(__dirname, 'dist/server/entry.mjs');
const entryFromDist = path.join(__dirname, 'server/entry.mjs');
const entryFile = fs.existsSync(entryFromRoot) ? entryFromRoot : entryFromDist;

const child = spawn(
  process.execPath,
  ['--experimental-sqlite', entryFile],
  { stdio: 'inherit', env: process.env }
);

child.on('error', err => { console.error('Server start failed:', err); process.exit(1); });
child.on('exit', code => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT',  () => child.kill('SIGINT'));
