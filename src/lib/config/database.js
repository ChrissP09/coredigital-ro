import fs from 'fs';
import path from 'path';
import sqlite3pkg from 'sqlite3';
import env from './env.js';

const sqlite3 = sqlite3pkg.verbose();

fs.mkdirSync(path.dirname(env.sqliteAbsolutePath), { recursive: true });

const db = new sqlite3.Database(env.sqliteAbsolutePath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) { reject(error); return; }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) { reject(error); return; }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) { reject(error); return; }
      resolve(rows);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (error) => {
      if (error) { reject(error); return; }
      resolve();
    });
  });
}

export default { db, run, get, all, exec };
