/* LifeOS 悬浮窗逻辑：轮播今日计划 + 计时态切换 */
const FloatWidget = {
  items: [],
  idx: 0,
  lastPlanKey: '',
  lastOk: Date.now(),
  rotateTimer: null,

  start() {
    this.poll();
    setInterval(() => this.poll(), 1000);
    this.rotateTimer = setInterval(() => this.rotate(), 3500);
    // 关闭按钮：优先走 pywebview 原生关闭，否则 window.close()
    const closeBtn = document.getElementById('widClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        api('/api/settings', { method: 'PUT', body: { float_enabled: '0' } }).catch(() => {});
        try {
          if (window.pywebview && window.pywebview.api && window.pywebview.api.close_widget) {
            window.pywebview.api.close_widget();
            return;
          }
        } catch (e) { /* ignore */ }
        try { window.close(); } catch (e) { /* ignore */ }
      });
    }
  },

  async poll() {
    let d;
    try {
      d = await api('/api/timers/float-data');
      this.lastOk = Date.now();
    } catch (e) {
      // 兜底：主窗口/服务失联超时 → 退出计时态回到空闲
      if (Date.now() - this.lastOk > 6000 && document.getElementById('widget').dataset.state === 'timer') {
        this.renderState(false, {});
        this.renderPlan({ items: [], done: 0, total: 0 });
      }
      return;
    }
    const st = d.timer || {};
    const active = !!st.active;
    this.renderState(active, st);
    if (active) this.renderTimer(st);
    else this.renderPlan(d.plan || { items: [], done: 0, total: 0 });
  },

  renderState(active, st) {
    const w = document.getElementById('widget');
    w.dataset.state = active ? 'timer' : 'idle';
    if (active) {
      w.dataset.mode = st.mode === 'stopwatch' ? 'countup' : (st.mode || '');
      w.dataset.paused = st.running ? '0' : '1';
    }
  },

  fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  },

  renderTimer(st) {
    const elapsed = st.elapsed_seconds || 0;
    const dur = st.duration_seconds || 0;
    const isCountup = st.mode === 'stopwatch';
    // 时间：正计时显示已过，倒计时/番茄显示剩余
    const ms = isCountup ? elapsed * 1000 : Math.max(0, (dur - elapsed)) * 1000;
    document.getElementById('timerTime').textContent = this.fmt(ms);
    // 模式标签
    let label = '计时';
    if (st.mode === 'stopwatch') label = '正计时';
    else if (st.mode === 'countdown') label = '倒计时';
    else if (st.mode === 'pomodoro') label = st.phase === 'break' ? '番茄·休息' : `番茄·第${(st.rounds || 0) + 1}轮`;
    document.getElementById('modeLabel').textContent = label;
    document.getElementById('taskName').textContent = st.task_title || '自由计时';
    // 进度条
    const fill = document.getElementById('timerFill');
    if (!isCountup && dur > 0) {
      const pct = Math.max(0, Math.min(100, elapsed / dur * 100));
      fill.style.width = pct + '%';
    } else {
      fill.style.width = '0%';
    }
  },

  renderPlan(plan) {
    const items = plan.items || [];
    // key 包含 type + meta，避免时间/类型变化时内容不更新
    const key = items.map(i => i.type + '|' + i.title + '|' + i.meta + (i.done ? '|✓' : '')).join('◇');
    document.getElementById('idleCount').textContent = `${plan.done}/${plan.total}`;
    // 顶部微进度：今日任务完成比例
    document.getElementById('widProgress').style.width = plan.total ? Math.round(plan.done / plan.total * 100) + '%' : '0%';
    if (key === this.lastPlanKey) return;
    this.lastPlanKey = key;
    this.items = items;
    this.idx = 0;
    this.renderCarousel();
  },

  renderCarousel() {
    const carousel = document.getElementById('carousel');
    const dots = document.getElementById('widDots');
    if (!this.items.length) {
      delete carousel.dataset.marquee;
      carousel.innerHTML = `<div class="wid-item on"><div class="wid-item-title" style="color:var(--muted-2)"><span>今天没有安排，享受生活 ✨</span></div></div>`;
      dots.innerHTML = '';
      return;
    }
    const itemHtml = this.items.map((it, i) => `
      <div class="wid-item ${i === 0 ? 'on enter' : ''}">
        <div class="wid-item-title ${it.done ? 'done' : ''}">
          <i class="wid-item-dot" style="--dot:${it.type === 'course' ? 'var(--info)' : 'var(--accent)'}"></i>
          <span>${escapeHtml(it.title)}</span>
        </div>
        <div class="wid-item-meta">${escapeHtml(it.meta)}</div>
      </div>`).join('');
    if (this.items.length > 1) {
      // 无缝跑马灯：track 复制一份内容，CSS translateX(-50%) 循环
      carousel.dataset.marquee = 'loop';
      dots.innerHTML = '';
      carousel.innerHTML = `<div class="wid-track">${itemHtml}${itemHtml}</div>`;
      // 时长随条数自适应，匀速舒适
      const track = carousel.querySelector('.wid-track');
      track.style.animationDuration = Math.max(16, this.items.length * 6) + 's';
    } else {
      delete carousel.dataset.marquee;
      dots.innerHTML = '<i class="wid-dot on"></i>';
      carousel.innerHTML = itemHtml;
    }
  },

  rotate() {
    // 计时态不轮播；空列表防御
    if (document.getElementById('widget').dataset.state === 'timer') return;
    if (!this.items || this.items.length <= 1) return;
    const carousel = document.getElementById('carousel');
    // 跑马灯模式：内容静态滚动，无需逐个轮播
    if (carousel.dataset.marquee === 'loop') return;
    const kids = carousel.children;
    if (!kids.length) return;
    const prevIdx = this.idx;
    this.idx = (this.idx + 1) % this.items.length;
    if (kids[prevIdx]) { kids[prevIdx].classList.remove('on', 'enter'); kids[prevIdx].classList.add('leave'); }
    if (kids[this.idx]) { kids[this.idx].classList.remove('leave'); kids[this.idx].classList.add('on', 'enter'); }
    document.querySelectorAll('#widDots .wid-dot').forEach((d, i) => d.classList.toggle('on', i === this.idx));
    // 清掉 leave 类，避免下次误触发
    setTimeout(() => { if (kids[prevIdx]) kids[prevIdx].classList.remove('leave'); }, 500);
  }
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

FloatWidget.start();
