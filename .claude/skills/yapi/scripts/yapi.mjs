#!/usr/bin/env node
// api.md（人读的接口契约 + 用例）→ YApi。HTTP 由 yapi CLI（npm 包 @leeguoo/yapi-mcp）代发，它带着人的登录态，
// 所以接口定义和测试用例都能推；本脚本不碰 token、不碰 cookie、不存任何凭据。
//
//   node .claude/skills/yapi/scripts/yapi.mjs init                                   把 openspec-schema 复制到 OpenSpec 用户级目录；检查 yapi CLI 装没装、登没登录
//   node .claude/skills/yapi/scripts/yapi.mjs push <变更名> [--project <id>] [--dry-run]     解析 → 校验 → 推接口定义（undone）→ 推测试集合和用例
//   node .claude/skills/yapi/scripts/yapi.mjs archive <变更名> [--project <id>] [--dry-run]  合进 openspec/specs/<模块>/api.md，YApi 接口状态改 done
//                                                                     （归档前后都行：会去 openspec/changes/archive/*-<变更名>/ 找）
//
// --project 不给时从本 skill 的 references/project.md 里「YApi 项目 id」那行读。
// 规则见 .claude/skills/yapi/SKILL.md。人不读这个脚本，靠结果验：报错都是人话并带 文件:行号。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

class UserError extends Error {}
const fail = msg => { throw new UserError(msg); };

// ---------------- 0. 常量 ----------------
const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUCCESS_CODE = '200';   // 业务成功码；用例表里期望 code 等于它的算正例
const CLI_HELP = '没找到 yapi 命令。请让用户在终端跑：\n  npm i -g @leeguoo/yapi-mcp\n  yapi config init --base-url=<YApi 地址> --auth-mode=global --email=<公司邮箱>\n  yapi login --base-url=<YApi 地址> --email=<公司邮箱> --password=<密码>\n然后重跑本命令。YApi 地址见 references/project.md。';
const LOGIN_HELP = 'YApi 登录态失效（cookie 7 天过期）。请让用户在终端重新登录：\n  yapi login --base-url=<YApi 地址> --email=<公司邮箱> --password=<密码>\n然后重跑本命令。脚本不存密码。';
const PROJECT_HELP = '不知道推到 YApi 哪个项目。请问用户：「这次推到 YApi 哪个项目？打开项目页，网址 /project/<数字>/ 里的数字发我」，然后加 --project <数字> 重跑；或把它写进 .claude/skills/yapi/references/project.md 的「YApi 项目 id」那行。';
const TYPES = new Set(['string', 'integer', 'number', 'boolean', 'object', 'array']);
const INTERFACE_RE = /^## ([A-Z]+)\s+(\/\S*)\s*(.*)$/;   // 解析和归档合并共用同一个正则
const MODULE_RE = /^[a-z][a-z0-9-]*$/;
const PATH_RE = /^\/[A-Za-z0-9\-_\/:.!]*$/;
const TABLES = {   // 表名 → 必须逐字相同的表头
  '请求头': ['参数', '必填', '示例', '说明'],
  '请求参数': ['参数', '类型', '必填', '示例', '说明'],
  '返回字段': ['字段', '类型', '必有', '说明'],
  '业务错误码': ['code', '场景', 'data'],
  '用例': ['用例', '参数', '期望 code', '期望'],
};

// ---------------- 1. 解析 api.md ----------------
const clean = s => s.replace(/<!--.*?-->/g, '').replace(/^`+|`+$/g, '').trim();

