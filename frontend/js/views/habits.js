/* 习惯追踪页 */
const HabitsView = {
  _fresh: new Set(),   // 本次会话刚打卡的习惯（触发涟漪动画）

  render(c) {
    c.innerHTML = `
      <div class="toolbar">
        <div class="hint">每天打卡，坚持就是胜利 💪</div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="habit-add">＋ 添加习惯</button>
      </div>
      <div id="habit-grid">${loadingHtml()}</div>`;
    $('#habit-add').onclick = () => this.openEdit(c, null);
    this.load(c);
  },

  async load(c) {
    const grid = $('#habit-grid', c);
    try {
      const habits = await api('/api/habits');
      if (!habits.length) {
        grid.innerHTML = '<div class="empty"><div class="big">🔥</div>还没有习惯<br>从「每天阅读 30 分钟」这种小目标开始吧</div>';
        return;
      }
      const cards = await Promise.all(habits.map(async h => {
        const [logs, streak] = await Promise.all([
          api(`/api/habits/${h.id}/logs`),
          api(`/api/habits/${h.id}/streak`),
        ]);
        return { ...h, logSet: new Set(logs.dates), streak: streak.streak };
      }));
      const today = todayStr();
      grid.innerHTML = `
        <div class="grid grid-2">
          ${cards.map(h => {
            const flames = h.streak >= 30 ? '🔥🔥🔥🔥' : h.streak >= 14 ? '🔥🔥🔥' : h.streak >= 7 ? '🔥🔥' : '🔥';
            return `
            <div class="card habit-card">
              <div class="habit-head">
                <div class="habit-icon" style="background:${h.color}1f">${h.icon}</div>
                <div class="habit-info">
                  <div class="habit-name">${escapeHtml(h.name)}</div>
                  <div class="habit-streak ${h.streak >= 7 ? 'hot' : ''}">${flames} 连续 ${h.streak} 天</div>
                </div>
                <button class="habit-check ${h.logSet.has(today) ? 'done' : ''} ${this._fresh.has(h.id) ? 'fresh' : ''}"
                  data-habit="${h.id}" title="今天打卡">✓</button>
              </div>
              ${this.heatmap(h, today)}
              <div class="habit-foot">
                <div class="habit-actions">
                  <button class="icon-btn" title="编辑" data-edit="${h.id}">✏️</button>
                  <button class="icon-btn danger" title="删除" data-del="${h.id}">🗑️</button>
                </div>
                <span class="text-muted" style="font-size:11px">最近 5 周打卡</span>
              </div>
            </div>`;}).join('')}
        </div>`;
      this.wire(c);
    } catch (e) {
      grid.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  heatmap(h, today) {
    const start = addDays(today, -34);
    let cols = '';
    for (let w = 0; w < 5; w++) {
      let cells = '';
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const on = h.logSet.has(date);
        const isToday = date === today;
        cells += `<div class="heat-cell ${on ? 'on' : ''} ${isToday ? 'today' : ''}"
          style="${on ? `--hc:${h.color}` : ''}" title="${date}"></div>`;
      }
      cols += `<div class="heatmap-col">${cells}</div>`;
    }
    return `<div class="heatmap">${cols}</div>`;
  },

  wire(c) {
    $$('.habit-check', c).forEach(el => {
      el.onclick = async () => {
        this._fresh.add(el.dataset.habit);
        try {
          await api(`/api/habits/${el.dataset.habit}/toggle`, { method: 'POST', body: { date: todayStr() } });
          this.load(c);
          setTimeout(() => this._fresh.delete(el.dataset.habit), 3000);
        } catch (e) { toast(e.message, 'error'); }
      };
    });
    $$('[data-edit]', c).forEach(el => {
      el.onclick = () => this.openEdit(c, { id: el.dataset.edit });
    });
    $$('[data-del]', c).forEach(el => {
      el.onclick = async () => {
        if (await confirmDialog('删除这个习惯吗？历史打卡记录也会一并删除。', '删除')) {
          try {
            await api(`/api/habits/${el.dataset.del}`, { method: 'DELETE' });
            toast('已删除', 'success');
            this.load(c);
          } catch (e) { toast(e.message, 'error'); }
        }
      };
    });
  },

  async openEdit(c, habit) {
    let data = {};
    if (habit && habit.id) {
      try { data = await api(`/api/habits/${habit.id}`); } catch (e) { /* ignore */ }
    }
    const colors = ['#e8893c', '#c25b5b', '#4c9e76', '#4a7fc7', '#a884d6', '#c98a2d', '#cf7a9d', '#4fa8a0'];
    openModal({
      title: habit ? '编辑习惯' : '添加习惯',
      width: 480,
      body: `
        <div class="field"><label>习惯名称 *</label>
          <input class="input" id="h-name" value="${escapeHtml(data.name || '')}" placeholder="如：阅读 30 分钟"></div>
        <div class="input-row">
          <div class="field"><label>图标（emoji）</label>
            <input class="input" id="h-icon" value="${escapeHtml(data.icon || '⭐')}" style="width:110px"></div>
        </div>
        <div class="field"><label>颜色</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${colors.map(col => `
              <span class="color-swatch ${(data.color || colors[0]) === col ? 'sel' : ''}"
                data-color="${col}" style="background:${col}"></span>`).join('')}
          </div></div>
        <div class="modal-actions">
          <button class="btn" id="h-cancel">取消</button>
          <button class="btn btn-primary" id="h-save">保存</button>
        </div>`,
      onMount: body => {
        let color = data.color || colors[0];
        $$('.color-swatch', body).forEach(s => {
          s.onclick = () => {
            $$('.color-swatch', body).forEach(x => x.classList.remove('sel'));
            s.classList.add('sel');
            color = s.dataset.color;
          };
        });
        $('#h-cancel', body).onclick = closeModal;
        $('#h-save', body).onclick = async () => {
          const name = $('#h-name', body).value.trim();
          if (!name) { toast('习惯名称不能为空', 'warning'); return; }
          const payload = { name, icon: $('#h-icon', body).value || '⭐', color };
          try {
            if (habit) await api(`/api/habits/${habit.id}`, { method: 'PUT', body: payload });
            else await api('/api/habits', { method: 'POST', body: payload });
            closeModal();
            toast('已保存', 'success');
            this.load(c);
          } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  }
};
