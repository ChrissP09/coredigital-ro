import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import env from './env.js';

fs.mkdirSync(path.dirname(env.sqliteAbsolutePath), { recursive: true });

const db = new DatabaseSync(env.sqliteAbsolutePath);

function run(sql, params = []) {
  try {
    const result = db.prepare(sql).run(...params);
    return Promise.resolve({ id: result.lastInsertRowid, changes: result.changes });
  } catch (err) {
    return Promise.reject(err);
  }
}

function get(sql, params = []) {
  try {
    return Promise.resolve(db.prepare(sql).get(...params));
  } catch (err) {
    return Promise.reject(err);
  }
}

function all(sql, params = []) {
  try {
    return Promise.resolve(db.prepare(sql).all(...params));
  } catch (err) {
    return Promise.reject(err);
  }
}

function exec(sql) {
  try {
    db.exec(sql);
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err);
  }
}

export default { db, run, get, all, exec };