function splitCells(line) {   // 支持 \| 转义；首尾的 | 去掉
  const cells = []; let cur = '', esc = false;
  for (const ch of line.trim()) {
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '|') { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  if (cells[0].trim() === '') cells.shift();
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map(c => c.trim());
}

function parseTable(name, lines, file) {
  const where = `${file}:${lines[0].no} 「${name}」表`;
  const expect = TABLES[name];
  if (lines.length < 2) fail(`${where}：至少要有表头和分隔行`);
  const head = splitCells(lines[0].text);
  if (head.join('|') !== expect.join('|')) fail(`${where}：表头必须逐字是「| ${expect.join(' | ')} |」，实际是「| ${head.join(' | ')} |」`);
  if (!/^\|?\s*:?-+/.test(lines[1].text)) fail(`${file}:${lines[1].no}：表头下一行必须是分隔行 |---|---|`);
  return lines.slice(2).map(l => {
    const cells = splitCells(l.text);
    if (cells.length !== expect.length) fail(`${file}:${l.no}：这一行有 ${cells.length} 列，表头是 ${expect.length} 列（单元格里的 | 要写成 \\|）`);
    const row = Object.fromEntries(expect.map((h, i) => [h, clean(cells[i])]));
    row.__line = l.no;
    return row;
  });
}

export function parseApiMd(text, file = 'api.md') {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((t, i) => ({ text: t, no: i + 1 }));
  const apis = [];
  let cur = null, table = null, buf = [];
  const flush = () => { if (cur && table && buf.length) { if (cur.tables[table]) fail(`${file}:${buf[0].no}：「${table}」表在同一个接口里出现了两次`); cur.tables[table] = parseTable(table, buf, file); } buf = []; };
  for (const l of lines) {
    const t = l.text;
    if (t.startsWith('## ')) {
      const m = t.match(INTERFACE_RE);
      if (!m) fail(`${file}:${l.no}：「## 」开头的行只能是接口标题，格式 "## GET /path 标题"，实际是「${t}」`);
      flush(); table = null;
      if (!PATH_RE.test(m[2])) fail(`${file}:${l.no}：path「${m[2]}」只能是 / 开头、由字母数字 -_/:.! 组成，不带域名、不带 ?query`);
      cur = { method: m[1], path: m[2], title: clean(m[3]) || m[2], module: null, login: '', sign: '', tables: {}, file, line: l.no };
      apis.push(cur); continue;
    }
    if (!cur) continue;
    if (/^(\*\*)?模块(\*\*)?[:：]/.test(t)) {
      const mm = t.match(/模块(?:\*\*)?[:：]\s*([^\s　]+)/);
      const mod = mm ? clean(mm[1]) : '';
      if (!MODULE_RE.test(mod)) fail(`${file}:${l.no}：模块名「${mod}」必须是英文小写和连字符，如 snapshot-report，且要和 openspec/specs/ 下的能力目录同名`);
      cur.module = mod;
      cur.login = (t.match(/登录[:：]\s*([^\s　]+)/) || [])[1] || '';
      cur.sign = (t.match(/签名[:：]\s*([^\s　]+)/) || [])[1] || '';
      continue;
    }
    if (t.startsWith('### ')) { flush(); table = clean(t.slice(4)); if (!TABLES[table]) fail(`${file}:${l.no}：不认识的表名「${table}」，只能是 ${Object.keys(TABLES).join(' / ')}`); continue; }
    if (t.trim().startsWith('|')) { if (!table) fail(`${file}:${l.no}：表格前面要有 ### 表名`); buf.push(l); continue; }
    if (buf.length) flush();
  }
  flush();
  if (!apis.length) fail(`${file}：没有找到任何接口段（标题行要写成 "## GET /path 标题"）`);
  for (const a of apis) if (!a.module) fail(`${file}:${a.line} ${a.path}：缺少「模块：xxx」这一行`);
  return apis;
}

// ---------------- 2. 校验 ----------------
const yesNo = (v, where) => { if (!['是', '否'].includes(v)) fail(`${where} 只能填 是/否，实际是「${v}」`); return v === '是'; };
const splitType = s => ({ t: s.replace(/\?$/, ''), nullable: s.endsWith('?') });

function check(api) {
  const file = api.file;
  const at = r => `${file}:${r.__line} ${api.path}`;
  for (const r of api.tables['请求头'] || []) yesNo(r['必填'], `${at(r)} 请求头 ${r['参数']} 必填列`);
  for (const r of api.tables['请求参数'] || []) {
    if (!TYPES.has(r['类型'])) fail(`${at(r)} 参数 ${r['参数']} 类型「${r['类型']}」非法，只能是 ${[...TYPES].join('/')}`);
    if (yesNo(r['必填'], `${at(r)} 参数 ${r['参数']} 必填列`) && !r['示例']) fail(`${at(r)} 参数 ${r['参数']} 必填但没有示例值（示例必须是 test 环境真实存在的值）`);
  }
  const res = api.tables['返回字段'] || [];
  if (!res.length) fail(`${file}:${api.line} ${api.path} 没有「返回字段」表`);
  const names = res.map(r => r['字段']);
  if (!names.includes('code')) fail(`${file}:${api.line} ${api.path} 返回字段表要有 code`);
  if (!names.some(n => n === 'data' || n.startsWith('data.'))) fail(`${file}:${api.line} ${api.path} 返回字段表要有 data`);
  for (const r of res) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(r['字段'])) fail(`${at(r)} 字段名「${r['字段']}」只能是点路径，如 data.list.id`);
    if (!TYPES.has(splitType(r['类型']).t)) fail(`${at(r)} 字段 ${r['字段']} 类型「${r['类型']}」非法，只能是 ${[...TYPES].join('/')}，可空加 ?`);
    yesNo(r['必有'], `${at(r)} 字段 ${r['字段']} 必有列`);
  }
  if (!res.some(r => r['必有'] === '是' && r['字段'].startsWith('data'))) fail(`${file}:${api.line} ${api.path} data 下没有任何「必有 = 是」的字段，校验形同虚设`);
  for (const r of api.tables['业务错误码'] || []) if (!r['code']) fail(`${at(r)} 错误码表 code 列为空`);
  const cases = api.tables['用例'] || [];
  if (!cases.some(r => r['期望 code'] === SUCCESS_CODE)) fail(`${file}:${api.line} ${api.path} 用例表至少要有 1 条期望 code 为 ${SUCCESS_CODE} 的正例`);
  for (const r of api.tables['业务错误码'] || []) if (!cases.some(c => c['期望 code'] === r['code'])) fail(`${file}:${api.line} ${api.path} 错误码 ${r['code']} 在用例表里没有对应的反例`);
  for (const r of cases) { if (!r['用例']) fail(`${at(r)} 用例名为空`); if (!r['期望 code']) fail(`${at(r)} 用例「${r['用例']}」期望 code 为空`); parseCaseParams(r, api); }
  const caseNames = cases.map(r => r['用例']);
  for (const n of caseNames) if (caseNames.filter(x => x === n).length > 1) fail(`${file}:${api.line} ${api.path} 用例名「${n}」重复，YApi 里按用例名更新`);
}

