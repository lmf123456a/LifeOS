/* 长期计划页：月任务 / 年任务 */
const PLAN_STATUS = {
  active: { label: '进行中', cls: 'badge-st-reviewing' },
  done: { label: '已完成', cls: 'badge-st-mastered' },
  cancelled: { label: '已取消', cls: 'badge-pri-3' },
};

const PlansView = {
  type: 'month',
  month: todayStr().slice(0, 7),   // 2026-08
  year: todayStr().slice(0, 4),    // 2026

  yearOptions() {
    const y = new Date().getFullYear();
    const arr = [];
    for (let i = y - 1; i <= y + 4; i++) arr.push(String(i));
    return arr;
  },

  render(c) {
    c.innerHTML = `
      <div class="tabs" id="pl-tabs">
        <div class="tab ${this.type === 'month' ? 'active' : ''}" data-t="month">📅 月任务</div>
        <div class="tab ${this.type === 'year' ? 'active' : ''}" data-t="year">🎯 年任务</div>
      </div>
      <div class="toolbar">
        ${this.type === 'month'
          ? `<input type="month" class="input" id="pl-period" style="width:180px" value="${this.month}">`
          : `<select class="input" id="pl-period" style="width:130px">${this.yearOptions().map(y =>
              `<option value="${y}" ${y === this.year ? 'selected' : ''}>${y} 年</option>`).join('')}</select>`}
        <span class="hint">${this.type === 'month' ? '给这个月定几个目标' : '给这一年定几个目标'}</span>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="pl-add">＋ 添加${this.type === 'month' ? '月' : '年'}任务</button>
      </div>
      <div id="pl-list">${loadingHtml()}</div>`;

    $$('#pl-tabs .tab', c).forEach(t => {
      t.onclick = () => { this.type = t.dataset.t; this.render(c); };
    });
    const periodEl = $('#pl-period', c);
    periodEl.onchange = (e) => {
      if (this.type === 'month') this.month = e.target.value;
      else this.year = e.target.value;
      this.load(c);
    };
    $('#pl-add', c).onclick = () => this.openEdit(c, null);
    this.load(c);
  },

  async load(c) {
    const listEl = $('#pl-list', c);
    const period = this.type === 'month' ? this.month : this.year;
    try {
      const plans = await api(`/api/plans?type=${this.type}&period=${period}`);
      if (!plans.length) {
        listEl.innerHTML = `<div class="empty"><div class="big">${this.type === 'month' ? '🗓️' : '🎯'}</div>${this.type === 'month' ? '这个月还没有计划' : '这一年还没有计划'}<br>点击右上角「添加」开始定目标吧</div>`;
        return;
      }
      const active = plans.filter(p => p.status === 'active').length;
      listEl.innerHTML = `
        <div class="hint" style="margin-bottom:12px">共 ${plans.length} 项 · ${active} 项进行中</div>
        <div class="grid grid-2">
          ${plans.map(p => this.planCard(p)).join('')}
        </div>`;
      this.wire(c);
    } catch (e) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  planCard(p) {
    const st = PLAN_STATUS[p.status] || PLAN_STATUS.active;
    const done = p.status === 'done';
    return `
      <div class="card plan-card" data-id="${p.id}">
        <div class="plan-head">
          <div style="flex:1;min-width:0">
            <div class="plan-title ${done ? 'done' : ''}">${escapeHtml(p.title)}</div>
            ${p.notes ? `<div class="plan-notes">${escapeHtml(p.notes)}</div>` : ''}
          </div>
          <span class="badge ${st.cls}">${st.label}</span>
        </div>
        <div class="plan-progress">
          <div class="plan-progress-head">
            <span>完成进度</span>
            <b class="plan-progress-num ${done ? 'text-success' : ''}">${p.progress}%</b>
          </div>
          <div class="score-bar-track" style="height:10px">
            <div class="score-bar-fill ${done ? 'plan-fill-done' : ''}" style="width:${p.progress}%"></div>
          </div>
          ${!done ? `<input type="range" class="plan-range" min="0" max="100" step="5" value="${p.progress}" data-id="${p.id}" aria-label="调整进度">` : ''}
        </div>
        <div class="plan-foot">
          <span class="text-muted" style="font-size:11px">创建于 ${escapeHtml(formatDateTimeCn(p.created_at))}${p.completed_at ? ' · 完成于 ' + escapeHtml(formatDateTimeCn(p.completed_at)) : ''}</span>
          <div style="display:flex;gap:2px;align-items:center">
            ${p.status === 'active'
              ? `<button class="btn btn-sm" data-act="done" data-id="${p.id}">✓ 完成</button>`
              : `<button class="btn btn-sm" data-act="resume" data-id="${p.id}">↩️ 恢复</button>`}
            <button class="icon-btn" data-act="edit" data-id="${p.id}" title="编辑">✏️</button>
            <button class="icon-btn danger" data-act="del" data-id="${p.id}" title="删除">🗑️</button>
          </div>
        </div>
      </div>`;
  },

  wire(c) {
    $$('.plan-range', c).forEach(r => {
      // 拖动时本地实时更新百分比，松手后保存
      r.addEventListener('input', () => {
        const card = r.closest('.plan-card');
        const num = card && card.querySelector('.plan-progress-num');
        if (num) num.textContent = r.value + '%';
        const fill = card && card.querySelector('.score-bar-fill');
        if (fill) fill.style.width = r.value + '%';
      });
      r.addEventListener('change', async () => {
        try {
          await api(`/api/plans/${r.dataset.id}/progress`, { method: 'PATCH', body: { progress: Number(r.value) } });
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    $$('[data-act]', c).forEach(btn => {
      btn.onclick = async () => {
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        try {
          if (act === 'done') {
            await api(`/api/plans/${id}/status`, { method: 'PATCH', body: { status: 'done' } });
            toast('🎉 长期计划完成！', 'success');
          } else if (act === 'resume') {
            await api(`/api/plans/${id}/status`, { method: 'PATCH', body: { status: 'active' } });
            toast('已恢复为进行中', 'success');
          } else if (act === 'del') {
            if (await confirmDialog('删除这个计划吗？', '删除')) {
              await api(`/api/plans/${id}`, { method: 'DELETE' });
              toast('已删除', 'success');
            } else { return; }
          }
          this.load(c);
        } catch (e) { toast(e.message, 'error'); }
      };
    });
    $$('[data-act="edit"]', c).forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        this.openEdit(c, { id: btn.dataset.id });
      };
    });
  },

  async openEdit(c, plan) {
    let data = { title: '', notes: '' };
    if (plan && plan.id) {
      try { data = await api(`/api/plans/${plan.id}`); } catch (e) { /* ignore */ }
    }
    openModal({
      title: plan ? '编辑计划' : `添加${this.type === 'month' ? '月' : '年'}任务`,
      body: `
        <div class="field"><label>计划标题 *</label>
          <input class="input" id="pl-title" value="${escapeHtml(data.title)}" placeholder="${this.type === 'month' ? '如：读完《深度学习》前 8 章' : '如：通过英语六级'}"></div>
        <div class="field"><label>备注（可选）</label>
          <textarea class="textarea" id="pl-notes" placeholder="拆解步骤、里程碑、资源链接…">${escapeHtml(data.notes || '')}</textarea></div>
        <div class="hint">归属：${this.type === 'month' ? this.month + ' 月' : this.year + ' 年'}</div>
        <div class="modal-actions">
          <button class="btn" id="pl-cancel">取消</button>
          <button class="btn btn-primary" id="pl-save">保存</button>
        </div>`,
      onMount: body => {
        $('#pl-cancel', body).onclick = closeModal;
        $('#pl-save', body).onclick = async () => {
          const title = $('#pl-title', body).value.trim();
          if (!title) { toast('计划标题不能为空', 'warning'); return; }
          const payload = {
            title,
            notes: $('#pl-notes', body).value,
            type: this.type,
            period: this.type === 'month' ? this.month : this.year,
          };
          try {
            if (plan) await api(`/api/plans/${plan.id}`, { method: 'PUT', body: payload });
            else await api('/api/plans', { method: 'POST', body: payload });
            closeModal();
            toast('已保存', 'success');
            this.load(c);
          } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  }
};
