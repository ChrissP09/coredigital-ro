'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logFile = path.join(__dirname, 'server-debug.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(logFile, line); } catch (_) {}
}

log('=== server.cjs started ===');
log('Node.js version: ' + process.version);
log('__dirname: ' + __dirname);
log('process.cwd(): ' + process.cwd());
log('PORT: ' + process.env.PORT);
log('HOST: ' + process.env.HOST);
log('NODE_OPTIONS: ' + process.env.NODE_OPTIONS);
log('SQLITE_DB_PATH: ' + process.env.SQLITE_DB_PATH);

const entryFromRoot = path.join(__dirname, 'dist/server/entry.mjs');
const entryFromDist = path.join(__dirname, 'server/entry.mjs');
const hasFromRoot = fs.existsSync(entryFromRoot);
const hasFromDist = fs.existsSync(entryFromDist);
log('entry (root path) ' + entryFromRoot + ' exists=' + hasFromRoot);
log('entry (dist path) ' + entryFromDist + ' exists=' + hasFromDist);

const entryFile = hasFromRoot ? entryFromRoot : hasFromDist ? entryFromDist : null;
if (!entryFile) {
  log('ERROR: entry.mjs not found!');
  process.exit(1);
}
log('Spawning: node --experimental-sqlite ' + entryFile);

const child = spawn(process.execPath, ['--experimental-sqlite', entryFile], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', err => { log('Spawn error: ' + err.message); process.exit(1); });
child.on('exit', (code, signal) => { log('Child exited code=' + code + ' signal=' + signal); process.exit(code ?? 0); });
process.on('SIGTERM', () => { log('SIGTERM'); child.kill('SIGTERM'); });
process.on('SIGINT',  () => { log('SIGINT');  child.kill('SIGINT');  });
log('Child spawned, listening for events...');