// 用例表「参数」列：k=v 用逗号分隔；「Cookie xxx」当请求头；「连打 N 次」展开成 N 条（前 N-1 条期望成功码，最后一条期望本行的 code）
function parseCaseParams(row, api) {
  const out = { query: [], headers: [], repeat: 1 };
  let raw = row['参数'].trim();
  const rep = raw.match(/连打\s*(\d+)\s*次/);
  if (rep) { out.repeat = +rep[1]; raw = raw.replace(rep[0], '').trim(); if (out.repeat < 2) fail(`${api.file}:${row.__line} 用例「${row['用例']}」连打次数要 ≥ 2`); }
  for (const tok of raw.split(/[,，]/)) {
    const t = tok.trim(); if (!t) continue;
    let m;
    if ((m = t.match(/^(?:固定\s*)?Cookie\s+(.+)$/i))) { out.headers.push({ name: 'Cookie', value: m[1].trim() }); continue; }
    if ((m = t.match(/^([A-Za-z_][\w.\-\[\]]*)\s*=\s*(.*)$/))) { out.query.push({ name: m[1], value: m[2].trim() }); continue; }
    fail(`${api.file}:${row.__line} 用例「${row['用例']}」参数列不认识「${t}」：只能写 k=v（逗号分隔）、Cookie xxx、连打 N 次`);
  }
  return out;
}

// ---------------- 3. 返回字段表 → JSON Schema ----------------
// 先按行建树（父在子前或子在父前都行），再按每行的「必有」定 required；没写行的中间节点默认必有。
function toJsonSchema(rows, file, apiPath) {
  const root = { type: 'object', properties: {}, required: [] };
  const declared = new Map();
  for (const r of rows) {
    if (declared.has(r['字段'])) fail(`${file}:${r.__line} ${apiPath} 字段 ${r['字段']} 重复`);
    declared.set(r['字段'], r);
  }
  const container = node => {                 // object 直接挂子字段，array 挂到 items
    const t = [].concat(node.type).filter(x => x !== 'null')[0];
    if (t === 'array') { node.items ??= { type: 'object' }; node = node.items; }
    else if (t !== 'object') fail(`${file}: ${apiPath} 字段类型是 ${t}，不能再有子字段`);
    node.properties ??= {}; node.required ??= [];
    return node;
  };
  const nodeOf = new Map();
  for (const [p, r] of declared) {
    const parts = p.split('.');
    let parent = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const pp = parts.slice(0, i + 1).join('.');
      let n = nodeOf.get(pp);
      if (!n) {
        const pr = declared.get(pp);
        const { t, nullable } = pr ? splitType(pr['类型']) : { t: 'object', nullable: false };
        n = { type: nullable ? [t, 'null'] : t };
        if (pr?.['说明']) n.description = pr['说明'];
        container(parent).properties[parts[i]] = n; nodeOf.set(pp, n);
      }
      parent = n;
    }
    const leaf = parts.at(-1);
    let n = nodeOf.get(p);
    const { t, nullable } = splitType(r['类型']);
    if (!n) { n = { type: nullable ? [t, 'null'] : t }; container(parent).properties[leaf] = n; nodeOf.set(p, n); }
    else n.type = nullable ? [t, 'null'] : t;
    if (r['说明']) n.description = r['说明'];
  }
  for (const [p] of nodeOf) {
    const parts = p.split('.');
    const parentNode = parts.length === 1 ? root : nodeOf.get(parts.slice(0, -1).join('.'));
    const row = declared.get(p);
    const must = row ? row['必有'] === '是' : true;
    const c = container(parentNode);
    if (must && !c.required.includes(parts.at(-1))) c.required.push(parts.at(-1));
  }
  // ajv 不接受空的 required: []（YApi 会报「schema is invalid」），子字段都「否」的对象把它删掉
  const strip = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n.required) && !n.required.length) delete n.required; Object.values(n.properties || {}).forEach(strip); strip(n.items); };
  strip(root);
  return root;
}

