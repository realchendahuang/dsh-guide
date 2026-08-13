#!/usr/bin/env node
// Astro 的 base 只改 URL 前缀,产物仍平铺在 dist/ 根;Workers Static Assets
// 按 URL 路径直读文件,所以整体移入 dist/dsh/,让 /dsh/* 的 URL 一一对应到文件。
// 做法与 playbook 系列子路径站一致。
import { cpSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const nested = resolve(dist, 'dsh');

mkdirSync(nested, { recursive: true });
for (const entry of readdirSync(dist)) {
  if (entry === 'dsh') continue;
  renameSync(resolve(dist, entry), resolve(nested, entry));
}

// not_found_handling: 404-page 从站点根找 404.html,给根目录留一份。
cpSync(resolve(nested, '404.html'), resolve(dist, '404.html'));
