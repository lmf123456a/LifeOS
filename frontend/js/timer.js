/* 全局计时管理：正计时 / 倒计时 / 番茄计时
   —— 模块级单例，跨页面持续运行；悬浮条常驻右上角控制 */
const TimerManager = {
  session: null,          // { dbId, mode, task_id, task_title, duration_seconds }
  running: false,
  accumulated: 0,         // 已累计毫秒（不含暂停）
  startTs: 0,
  tickId: null,
  pomodoro: { phase: 'work', rounds: 0, workMs: 25 * 60 * 1000, breakMs: 5 * 60 * 1000 },

  init() {
    const pill = document.createElement('div');
    pill.id = 'timer-pill';
    pill.className = 'timer-pill';
    pill.style.display = 'none';
    pill.innerHTML = `
      <span class="timer-pill-ico">${iconSvg('timer', 15)}</span>
      <span class="timer-pill-time" id="pill-time">00:00</span>
      <span class="timer-pill-label" id="pill-label"></span>
      <button class="timer-pill-btn" id="pill-toggle" title="暂停/继续"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>
      <button class="timer-pill-btn" id="pill-stop" title="停止"><svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg></button>`;
    document.body.appendChild(pill);
    this._pill = pill;
    $('#pill-toggle').onclick = () => (this.running ? this.pause() : this.resume());
    $('#pill-stop').onclick = () => this.stop();
    // 点时间区域跳转到计时页
    const go = e => { if (e.target.closest('.timer-pill-ico, .timer-pill-time, .timer-pill-label')) navigate('timers'); };
    pill.addEventListener('click', go);
  },

  fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },

  elapsedTotal() {
    return this.accumulated + (this.running ? Date.now() - this.startTs : 0);
  },
  remainingMs() {
    if (!this.session || this.session.mode === 'stopwatch' || this.session.mode === 'break') return null;
    const total = (this.session.duration_seconds || 0) * 1000;
    return Math.max(0, total - this.elapsedTotal());
  },
  modeLabel() {
    if (!this.session) return '';
    if (this.session.mode === 'stopwatch') return '正计时';
    if (this.session.mode === 'countdown') return '倒计时';
    if (this.session.mode === 'break') return '番茄·休息';
    return `番茄 · 第${this.pomodoro.rounds + 1}轮`;
  },

  async start(mode, opts = {}) {
    const dur = opts.duration_seconds || 0;
    let s;
    if (mode === 'pomodoro') {
      this.pomodoro = {
        phase: 'work', rounds: 0,
        workMs: (opts.work_ms || 25 * 60) * 1000,
        breakMs: (opts.break_ms || 5 * 60) * 1000,
      };
    }
    s = await api('/api/timers/start', {
      method: 'POST',
      body: { mode, task_id: opts.task_id || null, task_title: opts.task_title || '', duration_seconds: dur },
    });
    this.session = { dbId: s.id, mode, task_id: s.task_id, task_title: s.task_title, duration_seconds: s.duration_seconds };
    this.accumulated = 0;
    this.running = true;
    this.startTs = Date.now();
    this._show();
    this._update();
    this._startTick();
    this._notify();
  },

  pause() {
    if (!this.running) return;
    this.accumulated = this.elapsedTotal();
    this.running = false;
    clearInterval(this.tickId);
    this._update();
    this._notify();   // 刷新计时页按钮文案（暂停 → 继续）
    this._sync();     // 悬浮窗立即进入暂停态
  },
  resume() {
    if (!this.session || this.running) return;
    this.startTs = Date.now();
    this.running = true;
    this._startTick();
    this._update();
    this._notify();
    this._sync();
  },

  async stop() {
    if (!this.session || this._stopping) return 0;
    this._stopping = true;
    const el = Math.round(this.elapsedTotal() / 1000);
    const dbId = this.session.dbId;
    const mode = this.session.mode;
    const saved = dbId ? (await api(`/api/timers/${dbId}/stop`, { method: 'POST', body: { elapsed_seconds: el } }).catch(() => null)) : null;
    this.session = null;
    this.accumulated = 0;
    this.running = false;
    clearInterval(this.tickId);
    this._hide();
    this._sync();     // 统一走 _sync 清空状态（替代原 active:false 片段）
    this._notify();
    this._stopping = false;
    if (mode === 'stopwatch') toast(`本次专注 ${Math.floor(el / 60)} 分 ${el % 60} 秒，已记录`, 'success');
    else if (saved) toast(`专注已记录：${Math.floor(el / 60)} 分`, 'success');
    return el;
  },

  _startTick() {
    clearInterval(this.tickId);
    this.tickId = setInterval(() => this._tick(), 1000);
  },

  async _tick() {
    this._update();
    this._heartbeat();
    if (!this.session) return;
    if (this.session.mode === 'countdown' || this.session.mode === 'break' || this.session.mode === 'pomodoro') {
      if (this.remainingMs() !== null && this.remainingMs() <= 0) {
        if (this.session.mode === 'countdown') {
          await this.stop();
          toast('⏰ 倒计时结束！干得漂亮', 'success', 6000);
          this._notify();
        } else if (this.session.mode === 'pomodoro') {
          await this._pomodoroPhaseEnd();
        } else { // break 结束
          toast('☕ 休息结束，开始下一个番茄！', 'info', 4000);
          await this._startPhase('work');
        }
      }
    }
  },

  async _pomodoroPhaseEnd() {
    const dbId = this.session.dbId;
    if (dbId) {
      await api(`/api/timers/${dbId}/stop`, { method: 'POST', body: { elapsed_seconds: Math.round(this.pomodoro.workMs / 1000) } }).catch(() => {});
    }
    this.pomodoro.rounds += 1;
    toast(`🍅 第 ${this.pomodoro.rounds} 个番茄完成！休息 ${Math.round(this.pomodoro.breakMs / 60000)} 分钟`, 'success', 7000);
    this._notify();
    await this._startPhase('break');
  },

  async _startPhase(phase) {
    this.pomodoro.phase = phase;
    if (phase === 'work') {
      const s = await api('/api/timers/start', {
        method: 'POST',
        body: { mode: 'pomodoro', task_id: this.session ? this.session.task_id : null, task_title: this.session ? this.session.task_title : '', duration_seconds: Math.round(this.pomodoro.workMs / 1000) },
      }).catch(() => null);
      this.session = s ? { dbId: s.id, mode: 'pomodoro', task_id: s.task_id, task_title: s.task_title, duration_seconds: s.duration_seconds } : { ...this.session, mode: 'pomodoro', dbId: null };
    } else {
      this.session = { ...this.session, mode: 'break', dbId: null, duration_seconds: Math.round(this.pomodoro.breakMs / 1000) };
    }
    this.accumulated = 0;
    this.running = true;
    this.startTs = Date.now();
    this._startTick();
  },

  _update() {
    if (!this._pill) return;
    if (!this.session) return;
    const rem = this.remainingMs();
    const ms = rem !== null ? rem : this.elapsedTotal();
    $('#pill-time').textContent = this.fmt(ms);
    $('#pill-label').textContent = this.modeLabel();
    $('#pill-toggle').innerHTML = this.running
      ? '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M8 5v14M16 5v14"/></svg>'
      : '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  },

  /* 同步状态给悬浮窗：暂停/继续/停止/每秒 tick 共用 */
  _sync() {
    if (!this.session) {
      api('/api/timers/state', { method: 'POST', body: { active: false } }).catch(() => {});
      return;
    }
    const isBreak = this.session.mode === 'break';
    api('/api/timers/state', {
      method: 'POST',
      body: {
        active: true,
        mode: isBreak ? 'pomodoro' : this.session.mode,
        phase: isBreak ? 'break' : this.pomodoro.phase,
        task_title: this.session.task_title || '',
        elapsed_seconds: Math.round(this.elapsedTotal() / 1000),
        running: this.running,
        duration_seconds: this.session.duration_seconds || 0,
        rounds: this.pomodoro.rounds,
      },
    }).catch(() => {});
  },

  /* 心跳：每秒由 _tick 调用 */
  _heartbeat() { this._sync(); },

  _show() { if (this._pill) this._pill.style.display = 'flex'; },
  _hide() { if (this._pill) this._pill.style.display = 'none'; },

  _notify() {
    window.dispatchEvent(new CustomEvent('timer-change'));
  },
};