// 极简校验，用来做「空响应必须失败」的自检（和 ajv 的 type/required 语义一致）
function validate(s, d, p = '$') {
  const errs = [];
  const types = [].concat(s.type || []);
  const jt = d === null ? 'null' : Array.isArray(d) ? 'array' : typeof d === 'number' ? (Number.isInteger(d) ? 'integer' : 'number') : typeof d;
  if (types.length && !types.includes(jt) && !(jt === 'integer' && types.includes('number'))) errs.push(`${p}: 期望 ${types.join('|')}，实际 ${jt}`);
  if (jt === 'object' && s.properties) {
    for (const k of s.required || []) if (!(k in d)) errs.push(`${p}.${k}: 缺少 required`);
    for (const [k, ss] of Object.entries(s.properties)) if (k in d) errs.push(...validate(ss, d[k], p + '.' + k));
  }
  if (jt === 'array' && s.items) d.forEach((x, i) => errs.push(...validate(s.items, x, `${p}[${i}]`)));
  return errs;
}

// ---------------- 4. 转 YApi 字段 ----------------
const castExample = (v, t) => t === 'integer' || t === 'number' ? (v === '' ? null : Number(v)) : t === 'boolean' ? v === 'true' : v;

function toPayload(api, status, changeName) {
  const file = api.file;
  check(api);
  const schema = toJsonSchema(api.tables['返回字段'], file, api.path);
  if (!validate(schema, { code: 200, msg: '', data: {} }).length) fail(`${file}:${api.line} ${api.path} 空响应 {"code":200,"data":{}} 居然能通过校验，返回字段表的「必有」没起作用`);
  const q = api.tables['请求参数'] || [];
  const h = api.tables['请求头'] || [];
  const errs = (api.tables['业务错误码'] || []).map(r => `- ${r['code']}：${r['场景']}${r['data'] ? '（data：' + r['data'] + '）' : ''}`).join('\n');
  const meta = [api.login && `登录：${api.login}`, api.sign && `签名：${api.sign}`].filter(Boolean).join('　');
  const isGet = ['GET', 'DELETE', 'HEAD'].includes(api.method);
  const payload = {
    title: api.title, path: api.path, method: api.method, status,
    req_headers: h.map(r => ({ name: r['参数'], value: r['示例'], required: r['必填'] === '是' ? '1' : '0', desc: r['说明'] })),
    req_query: [], req_body_type: 'json', req_body_is_json_schema: false, req_body_other: '',
    res_body_type: 'json', res_body_is_json_schema: true, res_body: JSON.stringify(schema, null, 2),
    // desc 每次 push 都会被覆盖：只放 api.md 里有的信息
    desc: [`模块：${api.module}`, meta, errs && `业务错误码：\n${errs}`, `来源：openspec 变更 ${changeName} 的 api.md，由 .claude/skills/yapi/scripts/yapi.mjs 推送；改 api.md 不要在此手改`].filter(Boolean).join('\n\n'),
    tag: [changeName],
  };
  if (isGet) {
    // value 和 example 都写：YApi 用例没自己存值时执行用 value（导入接口不会带示例）
    payload.req_query = q.map(r => ({ name: r['参数'], type: r['类型'], required: r['必填'] === '是' ? '1' : '0', example: r['示例'], value: r['示例'], desc: r['说明'] }));
  } else if (q.length) {
    // POST：请求体推「示例 JSON」而不是 schema —— YApi 导入接口生成用例时会原样复制它；推 schema 则会随机 mock 出假值
    const body = {};
    for (const r of q) if (r['示例'] !== '' || r['必填'] === '是') body[r['参数']] = castExample(r['示例'], r['类型']);
    payload.req_body_other = JSON.stringify(body, null, 2);
  }
  return payload;
}

