/* 周/月报告 */
const ReportsView = {
  range: 'week',

  render(c) {
    c.innerHTML = `
      <div class="tabs" id="rp-tabs">
        <div class="tab ${this.range === 'week' ? 'active' : ''}" data-r="week">📅 本周</div>
        <div class="tab ${this.range === 'month' ? 'active' : ''}" data-r="month">📆 本月</div>
      </div>
      <div id="rp-body">${loadingHtml()}</div>`;
    $$('#rp-tabs .tab', c).forEach(t => {
      t.onclick = () => { this.range = t.dataset.r; this.render(c); };
    });
    this.load(c);
  },

  async load(c) {
    const body = $('#rp-body', c);
    try {
      const [s, t] = await Promise.all([
        api(`/api/reports?range=${this.range}`),
        api('/api/reports/trends'),
      ]);
      body.innerHTML = this.html(s) + this.trendsHtml(t) + `<div id="rp-ai"></div>`;
      this.wire(c, s);
    } catch (e) {
      body.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  /* 近 8 周趋势区（SVG 折线图，离线无依赖） */
  trendsHtml(t) {
    const labels = t.labels;
    const taskRates = t.weeks.map(w => w.task_rate);
    const reviewCounts = t.weeks.map(w => w.reviews);
    const habitCharts = t.habits.map(h => `
      <div style="margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span>${h.icon}</span><b style="font-size:13px">${escapeHtml(h.name)}</b>
          <span style="font-size:11px;color:var(--muted)">近 8 周完成率</span>
        </div>
        ${lineChartSVG(h.weekly, { color: h.color, labels })}
      </div>`).join('');
    return `
      <div class="grid grid-2 stack">
        <div class="card">
          <div class="card-title">📈 任务完成率趋势（近 8 周）</div>
          ${lineChartSVG(taskRates, { color: '#ea580c', labels })}
        </div>
        <div class="card">
          <div class="card-title">🔁 每周复盘讲解次数（近 8 周）</div>
          ${lineChartSVG(reviewCounts, { color: '#4a7fc7', labels, unit: ' 次', scale: 'auto' })}
        </div>
      </div>
      ${t.habits.length ? `<div class="card stack">
        <div class="card-title">🔥 习惯完成率趋势（近 8 周）</div>
        <div class="grid grid-2">${habitCharts}</div>
      </div>` : ''}`;
  },

  html(s) {
    const rangeName = s.range_days === 30 ? '本月' : '本周';
    // 任务每日柱状图
    const dates = [];
    for (let i = 0; i < s.range_days; i++) dates.push(addDays(s.start, i));
    const chartCols = dates.map((d, i) => {
      const day = s.daily_tasks[d] || { total: 0, done: 0 };
      const pct = day.total ? Math.round(day.done / day.total * 100) : 0;
      const showLabel = s.range_days <= 7 || i % 5 === 0;
      return `
        <div class="chart-col" title="${d} 完成 ${day.done}/${day.total}">
          <div class="chart-bar-wrap">
            ${day.total ? `<div class="chart-bar ${pct === 100 ? 'done-part' : ''}" style="height:${Math.max(pct, 3)}%"></div>` : ''}
          </div>
          ${showLabel ? `<div class="chart-date">${d.slice(5)}</div>` : `<div style="height:22px"></div>`}
        </div>`;
    }).join('');

    return `
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="card stat-card accent"><div class="stat-num">${s.task_rate}%</div><div class="stat-label">任务完成率（${s.task_done}/${s.task_total}）</div></div>
        <div class="card stat-card success"><div class="stat-num">${s.habit_rate}%</div><div class="stat-label">习惯完成率</div></div>
        <div class="card stat-card warning"><div class="stat-num">${s.notes_created}</div><div class="stat-label">新建笔记</div></div>
        <div class="card stat-card info"><div class="stat-num">${s.cards_reviewed}</div><div class="stat-label">复盘讲解次数</div></div>
        <div class="card stat-card"><div class="stat-num">${s.new_cards}</div><div class="stat-label">新建卡片</div></div>
        <div class="card stat-card"><div class="stat-num">${s.mastered}</div><div class="stat-label">累计掌握</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">每日任务完成度</div>
          <div class="chart-legend"><span><span class="legend-dot" style="background:var(--accent)"></span>完成比例（绿色=全完成）</span></div>
          <div class="chart">${chartCols}</div>
        </div>
        <div class="card">
          <div class="card-title">习惯打卡（${rangeName}）</div>
          ${s.habit_stats.length ? s.habit_stats.map(h => {
            const pct = Math.round(h.days_active / s.range_days * 100);
            return `
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
                <span style="font-size:18px">${h.icon}</span>
                <span style="width:110px;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(h.name)}</span>
                <div style="flex:1;height:8px;background:var(--track);border-radius:4px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${h.color};border-radius:4px"></div>
                </div>
                <span class="text-muted" style="font-size:12px;width:70px;text-align:right">${h.days_active}/${s.range_days} 天</span>
              </div>`;
          }).join('') : '<div class="empty"><div class="big">🔥</div>还没有习惯数据</div>'}
        </div>
      </div>
      <div class="card stack">
        <div class="card-title">✨ AI 复盘总结
          <button class="btn btn-sm btn-primary" id="rp-gen">生成 ${rangeName}总结</button>
        </div>
        <div id="rp-summary" class="ai-summary" style="color:var(--muted)">点击按钮，让 AI 根据你的真实数据写一段复盘。</div>
      </div>`;
  },

  wire(c, s) {
    // 数字升温 + 柱状图从 0 长到真值
    $$('.stat-num', c).forEach(countUp);
    $$('.chart-bar', c).forEach(bar => {
      const h = bar.style.height;
      bar.style.height = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = h; }));
    });
    $('#rp-gen', c).onclick = async () => {
      const btn = $('#rp-gen', c);
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⏳</span> 生成中…';
      try {
        const result = await api('/api/reports/summary', { method: 'POST', body: { range: this.range } });
        $('#rp-summary', c).textContent = result.summary;
        $('#rp-summary', c).style.color = 'var(--text)';
        toast('总结已生成', 'success');
      } catch (e) {
        toast(e.message, 'error');
        if (e.message.includes('API Key')) {
          $('#rp-summary', c).innerHTML = `还没有配置 DeepSeek API Key，<a style="color:var(--accent);cursor:pointer" id="rp-go-settings">去设置 →</a>`;
          $('#rp-go-settings', c).onclick = () => navigate('settings');
        }
      }
      btn.disabled = false;
      btn.innerHTML = `✨ 生成 ${s.range_days === 30 ? '本月' : '本周'}总结`;
    };
  }
};

