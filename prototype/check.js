/* 语法检查：node prototype/check.js
 * 把每个 HTML 里的内联 <script> 抽出来交给 node --check，避免"一页白屏才发现拼错"。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var dir = __dirname;
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paotui-check-'));
var fail = 0, total = 0;

function check(name, code) {
  total += 1;
  var f = path.join(tmp, name.replace(/[^\w.-]/g, '_') + '.js');
  fs.writeFileSync(f, code, 'utf8');
  var r = cp.spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) {
    fail += 1;
    console.log('× ' + name);
    console.log('  ' + (r.stderr || '').split('\n').slice(0, 6).join('\n  '));
  } else {
    console.log('✓ ' + name);
  }
}

fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f) && f !== 'check.js'; }).forEach(function (f) {
  check(f, fs.readFileSync(path.join(dir, f), 'utf8'));
});

fs.readdirSync(dir).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
  var html = fs.readFileSync(path.join(dir, f), 'utf8');
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  var m, i = 0;
  while ((m = re.exec(html))) {
    i += 1;
    check(f + '#inline' + i, m[1]);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + (total - fail) + '/' + total + ' 段脚本语法通过');
process.exit(fail === 0 ? 0 : 1);