// ---------------- 5. YApi HTTP（经 yapi CLI，带人的登录态） ----------------
let SERVER = 'http://yapi';   // 真实地址在 resolveProject 里从 ~/.yapi/config.toml 的 base_url 读，这里只是拼链接用的兜底
function yapi(p, { method = 'GET', body, query } = {}) {
  const args = ['--path', p, '--method', method, '--no-pretty', '--no-update'];
  for (const [k, v] of Object.entries(query || {})) args.push('--query', `${k}=${v}`);
  if (body) args.push('--data', JSON.stringify(body));
  let out;
  try { out = execFileSync('yapi', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { if (e.code === 'ENOENT') fail(CLI_HELP); fail(`yapi CLI 执行失败（${method} ${p}）：${String(e.stderr || e.stdout || e.message).trim().slice(0, 300)}`); }
  const start = out.indexOf('{');
  let json; try { json = JSON.parse(out.slice(start)); } catch { fail(`YApi ${method} ${p} 返回的不是 JSON：${out.trim().slice(0, 200)}`); }
  if (json.errcode === 40011) fail(LOGIN_HELP);
  if (json.errcode !== 0) fail(`YApi ${method} ${p} → ${json.errcode} ${json.errmsg}`);
  return json.data;
}

function resolveProject(rest) {
  const i = rest.indexOf('--project');
  let id = i >= 0 ? rest[i + 1] : '';
  if (!id) {
    const pm = path.join(SKILL_DIR, 'references', 'project.md');
    const m = fs.existsSync(pm) && fs.readFileSync(pm, 'utf8').match(/YApi 项目 id[^\n|]*\|\s*`?(\d+)/);
    id = m ? m[1] : '';
  }
  if (!/^\d+$/.test(id || '')) fail(PROJECT_HELP);
  try { const cfg = fs.readFileSync(path.join(process.env.HOME || '', '.yapi', 'config.toml'), 'utf8'); const m = cfg.match(/^base_url\s*=\s*"([^"]+)"/m); if (m) SERVER = m[1].replace(/\/$/, ''); } catch {}
  return Number(id);
}

// 返回 Map："METHOD /path" → 接口 _id
function pushInterfaces(project_id, items) {
  const proj = yapi('/api/project/get', { query: { id: project_id } });
  console.log(`YApi 项目：${proj.name}（${project_id}）`);
  const menu = yapi('/api/interface/getCatMenu', { query: { project_id } });
  const cats = new Map((menu || []).map(c => [c.name, c._id]));
  const ids = new Map();
  for (const { module, payload } of items) {
    if (!cats.has(module)) {
      const c = yapi('/api/interface/add_cat', { method: 'POST', body: { project_id, name: module, desc: '对应 openspec/specs/ 下的能力目录，由 .claude/skills/yapi/scripts/yapi.mjs 创建' } });
      cats.set(module, c._id);
      console.log(`  建分类 ${module}（${c._id}）`);
    }
    yapi('/api/interface/save', { method: 'POST', body: { ...payload, project_id, catid: cats.get(module) } });
    const list = yapi('/api/interface/list_cat', { query: { catid: cats.get(module), limit: 1000 } });
    const hit = (list.list || []).find(i => i.path === payload.path && i.method === payload.method);
    if (!hit) fail(`推完在分类 ${module} 下找不到 ${payload.method} ${payload.path}`);
    const got = yapi('/api/interface/get', { query: { id: hit._id } });
    if (!got.res_body_is_json_schema) fail(`${payload.path} 推上去后 res_body_is_json_schema 不是 true`);
    const emptyQ = (got.req_query || []).filter(x => x.required === '1' && !x.value).map(x => x.name);
    if (emptyQ.length) fail(`${payload.path} 推上去后必填参数没有值：${emptyQ.join(',')}`);
    ids.set(`${payload.method} ${payload.path}`, hit._id);
    console.log(`  ✓ ${payload.method} ${payload.path}  id=${hit._id}  status=${payload.status}  ${SERVER}/project/${project_id}/interface/api/${hit._id}`);
  }
  return ids;
}

// ---------------- 5b. 用例 → YApi 测试集合 ----------------
// 公司 YApi 的用例脚本沙箱（safeify）起不来，所以不用 test_script；断言全靠集合的「通用规则」：
// 期望 code 相同的用例放同一个集合，集合规则「响应字段 code = 期望值」。正例集合另开 HTTP 200 和返回 Schema 校验。
// 集合名：<变更名>（正例）、<变更名> 期望 <code>（反例）。集合归脚本管：用例按名更新，api.md 里删掉的用例也删掉。
function buildCaseGroups(apis, itemsByKey, changeName) {
  const groups = new Map();   // 期望 code → [{ casename, key, req_query, req_headers, req_body_other, note }]
  const add = (code, c) => { if (!groups.has(code)) groups.set(code, []); groups.get(code).push(c); };
  for (const api of apis) {
    const key = `${api.method} ${api.path}`;
    const payload = itemsByKey.get(key);
    const isGet = ['GET', 'DELETE', 'HEAD'].includes(api.method);
    const types = Object.fromEntries((api.tables['请求参数'] || []).map(r => [r['参数'], r['类型']]));
    for (const r of api.tables['用例'] || []) {
      const p = parseCaseParams(r, api);
      // YApi 的浏览器扩展发请求时会删掉 Cookie 头（只带浏览器自己存的 cookie），所以要固定 Cookie 的用例在 YApi 上跑不了：不推，AI 在 apply 时用 curl 验
      if (p.headers.some(h => h.name === 'Cookie')) { groups.local ??= []; groups.local.push(`${r['用例']}（${api.path}）`); continue; }
      const headers = payload.req_headers.filter(h => !p.headers.some(x => x.name === h.name)).map(h => ({ name: h.name, value: h.value })).concat(p.headers);
      let req_query = [], req_body_other = '';
      if (isGet) req_query = p.query.map(q => ({ name: q.name, value: q.value, enable: true }));
      else { const b = {}; for (const q of p.query) b[q.name] = castExample(q.value, types[q.name] || 'string'); req_body_other = JSON.stringify(b); }
      for (let i = 1; i <= p.repeat; i++) {
        const last = i === p.repeat;
        add(last ? r['期望 code'] : SUCCESS_CODE, {
          casename: p.repeat > 1 ? `${r['用例']} 第${i}次` : r['用例'], key, req_query, req_headers: headers, req_body_other,
          note: last ? r['期望'] : `连打预热，第 ${i}/${p.repeat} 次`,
        });
      }
    }
  }
  return groups;
}

function pushCases(project_id, changeName, apis, items, ids) {
  const itemsByKey = new Map(items.map(i => [`${i.payload.method} ${i.payload.path}`, i.payload]));
  const groups = buildCaseGroups(apis, itemsByKey, changeName);
  const cols = new Map((yapi('/api/col/list', { query: { project_id } }) || []).map(c => [c.name, c]));
  const order = [SUCCESS_CODE, ...[...groups.keys()].filter(k => k !== SUCCESS_CODE)];
  const summary = [];
  for (const code of order) {
    const cases = groups.get(code) || [];
    const isOk = code === SUCCESS_CODE;
    const name = isOk ? changeName : `${changeName} 期望 ${code}`;
    let col = cols.get(name);
    const desc = `来源：openspec 变更 ${changeName} 的 api.md 用例表，由脚本维护，手改会被覆盖。${isOk ? '正例：HTTP 200 + code=' + SUCCESS_CODE + ' + 返回 Schema 校验' : '反例：只校验 code=' + code}`;
    if (!col) { col = yapi('/api/col/add_col', { method: 'POST', body: { project_id, name, desc } }); cols.set(name, col); console.log(`  建集合 ${name}（${col._id}）`); }
    yapi('/api/col/up_col', { method: 'POST', body: { col_id: col._id, name, desc, checkHttpCodeIs200: isOk, checkResponseSchema: isOk, checkResponseField: { name: 'code', value: code, enable: true }, checkScript: { content: '', enable: false } } });
    const existing = new Map((yapi('/api/col/case_list', { query: { col_id: col._id } }) || []).map(c => [c.casename, c._id]));
    let added = 0, updated = 0, removed = 0;
    for (const c of cases) {
      const body = { casename: c.casename, col_id: col._id, req_query: c.req_query, req_headers: c.req_headers, req_body_other: c.req_body_other, req_body_type: 'json', req_params: [], case_env: '', enable_script: false, test_script: '' };
      if (existing.has(c.casename)) { yapi('/api/col/up_case', { method: 'POST', body: { id: existing.get(c.casename), ...body } }); existing.delete(c.casename); updated++; }
      else { yapi('/api/col/add_case', { method: 'POST', body: { ...body, project_id, interface_id: ids.get(c.key) } }); added++; }
    }
    for (const [n, id] of existing) { yapi('/api/col/del_case', { query: { caseid: id } }); removed++; console.log(`  删了 api.md 里已不存在的用例「${n}」`); }
    const got = yapi('/api/col/case_list', { query: { col_id: col._id } }) || [];
    if (got.length !== cases.length) fail(`集合 ${name} 推完应有 ${cases.length} 条用例，实际 ${got.length}`);
    summary.push({ name, id: col._id, n: cases.length });
    console.log(`  ✓ 集合 ${name}  ${cases.length} 条（新增 ${added}，更新 ${updated}，删除 ${removed}）  ${SERVER}/project/${project_id}/interface/col/${col._id}`);
  }
  // api.md 里已经没有对应期望 code 的反例集合，删掉（只删脚本自己命名的）
  const keep = new Set(summary.map(s => s.name));
  for (const [n, c] of cols) if (n.startsWith(`${changeName} 期望 `) && !keep.has(n)) { yapi('/api/col/del_col', { query: { col_id: c._id } }); console.log(`  删了空掉的集合「${n}」`); }
  return summary;
}

// ---------------- 6. 找变更 ----------------
function findRoot(dir) {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, 'openspec', 'config.yaml'))) return d;
    if (path.dirname(d) === d) fail('找不到 openspec/config.yaml，请在仓库内运行');
  }
}

function loadChange(root, changeName) {
  if (!changeName) fail('用法：node .claude/skills/yapi/scripts/yapi.mjs push|archive <变更名> [--dry-run]');
  const changes = path.join(root, 'openspec', 'changes');
  const cands = [path.join(changes, changeName)];
  const arch = path.join(changes, 'archive');
  if (fs.existsSync(arch)) for (const d of fs.readdirSync(arch)) if (d === changeName || d.endsWith('-' + changeName)) cands.push(path.join(arch, d));
  const dir = cands.find(d => fs.existsSync(path.join(d, 'api.md')));
  if (!dir) fail(`找不到变更「${changeName}」的 api.md（找过 ${cands.map(d => path.relative(root, d)).join('、')}）`);
  const file = path.join(dir, 'api.md');
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, 'utf8');
  const apis = parseApiMd(text, rel);
  const seen = new Set();
  for (const a of apis) { const k = `${a.method} ${a.path}`; if (seen.has(k)) fail(`${rel}:${a.line} ${k} 出现了两次`); seen.add(k); }
  return { file: rel, text, apis };
}

// ---------------- 7. 子命令 ----------------
async function push({ root, changeName, dry, rest }) {
  const { file, apis } = loadChange(root, changeName);
  const items = apis.map(a => ({ module: a.module, payload: toPayload(a, 'undone', changeName) }));
  const groups = buildCaseGroups(apis, new Map(items.map(i => [`${i.payload.method} ${i.payload.path}`, i.payload])), changeName);
  const build = path.join(root, '.yapi', 'build');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, `${changeName}.json`), JSON.stringify({ items, cases: Object.fromEntries(groups) }, null, 2));
  const nCases = [...groups.values()].reduce((s, g) => s + g.length, 0);
  console.log(`${file}：${apis.length} 个接口、${nCases} 条用例，校验通过。${items.map(i => `\n  ${i.payload.method} ${i.payload.path} → 分类 ${i.module}`).join('')}${[...groups].map(([c, g]) => `\n  集合「${c === SUCCESS_CODE ? changeName : changeName + ' 期望 ' + c}」 ${g.length} 条：${g.map(x => x.casename).join('、')}`).join('')}`);
  if (groups.local?.length) console.log(`  不推 YApi、由 AI 在 apply 时 curl 验（要固定 Cookie，YApi 浏览器扩展发不了 Cookie 头）：${groups.local.join('、')}`);
  if (dry) return console.log('[dry-run] 未发送。中间产物 .yapi/build/' + changeName + '.json');
  const project_id = resolveProject(rest);
  const ids = pushInterfaces(project_id, items);
  const cols = pushCases(project_id, changeName, apis, items, ids);
  console.log(`\n下一步：合进 test 后，人打开 YApi 项目 ${project_id} → 测试集合，按顺序对 ${cols.map(c => '「' + c.name + '」').join('、')} 各点一次「开始测试」，环境选 test（https）。`);
}

// 把 Markdown 按「## 」切段；接口段按 "METHOD /path" 作 key，其它 ## 段原样保留在末尾
function splitSections(text) {
  // 前面补一个换行：JS 的 split 会跳过位置 0 的空匹配，文件第一行就是 ## 时第一段会被并进 head
  const parts = ('\n' + text.replace(/\r\n?/g, '\n')).split(/^(?=## )/m);
  const head = parts[0].replace(/^\n/, '');
  const apis = new Map(), others = [];
  for (const s of parts.slice(1)) {
    const m = s.split('\n')[0].match(INTERFACE_RE);   // 只看段首行
    const body = s.replace(/\s+$/, '') + '\n';
    if (m) apis.set(`${m[1]} ${m[2]}`, body); else others.push(body);
  }
  return { head, apis, others };
}

async function archive({ root, changeName, dry, rest }) {
  const { text, apis } = loadChange(root, changeName);
  // 先全部校验，任何一个接口不合格就什么都不写
  const items = apis.map(a => ({ module: a.module, payload: toPayload(a, 'done', changeName) }));
  const src = splitSections(text);
  const byModule = new Map();
  for (const a of apis) { if (!byModule.has(a.module)) byModule.set(a.module, []); byModule.get(a.module).push(`${a.method} ${a.path}`); }
  const writes = [];
  for (const [module, keys] of byModule) {
    const target = path.join(root, 'openspec', 'specs', module, 'api.md');
    const dst = fs.existsSync(target) ? splitSections(fs.readFileSync(target, 'utf8')) : { head: `# ${module} 接口契约\n\n<!-- 由 .claude/skills/yapi/scripts/yapi.mjs archive 按接口合并，同一 METHOD /path 只保留最新一份 -->\n`, apis: new Map(), others: [] };
    let added = 0, replaced = 0;
    for (const k of keys) {
      const sec = src.apis.get(k);
      if (!sec) fail(`内部错误：找不到接口段 ${k}`);
      if (dst.apis.has(k)) replaced++; else added++;
      dst.apis.set(k, sec);
    }
    const out = dst.head.replace(/\s+$/, '') + '\n\n' + [...dst.apis.values(), ...dst.others].join('\n');
    writes.push({ target, out });
    console.log(`${path.relative(root, target)}：覆盖 ${replaced}，新增 ${added}，保留其它段 ${dst.others.length}`);
  }
  if (dry) return console.log('[dry-run] 未写文件、未推 YApi');
  const project_id = resolveProject(rest);
  for (const w of writes) { fs.mkdirSync(path.dirname(w.target), { recursive: true }); fs.writeFileSync(w.target, w.out); }
  pushInterfaces(project_id, items);
}

// ---------------- 8. init：把 skill 里的 schema 接给 OpenSpec ----------------
// OpenSpec 找自定义 schema 只查两处：仓库的 openspec/schemas/（不想污染）和用户级全局目录。这里装到用户级目录：
//   XDG_DATA_HOME/openspec/schemas，Windows 用 %LOCALAPPDATA%\openspec\schemas，其它 ~/.local/share/openspec/schemas
// 复制（不软链接：skill 会被拷到多个仓库，链接会指死某一个）。幂等，每次覆盖。
import os from 'node:os';
function userSchemasDir() {
  const env = process.env;
  if (env.XDG_DATA_HOME) return path.join(env.XDG_DATA_HOME, 'openspec', 'schemas');
  if (process.platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'openspec', 'schemas');
  return path.join(os.homedir(), '.local', 'share', 'openspec', 'schemas');
}
async function init({ root }) {
  const skillSchema = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'openspec-schema');
  if (!fs.existsSync(path.join(skillSchema, 'schema.yaml'))) fail(`找不到 ${skillSchema}/schema.yaml`);
  const dir = userSchemasDir();
  const link = path.join(dir, 'api-contract');
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(link, { recursive: true, force: true });
  fs.cpSync(skillSchema, link, { recursive: true });
  console.log(`${link}：已从 ${path.relative(root, skillSchema)} 复制（改了 openspec-schema 重跑 init）`);
  const cfg = path.join(root, 'openspec', 'config.yaml');
  const text = fs.existsSync(cfg) ? fs.readFileSync(cfg, 'utf8') : '';
  if (/^schema:\s*api-contract\s*$/m.test(text)) console.log('openspec/config.yaml：已是 schema: api-contract');
  else if (/^schema:.*$/m.test(text)) { fs.writeFileSync(cfg, text.replace(/^schema:.*$/m, 'schema: api-contract')); console.log('openspec/config.yaml：schema 改为 api-contract'); }
  else { fs.writeFileSync(cfg, 'schema: api-contract\n' + text); console.log('openspec/config.yaml：写入 schema: api-contract'); }
  const gi = path.join(root, '.gitignore');
  const giText = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  if (!/^\.yapi\/?$/m.test(giText)) { fs.writeFileSync(gi, giText.replace(/\s*$/, '\n') + '\n# yapi skill 生成的中间文件\n.yapi/\n'); console.log('.gitignore：加了 .yapi/'); }
  // yapi CLI：装没装、登没登录
  try {
    const out = execFileSync('yapi', ['whoami', '--no-update'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const j = JSON.parse(out.slice(out.indexOf('{')));
    if (j.errcode === 0) console.log(`yapi CLI：已登录 ${j.data.username}（${j.data.email}）`);
    else console.log('yapi CLI：装了但没登录。' + LOGIN_HELP);
  } catch (e) { console.log(e.code === 'ENOENT' ? 'yapi CLI：没装。' + CLI_HELP : 'yapi CLI：没登录或出错。' + LOGIN_HELP); }
  console.log('\n验证：openspec schemas 应列出 api-contract（source user）；openspec status --change <变更> 应有 api 一项。');
}

// ---------------- 9. 入口 ----------------
async function main(argv) {
  const [cmd, changeName, ...rest] = argv;
  const cmds = { init, push, archive };
  if (!cmds[cmd]) fail('用法：node .claude/skills/yapi/scripts/yapi.mjs init | push <变更名> [--project <id>] [--dry-run] | archive <变更名> [--project <id>] [--dry-run]');
  await cmds[cmd]({ root: findRoot(process.cwd()), changeName, dry: rest.includes('--dry-run'), rest });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => {
    if (e instanceof UserError) console.error('✗ ' + e.message);
    else console.error('✗ 脚本内部错误（请把下面这段发给维护者）\n' + e.stack);
    process.exit(1);
  });
}
