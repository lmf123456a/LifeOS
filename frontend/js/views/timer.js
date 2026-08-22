/* 项目计时页：正计时 / 倒计时 / 番茄计时 */
const TIMER_MODES = [
  ['stopwatch', '正计时'],
  ['countdown', '倒计时'],
  ['pomodoro', '番茄计时'],
];

const TimerView = {
  mode: 'stopwatch',
  _displayTimer: null,

  render(c) {
    c.innerHTML = `
      <div class="tabs" id="tm-tabs">
        ${TIMER_MODES.map(([k, label]) =>
          `<div class="tab ${this.mode === k ? 'active' : ''}" data-m="${k}">${label}</div>`).join('')}
      </div>
      <div id="tm-current">${loadingHtml()}</div>
      <div class="grid grid-2 stack">
        <div class="card">
          <div class="card-title">📊 今日专注</div>
          <div id="tm-summary">${loadingHtml()}</div>
        </div>
        <div class="card">
          <div class="card-title">📜 最近计时记录</div>
          <div id="tm-history">${loadingHtml()}</div>
        </div>
      </div>`;
    $$('#tm-tabs .tab', c).forEach(t => {
      t.onclick = () => { this.mode = t.dataset.m; this.render(c); };
    });
    this.loadCurrent(c);
    this.loadStats(c);
    this.loadHistory(c);
    // 先移除再添加，避免重复监听导致重复请求
    if (this._onTimerChange) window.removeEventListener('timer-change', this._onTimerChange);
    this._onTimerChange = () => {
      this.loadCurrent(c);
      this.loadStats(c);
    };
    window.addEventListener('timer-change', this._onTimerChange);
    // 页面打开期间每秒刷新大数字
    clearInterval(this._displayTimer);
    this._displayTimer = setInterval(() => {
      const el = $('#tm-time', c);
      if (el && TimerManager.session) {
        const rem = TimerManager.remainingMs();
        el.textContent = TimerManager.fmt(rem !== null ? rem : TimerManager.elapsedTotal());
      }
    }, 1000);
  },

  async loadCurrent(c) {
    const box = $('#tm-current', c);
    const s = TimerManager.session;
    if (s) {
      const rem = TimerManager.remainingMs();
      const ms = rem !== null ? rem : TimerManager.elapsedTotal();
      box.innerHTML = `
        <div class="card timer-live">
          <div class="section-label">${TimerManager.modeLabel()}${s.task_title ? ` · ${escapeHtml(s.task_title)}` : ''}</div>
          <div class="timer-big" id="tm-time">${TimerManager.fmt(ms)}</div>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn" id="tm-toggle">${TimerManager.running ? '⏸ 暂停' : '▶ 继续'}</button>
            <button class="btn btn-danger" id="tm-stop">■ 停止</button>
          </div>
        </div>`;
      $('#tm-toggle', box).onclick = () => (TimerManager.running ? TimerManager.pause() : TimerManager.resume());
      $('#tm-stop', box).onclick = async () => { await TimerManager.stop(); this.loadCurrent(c); this.loadStats(c); this.loadHistory(c); };
      return;
    }
    // 无计时 → 显示对应模式的启动表单
    let body = '';
    if (this.mode === 'stopwatch') {
      body = `
        <div class="hint" style="margin-bottom:10px">自由计时：想专注多久就多久，随时停止记录</div>`;
    } else if (this.mode === 'countdown') {
      body = `
        <div class="field" style="margin-bottom:10px">
          <label>专注时长</label>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            ${[15, 25, 45, 60].map(m => `<button class="btn btn-sm" data-min="${m}">${m} 分钟</button>`).join('')}
            <input type="number" class="input" id="tm-min" min="1" max="480" value="25" style="width:90px">
          </div>
        </div>`;
    } else {
      body = `
        <div class="input-row" style="margin-bottom:10px">
          <div class="field"><label>工作时长（分）</label><input type="number" class="input" id="tm-work" min="1" max="120" value="25"></div>
          <div class="field"><label>休息时长（分）</label><input type="number" class="input" id="tm-break" min="1" max="60" value="5"></div>
        </div>`;
    }
    box.innerHTML = `
      <div class="card">
        <div class="card-title">🚀 开始${TIMER_MODES.find(m => m[0] === this.mode)[1]}</div>
        <div class="field"><label>关联任务（可选）</label>
          <select class="input" id="tm-task"><option value="">🎯 自由计时（不关联任务）</option></select>
        </div>
        ${body}
        <div style="display:flex;justify-content:flex-end">
          <button class="btn btn-primary" id="tm-start">开始 ${TIMER_MODES.find(m => m[0] === this.mode)[1]}</button>
        </div>
      </div>`;
    // 加载任务列表
    api('/api/tasks').then(tasks => {
      const sel = $('#tm-task', box);
      tasks.filter(t => t.status === 'todo' || t.status === 'doing').slice(0, 50).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title;
        sel.appendChild(opt);
      });
    }).catch(() => {});
    $$('[data-min]', box).forEach(b => {
      b.onclick = () => { $('#tm-min', box).value = b.dataset.min; };
    });
    $('#tm-start', box).onclick = async () => {
      const taskSel = $('#tm-task', box);
      const taskId = taskSel ? taskSel.value : '';
      const taskTitle = taskSel && taskSel.selectedOptions[0] ? taskSel.selectedOptions[0].textContent : '';
      try {
        let dur = 0;
        if (this.mode === 'countdown') dur = Math.max(1, Number($('#tm-min', box).value || 25)) * 60;
        if (this.mode === 'pomodoro') {
          const work = Math.max(1, Number($('#tm-work', box).value || 25));
          const brk = Math.max(1, Number($('#tm-break', box).value || 5));
          await TimerManager.start('pomodoro', { task_id: taskId || null, task_title: taskTitle, work_ms: work * 60, break_ms: brk * 60 });
        } else {
          await TimerManager.start(this.mode, { task_id: taskId || null, task_title: taskTitle, duration_seconds: dur });
        }
        this.loadCurrent(c);
      } catch (e) { toast(e.message, 'error'); }
    };
  },

  async loadStats(c) {
    const box = $('#tm-summary', c);
    try {
      const s = await api('/api/timers/summary');
      const h = Math.floor(s.focus_seconds / 3600), m = Math.floor((s.focus_seconds % 3600) / 60);
      box.innerHTML = `
        <div style="display:flex;gap:26px;align-items:center;flex-wrap:wrap">
          <div class="stat-inline" style="gap:26px">
            <div class="item"><div class="num" style="color:var(--accent)">${h ? `${h}h` : ''}${m}m</div><div class="lbl">专注时长</div></div>
            <div class="item"><div class="num">${s.sessions}</div><div class="lbl">专注次数</div></div>
          </div>
          <span class="text-muted" style="font-size:12px">${s.date} 的专注记录，持续加油 💪</span>
        </div>`;
    } catch (e) { box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  },

  async loadHistory(c) {
    const box = $('#tm-history', c);
    try {
      const rows = await api('/api/timers/history?days=30');
      const MODE_LABEL = { stopwatch: '正计时', countdown: '倒计时', pomodoro: '番茄' };
      box.innerHTML = rows.length ? rows.map(r => {
        const mins = Math.round(r.elapsed_seconds / 60);
        return `
          <div class="task-row">
            <div class="task-main">
              <div class="task-title">${escapeHtml(r.task_title || '自由计时')}</div>
              <div class="task-meta">
                <span class="badge badge-pri-2">${MODE_LABEL[r.mode] || r.mode}</span>
                <span>⏱ ${mins} 分钟${r.rounds ? ` · ${r.rounds} 轮` : ''}</span>
                <span>${escapeHtml(formatDateTimeCn(r.started_at))}</span>
              </div>
            </div>
          </div>`;
      }).join('') : '<div class="empty"><div class="big">⏱️</div>还没有计时记录<br>选个任务开始第一个专注吧</div>';
    } catch (e) { box.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
  }
};
