/* 今日规划页 */
const TasksView = {
  date: todayStr(),

  render(c) {
    c.innerHTML = `
      <div class="toolbar">
        <input type="date" class="input" id="task-date" style="width:165px" value="${this.date}">
        <button class="btn btn-sm" id="task-today">今天</button>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="task-add">＋ 添加任务</button>
      </div>
      <div id="task-list">${loadingHtml()}</div>`;
    $('#task-date').onchange = e => { this.date = e.target.value; this.render(c); };
    $('#task-today').onclick = () => { this.date = todayStr(); this.render(c); };
    $('#task-add').onclick = () => this.openEdit(c, null);
    this.loadList(c);
  },

  async loadList(c) {
    const listEl = $('#task-list', c);
    try {
      // 同时拉取今日课程（行程融入：只有查看今天时才显示）
      const [tasks, courseData] = await Promise.all([
        api(`/api/tasks?date=${this.date}`),
        api('/api/courses/today'),
      ]);
      const todayCourses = this.date === todayStr() ? (courseData.courses || []) : [];
      const groups = [
        { key: 'doing', label: '进行中' },
        { key: 'todo', label: '待办' },
        { key: 'done', label: '已完成' },
        { key: 'cancelled', label: '已取消' },
      ];
      const isEmpty = tasks.every(t => t.status === 'cancelled') || tasks.length === 0;
      const courseCard = todayCourses.length ? `
        <div class="card" style="margin-bottom:14px">
          <div class="card-title">📚 今日课程 <span class="more" data-go="courses">课表 →</span></div>
          ${todayCourses.map(c => `
            <div class="course-row">
              <div class="course-dot" style="background:${c.color}"></div>
              <div class="task-main">
                <div class="task-title">${escapeHtml(c.name)}</div>
                <div class="task-meta">
                  <span>⏰ ${c.start_time}-${c.end_time}</span>
                  ${c.location ? `<span>📍 ${escapeHtml(c.location)}</span>` : ''}
                  ${c.teacher ? `<span>👤 ${escapeHtml(c.teacher)}</span>` : ''}
                </div>
              </div>
            </div>`).join('')}
        </div>` : '';
      listEl.innerHTML = `
        ${courseCard}
        ${formatDateCn(this.date) === formatDateCn(todayStr()) ? '' : `<div class="text-muted" style="font-size:12px;margin-bottom:8px">正在查看 ${formatDateCn(this.date)} 的任务</div>`}
        ${isEmpty ? '<div class="empty"><div class="big">🎯</div>这一天还没有任务</div>' : groups.map(g => {
          const items = tasks.filter(t => t.status === g.key);
          if (!items.length) return '';
          return `
            <div class="card" style="margin-bottom:14px">
              <div class="card-title">${g.label} <span style="font-size:12px;color:var(--muted-2)">${items.length}</span></div>
              ${items.map(t => this.taskRow(t)).join('')}
            </div>`;
        }).join('')}`;
      this.wire(c);
    } catch (e) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  taskRow(t) {
    const p = PRIORITY_META[t.priority] || PRIORITY_META[2];
    return `
      <div class="task-row" data-id="${t.id}">
        <div class="task-check ${t.status === 'done' ? 'done' : ''}" data-act="toggle">${checkSvgHtml()}</div>
        <div class="task-main">
          <div class="task-title ${t.status === 'done' ? 'done' : ''}">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            <span class="badge ${p.cls}">${p.label}</span>
            ${t.due_time ? `<span>🕐 ${escapeHtml(t.due_time)}</span>` : ''}
            ${t.notes ? `<span title="${escapeHtml(t.notes)}">📝 ${escapeHtml(t.notes.length > 40 ? t.notes.slice(0, 40) + '…' : t.notes)}</span>` : ''}
            ${t.completed_at ? `<span style="color:var(--success)">✓ ${escapeHtml(formatDateTimeCn(t.completed_at))}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          ${t.status === 'todo' ? `<button class="icon-btn" title="开始" data-act="doing">▶️</button>` : ''}
          ${t.status === 'doing' ? `<button class="icon-btn" title="回到待办" data-act="todo">⏸️</button>` : ''}
          <button class="icon-btn" title="编辑" data-act="edit">✏️</button>
          <button class="icon-btn danger" title="删除" data-act="del">🗑️</button>
        </div>
      </div>`;
  },

  wire(c) {
    $$('.task-row', c).forEach(row => {
      row.querySelector('[data-act="toggle"]').onclick = async () => {
        const id = row.dataset.id;
        const isDone = row.querySelector('.task-check').classList.contains('done');
        try {
          await api(`/api/tasks/${id}/status`, { method: 'PATCH', body: { status: isDone ? 'todo' : 'done' } });
        } catch (e) { toast(e.message, 'error'); }
        this.loadList(c);
      };
      const actBtn = row.querySelector('[data-act="doing"], [data-act="todo"]');
      if (actBtn) {
        actBtn.onclick = async () => {
          try {
            await api(`/api/tasks/${row.dataset.id}/status`, { method: 'PATCH', body: { status: actBtn.dataset.act } });
            this.loadList(c);
          } catch (e) { toast(e.message, 'error'); }
        };
      }
      row.querySelector('[data-act="edit"]').onclick = () => this.openEdit(c, { id: row.dataset.id });
      row.querySelector('[data-act="del"]').onclick = async () => {
        if (await confirmDialog('确定删除这个任务吗？', '删除')) {
          try {
            await api(`/api/tasks/${row.dataset.id}`, { method: 'DELETE' });
            toast('已删除', 'success');
            this.loadList(c);
          } catch (e) { toast(e.message, 'error'); }
        }
      };
    });
    $$('[data-go]', c).forEach(el => {
      el.onclick = () => navigate(el.dataset.go);
    });
  },

  async openEdit(c, task) {
    let data = null;
    if (task && task.id) {
      try { data = await api(`/api/tasks/${task.id}`); } catch (e) { /* 用传入数据 */ }
    }
    data = data || task || {};
    openModal({
      title: task ? '编辑任务' : '添加任务',
      body: `
        <div class="field"><label>任务内容 *</label>
          <input class="input" id="t-title" value="${escapeHtml(data.title || '')}" placeholder="要做什么？"></div>
        <div class="field"><label>备注</label>
          <textarea class="textarea" id="t-notes" placeholder="补充说明（可选）">${escapeHtml(data.notes || '')}</textarea></div>
        <div class="input-row">
          <div class="field"><label>优先级</label>
            <select class="input" id="t-priority">
              <option value="1" ${data.priority === 1 ? 'selected' : ''}>高</option>
              <option value="2" ${(data.priority === 2 || !data.priority) ? 'selected' : ''}>中</option>
              <option value="3" ${data.priority === 3 ? 'selected' : ''}>低</option>
            </select></div>
          <div class="field"><label>日期</label>
            <input type="date" class="input" id="t-date" value="${data.due_date || this.date}"></div>
          <div class="field"><label>时间（可选）</label>
            <input type="time" class="input" id="t-time" value="${escapeHtml(data.due_time || '')}"></div>
        </div>
        <div class="modal-actions">
          <button class="btn" id="t-cancel">取消</button>
          <button class="btn btn-primary" id="t-save">保存</button>
        </div>`,
      onMount: body => {
        $('#t-cancel', body).onclick = closeModal;
        $('#t-save', body).onclick = async () => {
          const title = $('#t-title', body).value.trim();
          if (!title) { toast('任务内容不能为空', 'warning'); return; }
          const payload = {
            title,
            notes: $('#t-notes', body).value,
            priority: Number($('#t-priority', body).value),
            due_date: $('#t-date', body).value,
            due_time: $('#t-time', body).value,
          };
          try {
            if (task) await api(`/api/tasks/${task.id}`, { method: 'PUT', body: payload });
            else await api('/api/tasks', { method: 'POST', body: payload });
            closeModal();
            toast('已保存', 'success');
            this.date = payload.due_date;
            this.render(c);
          } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  }
};