/* 轻量 SVG 折线图（含网格、面积填充、数据点 tooltip、X 轴标签） */
function lineChartSVG(values, opts = {}) {
  const {
    color = '#6d8dff',
    labels = [],
    unit = '%',
    scale = 'percent',
    height = 175,
  } = opts;
  if (!values || !values.length) return '<div class="empty">暂无数据</div>';
  const W = 520, H = height;
  const padL = 32, padR = 10, padT = 14, padB = 26;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxV = Math.max(...values, 1);
  const niceMax = scale === 'percent' ? 100 : Math.max(1, Math.ceil(maxV / 5) * 5);
  const x = i => padL + (values.length > 1 ? (iw * i) / (values.length - 1) : iw / 2);
  const y = v => padT + ih - (v / niceMax) * ih;

  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${padT + ih} L${pts[0][0].toFixed(1)},${padT + ih} Z`;

  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const v = niceMax * g / 4;
    const gy = y(v);
    grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="#ede9e1"/>`
      + `<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" font-size="9" fill="rgba(122,115,102,0.85)" text-anchor="end">${Math.round(v)}</text>`;
  }
  const dots = pts.map((p, i) =>
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${color}" stroke="rgba(38,34,29,0.25)" stroke-width="1">
      <title>${escapeHtml(labels[i] || '')}: ${values[i]}${unit}</title>
    </circle>`).join('');
  const xLabels = labels.map((lb, i) => {
    if (values.length > 6 && i % 2 !== 0 && i !== values.length - 1) return '';
    return `<text x="${x(i).toFixed(1)}" y="${H - 7}" font-size="9.5" fill="rgba(122,115,102,0.85)" text-anchor="middle">${escapeHtml(lb)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img">
    ${grid}
    <path d="${area}" fill="${color}" opacity="0.1"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xLabels}
  </svg>`;
}
