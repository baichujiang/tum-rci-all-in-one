/* TUM RCI All-in-One v2. Original code, MIT. Pure functions shared by UI/tests. */
(function (root) {
  'use strict';
  const cohorts = ['2025/26冬季', '2026夏季', '2026/27冬季'];
  const statuses = ['planned', 'passed'];
  function csv(text) {
    const rows = []; let row = [], cell = '', quoted = false;
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === ',' || c === '\n')) {
        row.push(cell); cell = '';
        if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
      } else cell += c;
    }
    if (quoted) throw new Error('CSV 引号未闭合');
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const header = rows.shift() || [];
    if (new Set(header).size !== header.length) throw new Error('CSV 列名重复');
    return rows.map(r => {
      if (r.length !== header.length) throw new Error('CSV 行列数不一致');
      return Object.fromEntries(header.map((h, i) => [h, r[i]]));
    });
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function safeURL(url) {
    try { const u = new URL(String(url)); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
    catch (_) { return ''; }
  }
  function validatePlan(raw, courses) {
    if (!raw || raw.version !== 2 || !Array.isArray(raw.items) || raw.items.length > 250) throw new Error('不是有效的第二版学分计划');
    if (typeof raw.conditional !== 'boolean' || typeof raw.cohort !== 'string' || !['unknown', 'older', ...cohorts].includes(raw.cohort)) throw new Error('批次或补修设置无效');
    const known = new Map(courses.map(c => [c.module_code, c]));
    const used = new Set();
    const items = raw.items.map(x => {
      if (!x || typeof x.code !== 'string' || !statuses.includes(x.status)) throw new Error('模块或状态无效');
      const code = x.code.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9._-]{0,59}$/.test(code) || used.has(code)) throw new Error('模块代码无效或重复');
      used.add(code);
      if (known.has(code)) return {code, status:x.status};
      if (!x.custom || typeof x.name !== 'string' || !x.name.trim() || x.name.length > 160 || !['G', 'H', 'I', 'J'].includes(x.group) || typeof x.ects !== 'number' || !Number.isFinite(x.ects) || x.ects <= 0 || x.ects > 30 || !Number.isInteger(x.ects * 2)) throw new Error('自定义选修须有名称、G/H/I/J 分类及 0.5–30 ECTS（0.5 的倍数）');
      return {code, name:x.name.trim(), group:x.group, ects:x.ects, custom:true, status:x.status};
    });
    if (used.has('IN2067') && used.has('ED160028')) throw new Error('Robotics 与 Roboterdynamik 是二选一，请先移除另一门');
    return {version:2, cohort:raw.cohort, conditional:raw.conditional, items};
  }
  function calculate(plan, courses, onlyPassed = false) {
    plan = validatePlan(plan, courses);
    const known = new Map(courses.map(c => [c.module_code, c]));
    const totals = {core:0, G:0, H:0, I:0, J:0, thesis:0, K:0};
    let raw = 0, custom = 0;
    const chosen = [];
    for (const item of plan.items) {
      if (onlyPassed && item.status !== 'passed') continue;
      const course = known.get(item.code);
      const group = course ? course.section_2025[0] : item.group;
      const ects = course ? Number(course.ects) : item.ects;
      raw += ects; chosen.push(item.code);
      if (item.custom) custom++;
      if ('ABCDE'.includes(group)) totals.core += ects;
      else if (group === 'F') totals.thesis += ects;
      else if (group in totals) totals[group] += ects;
    }
    const target = plan.conditional ? 36 : 41;
    const professional = totals.G + totals.H + totals.I;
    const buckets = [
      ['必修（含二选一）', totals.core, 43], ['专业选修 G/H/I', professional, target],
      ['跨学科 J', totals.J, 6], ['硕士论文', totals.thesis, 30]
    ];
    if (plan.conditional) buckets.push(['控制理论补修 K', totals.K, 5]);
    const allocated = buckets.reduce((n, [, value, required]) => n + Math.min(value, required), 0);
    const gaps = buckets.filter(([, value, required]) => value < required).map(([label, value, required]) => `${label}还差 ${required - value} ECTS`);
    for (const group of ['G', 'H', 'I']) if (totals[group] < 5) gaps.push(`${group} 领域最低 5 ECTS，还差 ${5 - totals[group]}`);
    const supported = cohorts.includes(plan.cohort);
    if (!supported) gaps.unshift('未选择受支持的入学批次：不作规则达成判断');
    if (!plan.conditional && totals.K > 0) gaps.push('ED140014 未按补修计入：请核对个人录取要求');
    return {raw, allocated, buckets, totals, professional, gaps, supported, custom,
      complete: supported && gaps.length === 0, chosen};
  }
  // Escaped Markdown subset for our own guides only. Never execute raw HTML.
  function markdown(text, resolveLink) {
    function inline(s) {
      const tokens = [];
      s = s.replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, label, url) => {
        const dest = resolveLink(url);
        const html = dest ? `<a href="${esc(dest)}"${dest.startsWith('#/') ? '' : ' target="_blank" rel="noopener noreferrer"'}>${esc(label)}</a>` : esc(label);
        tokens.push(html); return `\u0000${tokens.length-1}\u0000`;
      });
      return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\u0000(\d+)\u0000/g, (_, n) => tokens[Number(n)] || '');
    }
    const lines = text.split(/\r?\n/); let out = '', table = [], code = null;
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.filter(x => !/^\s*\|?[\s:|-]+\|\s*$/.test(x)).map(x => x.trim().replace(/^\||\|$/g, '').split('|'));
      out += '<div class="table-scroll"><table>' + rows.map((r, i) => `<tr>${r.map(c => `<${i ? 'td' : 'th'}>${inline(c.trim())}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('') + '</table></div>'; table = [];
    };
    for (const line of lines) {
      if (line.startsWith('```')) { flushTable(); if (code !== null) { out += `<pre><code>${esc(code)}</code></pre>`; code = null; } else code = ''; continue; }
      if (code !== null) { code += line + '\n'; continue; }
      if (/^\s*\|/.test(line)) { table.push(line); continue; }
      flushTable();
      if (!line.trim()) continue;
      const heading = line.match(/^(#{1,4})\s+(.*)/);
      if (heading) { const n = Math.min(heading[1].length + 1, 5); out += `<h${n}>${inline(heading[2])}</h${n}>`; }
      else if (line.startsWith('>')) out += `<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`;
      else if (/^[-*]\s/.test(line)) out += `<p class="md-bullet">${inline(line.replace(/^[-*]\s/, ''))}</p>`;
      else out += `<p>${inline(line)}</p>`;
    }
    flushTable(); if (code !== null) out += `<pre><code>${esc(code)}</code></pre>`;
    return out;
  }
  const api = {csv, esc, safeURL, validatePlan, calculate, markdown, cohorts};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RCI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
