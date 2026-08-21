/* 反思总结页：日 / 月 / 年 */
const REFLECTION_TEMPLATES = {
  day: '今天完成了什么？\n\n有什么遗憾或不足？\n\n学到了什么 / 有什么新的想法？\n\n明天最重要的三件事：\n1.\n2.\n3.',
  month: '这个月最大的成就是什么？\n\n遇到了哪些挑战，怎么应对的？\n\n学到了什么 / 有什么感悟？\n\n下个月的目标：\n1.\n2.\n3.',
  year: '今年的关键词是什么？为什么？\n\n最大的成长是什么？\n\n有哪些遗憾？\n\n明年想往哪个方向走？',
};
const RATING_EMOJI = ['', '😞', '🙁', '😐', '🙂', '😄'];
const RATING_LABEL = { 1: '很差', 2: '不太好', 3: '一般', 4: '不错', 5: '很棒' };
const TYPE_NAMES = { day: '日反思', month: '月反思', year: '年反思' };

const ReflectionsView = {
  type: 'day',
  day: todayStr(),
  month: todayStr().slice(0, 7),
  year: todayStr().slice(0, 4),
  rating: 0,

  period() {
    return this.type === 'day' ? this.day : this.type === 'month' ? this.month : this.year;
  },
  periodDisplay() {
    const p = this.period();
    if (this.type === 'day') return formatDateCn(p);
    if (this.type === 'month') return `${p.slice(0, 4)} 年 ${Number(p.slice(5))} 月`;
    return `${p} 年`;
  },
  shiftPeriod(dir) {
    const d = new Date(this.day + 'T00:00:00');
    d.setDate(d.getDate() + dir);
    this.day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  render(c) {
    c.innerHTML = `
      <div class="tabs" id="rf-tabs">
        <div class="tab ${this.type === 'day' ? 'active' : ''}" data-t="day">☀️ 日反思</div>
        <div class="tab ${this.type === 'month' ? 'active' : ''}" data-t="month">🌙 月反思</div>
        <div class="tab ${this.type === 'year' ? 'active' : ''}" data-t="year">🎯 年反思</div>
      </div>
      <div class="toolbar">
        ${this.type === 'day'
          ? `<input type="date" class="input" id="rf-period" style="width:170px" value="${this.day}">`
          : this.type === 'month'
            ? `<input type="month" class="input" id="rf-period" style="width:170px" value="${this.month}">`
            : `<select class="input" id="rf-period" style="width:130px">${this.yearOptions().map(y =>
                `<option value="${y}" ${y === this.year ? 'selected' : ''}>${y} 年</option>`).join('')}</select>`}
        ${this.type === 'day' ? `
          <button class="btn btn-sm" id="rf-prev">◀ 前一天</button>
          <button class="btn btn-sm" id="rf-next">后一天 ▶</button>
          <button class="btn btn-sm" id="rf-today">今天</button>` : ''}
        <div class="spacer"></div>
        <span class="hint">${this.type === 'day' ? '每天花 5 分钟，复盘一天' : this.type === 'month' ? '每月一次，回望整月' : '每年一次，锚定方向'}</span>
      </div>
      <div id="rf-editor">${loadingHtml()}</div>
      <div class="card stack">
        <div class="card-title">📜 历史${TYPE_NAMES[this.type]}</div>
        <div id="rf-history">${loadingHtml()}</div>
      </div>`;

    $$('#rf-tabs .tab', c).forEach(t => {
      t.onclick = () => { this.type = t.dataset.t; this.render(c); };
    });
    $('#rf-period', c).onchange = e => {
      if (this.type === 'day') this.day = e.target.value;
      else if (this.type === 'month') this.month = e.target.value;
      else this.year = e.target.value;
      this.loadEditor(c);
      this.loadHistory(c);
    };
    const prev = $('#rf-prev', c), next = $('#rf-next', c), tdy = $('#rf-today', c);
    if (prev) prev.onclick = () => { this.shiftPeriod(-1); this.render(c); };
    if (next) next.onclick = () => { this.shiftPeriod(1); this.render(c); };
    if (tdy) tdy.onclick = () => { this.day = todayStr(); this.render(c); };
    this.loadEditor(c);
    this.loadHistory(c);
  },

  yearOptions() {
    const y = new Date().getFullYear();
    const arr = [];
    for (let i = y - 1; i <= y + 3; i++) arr.push(String(i));
    return arr;
  },

  async loadEditor(c) {
    const editor = $('#rf-editor', c);
    try {
      const [ref, dayStrip] = await Promise.all([
        api(`/api/reflections?type=${this.type}&period=${this.period()}`),
        this.type === 'day' ? api(`/api/reflections/day-data?date=${this.day}`) : Promise.resolve(null),
      ]);
      this.rating = ref.rating || 0;
      editor.innerHTML = `
        <div class="card">
          <div class="card-title">✍️ ${TYPE_NAMES[this.type]} · ${this.periodDisplay()}
            <span id="rf-state" class="${ref.exists ? 'text-success' : 'text-muted'}" style="font-size:12px;font-weight:400">${ref.exists ? '已记录' : '未记录'}</span>
          </div>
          ${dayStrip ? `
            <div style="display:flex;gap:16px;flex-wrap:wrap;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;margin-bottom:12px;font-size:12.5px;color:var(--text-2)">
              <span>✅ 任务完成 <b style="color:var(--text)">${dayStrip.tasks_done}/${dayStrip.tasks_total}</b></span>
              <span>🔥 习惯打卡 <b style="color:var(--text)">${dayStrip.habits_done}/${dayStrip.habits_total}</b></span>
              <span>📝 新建笔记 <b style="color:var(--text)">${dayStrip.notes_created}</b> 篇</span>
              <span style="color:var(--muted)">— 当天数据回顾，帮你回忆</span>
            </div>` : ''}
          <textarea class="textarea" id="rf-content" style="min-height:240px" placeholder="${escapeHtml(REFLECTION_TEMPLATES[this.type])}">${escapeHtml(ref.content || '')}</textarea>
          <div class="editor-preview" id="rf-preview"></div>
          <div class="plan-foot" style="margin-top:14px;border-top:none;padding-top:0">
            <div style="display:flex;align-items:center;gap:6px" id="rf-rating">
              <span class="text-muted" style="font-size:12px">今日心情</span>
              ${[1, 2, 3, 4, 5].map(r => `
                <button class="rating-btn ${this.rating === r ? 'sel' : ''}" data-r="${r}" title="${RATING_LABEL[r]}">${RATING_EMOJI[r]}</button>`).join('')}
              <span id="rf-rating-label" class="text-muted" style="font-size:12px">${this.rating ? RATING_LABEL[this.rating] : '未选择'}</span>
            </div>
            <div style="display:flex;gap:10px">
              <button class="btn btn-danger" id="rf-del" style="${ref.exists ? '' : 'display:none'}">删除</button>
              <button class="btn btn-primary" id="rf-save">保存反思</button>
            </div>
          </div>
        </div>`;
      this.wireEditor(c, ref);
    } catch (e) {
      editor.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  wireEditor(c, ref) {
    const contentEl = $('#rf-content', c);
    const preview = () => {
      $('#rf-preview', c).innerHTML = `<div class="section-label">预览</div>` + mdToHtml(contentEl.value);
    };
    contentEl.addEventListener('input', preview);
    preview();

    $$('.rating-btn', c).forEach(btn => {
      btn.onclick = () => {
        this.rating = Number(btn.dataset.r);
        $$('.rating-btn', c).forEach(b => b.classList.toggle('sel', Number(b.dataset.r) === this.rating));
        $('#rf-rating-label', c).textContent = RATING_LABEL[this.rating];
      };
    });

    $('#rf-save', c).onclick = async () => {
      const btn = $('#rf-save', c);
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⏳</span> 保存中…';
      try {
        const saved = await api('/api/reflections', {
          method: 'PUT',
          body: { type: this.type, period: this.period(), content: contentEl.value, rating: this.rating },
        });
        $('#rf-state', c).className = 'text-success';
        $('#rf-state', c).style = 'font-size:12px;font-weight:400';
        $('#rf-state', c).textContent = `已保存 ${formatDateTimeCn(saved.updated_at)}`;
        $('#rf-del', c).style.display = '';
        toast('反思已保存', 'success');
        this.loadHistory(c);
      } catch (e) { toast(e.message, 'error'); }
      btn.disabled = false;
      btn.innerHTML = '保存反思';
    };

    $('#rf-del', c).onclick = async () => {
      if (!ref.exists && !ref.id) return;
      if (await confirmDialog('删除这篇反思？', '删除')) {
        try {
          await api(`/api/reflections/${ref.id}`, { method: 'DELETE' });
          toast('已删除', 'success');
          this.loadEditor(c);
          this.loadHistory(c);
        } catch (e) { toast(e.message, 'error'); }
      }
    };
  },

  async loadHistory(c) {
    const listEl = $('#rf-history', c);
    try {
      const rows = await api(`/api/reflections/history?type=${this.type}`);
      listEl.innerHTML = rows.length ? rows.map(r => `
        <div class="task-row" style="cursor:pointer" data-period="${escapeHtml(r.period)}">
          <div style="font-size:18px">${RATING_EMOJI[r.rating] || '·'}</div>
          <div class="task-main">
            <div class="task-title">${escapeHtml(this.periodText(r))}</div>
            ${r.excerpt ? `<div class="task-meta">${escapeHtml(r.excerpt)}</div>` : ''}
          </div>
          <div class="task-actions" style="opacity:1">
            <span class="text-muted" style="font-size:11px">${escapeHtml(formatDateTimeCn(r.updated_at))}</span>
          </div>
        </div>`).join('') : '<div class="empty"><div class="big">🪞</div>还没有反思记录<br>从今天开始，写第一篇吧</div>';

      $$('[data-period]', listEl).forEach(row => {
        row.onclick = () => {
          const p = row.dataset.period;
          if (this.type === 'day') this.day = p;
          else if (this.type === 'month') this.month = p;
          else this.year = p;
          const picker = $('#rf-period', c);
          if (picker) picker.value = p;
          this.loadEditor(c);
        };
      });
    } catch (e) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  periodText(r) {
    if (this.type === 'day') return formatDateCn(r.period);
    if (this.type === 'month') return `${r.period.slice(0, 4)} 年 ${Number(r.period.slice(5))} 月`;
    return `${r.period} 年`;
  }
};
