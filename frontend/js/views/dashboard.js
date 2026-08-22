/* 概览页 */
const DashboardView = {
  _quote: null,
  _fresh: false,   // navigate 进入概览时置 true，本次渲染换一句

  /* 每日美句：每次"打开"概览换一句，避免与上一句重复；页内操作不换 */
  pickQuote() {
    if (!this._fresh && this._quote) return this._quote;
    const list = QUOTES;
    let idx = Math.floor(Math.random() * list.length);
    if (this._quote) {
      const prev = list.indexOf(this._quote);
      if (idx === prev) idx = (idx + 1) % list.length;
    }
    this._quote = list[idx];
    this._fresh = false;
    return this._quote;
  },

  render(c) {
    c.innerHTML = loadingHtml();
    Promise.all([api('/api/dashboard'), api('/api/courses/today')])
      .then(([d, courseData]) => {
        d.courses_today = (courseData.courses || []);
        d.quote = this.pickQuote();
        c.innerHTML = this.html(d);
        this.wire(c, d);
      })
      .catch(e => {
        c.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
      });
  },

  html(d) {
    const done = d.tasks.filter(t => t.status === 'done').length;
    const habitsDone = d.habits.filter(h => h.done_today).length;
    const taskRows = d.tasks.slice(0, 6).map(t => {
      const p = PRIORITY_META[t.priority] || PRIORITY_META[2];
      return `
        <div class="task-row">
          <div class="task-check ${t.status === 'done' ? 'done' : ''}" data-task="${t.id}" data-cur="${t.status}">${checkSvgHtml()}</div>
          <div class="task-main">
            <div class="task-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
            <div class="task-meta">
              <span class="badge ${p.cls}">${p.label}优先级</span>
              ${t.due_time ? `<span>🕐 ${escapeHtml(t.due_time)}</span>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
    const habitChips = d.habits.map(h => `
      <button class="habit-check ${h.done_today ? 'done' : ''}" data-habit="${h.id}"
        title="${escapeHtml(h.name)}" style="border-color:${h.done_today ? '' : h.color};${h.done_today ? '' : `color:${h.color}`}">✓</button>
    `).join('');
    return `
      <div class="quote-banner">
        <div class="quote-text">“${escapeHtml(d.quote.t)}”</div>
        <div class="quote-author">—— ${escapeHtml(d.quote.a)}</div>
      </div>
      <div class="hero">
        <div>
          <h2>${greeting()}，今天也要加油</h2>
          <div class="date">${formatDateCn(d.today)}</div>
        </div>
        <div class="stat-inline">
          <div class="item"><div class="num text-success">${done}/${d.tasks.length}</div><div class="lbl">任务完成</div></div>
          <div class="item"><div class="num" style="color:var(--warning-deep)">${habitsDone}/${d.habits.length}</div><div class="lbl">习惯打卡</div></div>
          <div class="item"><div class="num text-accent">${d.due_cards}</div><div class="lbl">待复习</div></div>
          <div class="item"><div class="num" style="color:var(--accent)">${Math.round((d.focus_seconds || 0) / 60)}<span style="font-size:14px">分</span></div><div class="lbl">今日专注</div></div>
        </div>
      </div>
      ${d.due_cards > 0 ? `
        <div class="alert-box">🧠 你有 <b>${d.due_cards}</b> 张复盘卡片今天到期，别忘了费曼一下！
          <a data-go="reviews">去复习 →</a>
        </div>` : ''}
      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">今日课程 <span class="more" data-go="courses">课表 →</span></div>
          ${d.courses_today.length ? d.courses_today.map(c => `
            <div class="task-row">
              <div class="course-dot" style="background:${c.color}"></div>
              <div class="task-main">
                <div class="task-title">${escapeHtml(c.name)}</div>
                <div class="task-meta">
                  <span>⏰ ${c.start_time}-${c.end_time}</span>
                  ${c.location ? `<span>📍 ${escapeHtml(c.location)}</span>` : ''}
                </div>
              </div>
            </div>`).join('') : '<div class="empty"><div class="big">📅</div>今天没有课</div>'}
        </div>
        <div class="card">
          <div class="card-title">今日任务 <span class="more" data-go="tasks">全部 →</span></div>
          ${taskRows || '<div class="empty"><div class="big">🎯</div>今天还没有任务，去规划一下吧</div>'}
        </div>
        <div class="card">
          <div class="card-title">今日习惯 <span class="more" data-go="habits">管理 →</span></div>
          ${habitChips ? `<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:6px 0">${habitChips}</div>` : '<div class="empty"><div class="big">🔥</div>还没有习惯，添加第一个吧</div>'}
        </div>
        <div class="card">
          <div class="card-title">本月长期计划 <span class="more" data-go="plans">全部 →</span></div>
          ${d.plans_month && d.plans_month.length ? d.plans_month.map(p => `
            <div class="task-row" style="cursor:pointer" data-go="plans">
              <div class="task-main">
                <div class="task-title">${escapeHtml(p.title)}</div>
                <div style="display:flex;align-items:center;gap:8px;margin-top:5px">
                  <div style="flex:1;height:6px;background:var(--track);border-radius:3px;overflow:hidden">
                    <div style="height:100%;width:${p.progress}%;background:var(--accent-grad);border-radius:3px;transition:width .4s ease"></div>
                  </div>
                  <span class="text-muted" style="font-size:11px;width:34px;text-align:right">${p.progress}%</span>
                </div>
              </div>
            </div>`).join('') : '<div class="empty"><div class="big">🗓️</div>本月还没有长期计划</div>'}
        </div>
        <div class="card">
          <div class="card-title">最近笔记 <span class="more" data-go="notes">全部 →</span></div>
          ${d.recent_notes.map(n => {
            const m = CATEGORY_META[n.category] || CATEGORY_META.course;
            return `<div class="task-row" style="cursor:pointer" data-note="${n.id}">
              <div class="task-main"><div class="task-title">${m.icon} ${escapeHtml(n.title)}</div>
              <div class="task-meta"><span class="badge ${m.cls}">${m.label}</span></div></div></div>`;
          }).join('') || '<div class="empty"><div class="big">📚</div>还没有笔记</div>'}
        </div>
        <div class="card">
          <div class="card-title">快速入口</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn" data-go="reviews">🧠 新建费曼复盘</button>
            <button class="btn" data-go="notes">📝 随手记笔记</button>
            <button class="btn" data-go="reflections">🪞 写今日反思</button>
            <button class="btn" data-go="reports">📈 查看本周报告</button>
            <button class="btn" id="dashFloatBtn" type="button">🪟 悬浮窗：<span id="dashFloatState">…</span></button>
          </div>
        </div>
      </div>`;
  },

  wire(c, d) {
    if (!this._counted) {
      $$('.stat-inline .num', c).forEach(countUp);
      this._counted = true;
    }
    $$('.task-check', c).forEach(el => {
      el.onclick = async () => {
        const id = el.dataset.task;
        const next = el.dataset.cur === 'done' ? 'todo' : 'done';
        try {
          await api(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status: next } });
          this.render(c);
        } catch (e) { toast(e.message, 'error'); }
      };
    });
    $$('.habit-check', c).forEach(el => {
      el.onclick = async () => {
        try {
          await api(`/api/habits/${el.dataset.habit}/toggle`, { method: 'POST', body: { date: d.today } });
          this.render(c);
        } catch (e) { toast(e.message, 'error'); }
      };
    });
    $$('[data-go]', c).forEach(el => {
      el.onclick = () => navigate(el.dataset.go);
    });
    $$('[data-note]', c).forEach(el => {
      el.onclick = () => NotesView.openEditor(el.dataset.note);
    });
    // 悬浮窗开关：桌面窗口模式通过 pywebview 显示/隐藏，浏览器模式降级提示
    const floatBtn = c.querySelector('#dashFloatBtn');
    if (floatBtn) {
      const stateEl = c.querySelector('#dashFloatState');
      const hasApi = !!(window.pywebview && window.pywebview.api && window.pywebview.api.toggle_float);
      const setState = on => { stateEl.textContent = on ? '已开启' : '已关闭'; };
      const refresh = async () => {
        if (!hasApi) { stateEl.textContent = '仅桌面可用'; return; }
        try { setState(!!(await window.pywebview.api.float_visible())); }
        catch (e) { setState(false); }
      };
      refresh();
      floatBtn.onclick = async () => {
        if (!hasApi) { toast('悬浮窗仅在桌面窗口模式可用', 'error'); return; }
        try {
          const on = await window.pywebview.api.toggle_float();
          setState(!!on);
          await api('/api/settings', { method: 'PUT', body: { float_enabled: on ? '1' : '0' } });
          toast(on ? '悬浮窗已开启' : '悬浮窗已关闭');
        } catch (e) { toast(e.message, 'error'); }
      };
    }
  }
};
