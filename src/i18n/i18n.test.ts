import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import messages from './messages.json';

const locales = ['zh', 'en', 'ja', 'ko'] as const;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test('四语词条完整且插值参数一致', () => {
  const keys = Object.keys(messages.zh).sort();
  for (const locale of locales) {
    const dictionary: Record<string, string> = messages[locale];
    assert.deepEqual(Object.keys(dictionary).sort(), keys, locale);
    for (const key of keys) {
      assert.ok(dictionary[key].trim(), `${locale}: ${key}`);
      assert.deepEqual(placeholders(dictionary[key]), placeholders(messages.zh[key as keyof typeof messages.zh]), `${locale}: ${key}`);
    }
  }
});

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? files(join(directory, item.name)) : [join(directory, item.name)]);
}

test('前端、Rust 与 Swift 使用的词条均存在；动态选项覆盖四语', () => {
  const keys = new Set<string>();
  for (const file of [...files('src'), ...files('src-tauri/src'), ...files('src-tauri/native')]) {
    if (!/\.(ts|vue|rs|swift)$/.test(file) || file.endsWith('.test.ts')) continue;
    const source = readFileSync(file, 'utf8');
    const patterns = file.endsWith('.rs')
      ? [/(?:\btr|locale::format)\("([\w.]+)"/g]
      : file.endsWith('.swift') ? [/"(error\.[\w.]+)/g]
        : [/\bt\(\s*['"]([\w.]+)['"]/g, /'((?:music|welcome|diag|note|time)\.[\w.]+)'/g];
    for (const pattern of patterns) for (const match of source.matchAll(pattern)) keys.add(match[1]);
  }
  for (const [prefix, suffixes] of Object.entries({
    'stage': ['origin', 'awaken', 'conscious', 'emerge'],
    'theme': ['gold', 'terracotta', 'sage', 'mist', 'mauve', 'auto', 'light', 'dark'],
    'tier': ['low', 'medium', 'high', 'ultra'],
    'music': ['off', 'file', 'paused', 'starting', 'system'],
    'diag.mood': ['calm', 'curious', 'alert', 'scared', 'sleepy'],
  })) for (const suffix of suffixes) keys.add(`${prefix}.${suffix}`);
  for (const key of keys) for (const locale of locales) {
    assert.ok(Object.hasOwn(messages[locale], key), `${locale}: ${key}`);
  }
});

test('JSON 中无重复词条覆盖翻译', () => {
  const source = ts.createSourceFile('messages.json', `(${readFileSync('src/i18n/messages.json', 'utf8')})`, ts.ScriptTarget.Latest);
  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map((property) => property.name?.getText(source));
      assert.equal(new Set(names).size, names.length);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
});

test('切换四语保留占位符格式与阶段名称，本地记忆有效', async () => {
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  } });
  const { setLocaleMode, stageDisplayName, t } = await import('./index');
  for (const locale of locales) {
    setLocaleMode(locale);
    assert.equal(saved.get('emerge.ui.locale'), locale);
    assert.equal(t('native.playing', { name: 'Test.mp3' }), messages[locale]['native.playing'].replace('{name}', 'Test.mp3'));
    assert.equal(stageDisplayName('origin'), locale === 'en' ? 'Origin' : messages[locale]['stage.origin']);
  }
});
