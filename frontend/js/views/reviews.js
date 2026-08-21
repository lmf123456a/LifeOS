/* 费曼复盘页 */
const ReviewsView = {
  filter: 'due',
  keyword: '',

  render(c) {
    c.innerHTML = `
      <div class="toolbar">
        <button class="btn btn-primary" id="rv-add">＋ 新建复盘</button>
        <input class="input search-input" id="rv-search" placeholder="🔍 搜索卡片" value="${escapeHtml(this.keyword)}">
      </div>
      <div class="tabs" id="rv-tabs">
        ${[['due', '⏰ 今日到期'], ['pending', '🆕 待讲解'], ['needs_work', '🔧 待改进'], ['reviewing', '🔁 复习中'], ['mastered', '🏆 已掌握'], ['all', '全部']]
          .map(([k, label]) => `<div class="tab ${this.filter === k ? 'active' : ''}" data-f="${k}">${label}</div>`).join('')}
      </div>
      <div id="rv-list">${loadingHtml()}</div>`;
    $('#rv-add').onclick = () => this.openCreate(c);
    $('#rv-search').oninput = e => { this.keyword = e.target.value; this.load(c); };
    $$('#rv-tabs .tab', c).forEach(t => {
      t.onclick = () => { this.filter = t.dataset.f; this.render(c); };
    });
    this.load(c);
  },

  async load(c) {
    const listEl = $('#rv-list', c);
    try {
      let cards;
      if (this.filter === 'due' && !this.keyword.trim()) {
        cards = await api('/api/cards/due');
      } else {
        const params = new URLSearchParams();
        if (this.filter !== 'due' && this.filter !== 'all') params.set('status', this.filter);
        if (this.keyword.trim()) params.set('q', this.keyword.trim());
        cards = await api(`/api/cards?${params}`);
      }
      if (!cards.length) {
        listEl.innerHTML = '<div class="empty"><div class="big">🧠</div>这里还空着<br>点击「新建复盘」，把学习内容投喂给我，开始费曼讲解吧</div>';
        return;
      }
      listEl.innerHTML = cards.map(card => `
        <div class="card" style="margin-bottom:10px;cursor:pointer" data-id="${card.id}">
          <div class="task-row" style="border:none">
            <div class="task-main">
              <div class="task-title">${escapeHtml(card.title)}</div>
              <div class="task-meta">
                ${statusBadge(card)}
                <span>📅 下次复习：${formatDateCn(card.due_date)}</span>
                <span>🔁 讲解 ${card.review_count} 次</span>
                ${card.best_score ? `<span>⭐ 最佳 ${card.best_score} 分</span>` : ''}
              </div>
              ${card.explain_prompt ? `<div style="font-size:12px;color:var(--muted);margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📋 ${escapeHtml(card.explain_prompt)}</div>` : ''}
            </div>
            <div class="task-actions" style="opacity:1;align-items:center">
              ${card.status === 'mastered' ? `<button class="btn btn-sm" data-re="${card.id}">↩️ 重新激活</button>` : ''}
              <button class="btn btn-sm btn-primary" data-open="${card.id}">${card.explain_prompt ? '开始讲解' : '查看'}</button>
            </div>
          </div>
        </div>`).join('');
      $$('[data-open]', listEl).forEach(b => {
        b.onclick = e => { e.stopPropagation(); this.openDetail(b.dataset.open); };
      });
      $$('[data-re]', listEl).forEach(b => {
        b.onclick = async e => {
          e.stopPropagation();
          try {
            await api(`/api/cards/${b.dataset.re}/reactivate`, { method: 'POST' });
            toast('已重新激活', 'success');
            this.load(c);
          } catch (err) { toast(err.message, 'error'); }
        };
      });
      $$('.card[data-id]', listEl).forEach(card => {
        card.onclick = () => this.openDetail(card.dataset.id);
      });
    } catch (e) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  /* ===== 新建 ===== */
  openCreate(c) {
    openModal({
      title: '新建费曼复盘',
      width: 680,
      body: `
        <div class="hint" style="margin-bottom:12px">把你要学习的内容粘贴/输入到下面，我会帮你拆解核心要点、生成讲解任务；然后你用自己的话讲一遍，我来点评。这就是费曼学习法 ✍️</div>
        <div class="field"><label>标题 *</label>
          <input class="input" id="rv-title" placeholder="如：概率论 · 条件概率"></div>
        <div class="field"><label>学习内容（直接投喂给我）</label>
          <textarea class="textarea" id="rv-content" style="min-height:180px" placeholder="粘贴课程笔记、书本段落、单词表……"></textarea></div>
        <div class="field"><label>关联笔记（可选）</label>
          <select class="input" id="rv-note"><option value="">不关联</option></select></div>
        <div class="modal-actions">
          <button class="btn" id="rv-cancel">取消</button>
          <button class="btn btn-primary" id="rv-create">创建卡片</button>
        </div>`,
      onMount: body => {
        api('/api/notes?limit=500').then(notes => {
          const sel = $('#rv-note', body);
          notes.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.id;
            opt.textContent = `${CATEGORY_META[n.category]?.icon || ''} ${n.title}`;
            sel.appendChild(opt);
          });
        }).catch(() => {});
        $('#rv-cancel', body).onclick = closeModal;
        $('#rv-create', body).onclick = async () => {
          const title = $('#rv-title', body).value.trim();
          if (!title) { toast('请填写标题', 'warning'); return; }
          const noteId = $('#rv-note', body).value;
          try {
            const card = await api('/api/cards', {
              method: 'POST',
              body: { title, source_content: $('#rv-content', body).value, note_id: noteId || null },
            });
            closeModal();
            toast('卡片已创建', 'success');
            this.openDetail(card.id);
          } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  },

  /* ===== 详情（费曼主流程） ===== */
  async openDetail(cardId) {
    let card;
    try {
      card = await api(`/api/cards/${cardId}`);
    } catch (e) { toast(e.message, 'error'); return; }

    openModal({
      title: '费曼复盘',
      width: 760,
      body: this.detailHtml(card),
      onMount: body => { this.wireDetail(body, card); }
    });
  },

  detailHtml(card) {
    const explainSection = card.explain_prompt
      ? `<div class="section-block">
           <div class="section-label">📋 讲解任务</div>
           <div class="feyn-quote">${escapeHtml(card.explain_prompt)}</div>
         </div>
         <div class="section-block">
           <div class="section-label">💡 核心要点</div>
           <div class="feyn-quote" style="border-left-color:var(--warning)">${escapeHtml(card.key_points || '（暂缺）')}</div>
         </div>
         ${card.pitfalls ? `<div class="section-block">
           <div class="section-label">⚠️ 易错点</div>
           <div class="feyn-quote" style="border-left-color:var(--danger)">${escapeHtml(card.pitfalls)}</div>
         </div>` : ''}`
      : `<div class="section-block">
           <div class="section-label">📋 讲解任务</div>
           <div class="empty" style="padding:14px">还没有讲解任务</div>
           <button class="btn btn-primary" id="rv-gen">用 AI 生成讲解任务</button>
         </div>`;

    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
        <b style="font-size:15px">${escapeHtml(card.title)}</b>
        ${statusBadge(card)}
        <span style="font-size:12px;color:var(--muted);margin-left:auto">创建于 ${escapeHtml(formatDateTimeCn(card.created_at))}</span>
      </div>
      ${explainSection}
      ${card.source_content ? `
        <details class="summary-card"><summary>📄 原始学习内容（点击展开）</summary>
          <div class="content">${escapeHtml(card.source_content)}</div>
        </details>` : ''}
      <div class="section-block">
        <div class="section-label">✍️ 我的讲解</div>
        <div class="hint" style="margin-bottom:8px">用自己的话讲一遍——像在给一个小学生讲课。别用术语，讲不清的地方就是还没学会的地方。</div>
        <textarea class="textarea" id="rv-explain" style="min-height:140px" placeholder="把你想讲的写在这里……"></textarea>
        <div class="modal-actions" style="margin-top:10px">
          <button class="btn btn-primary" id="rv-submit">提交讲解，让 AI 点评</button>
        </div>
      </div>
      <div id="rv-eval"></div>
      <div class="section-block">
        <div class="section-label">📜 讲解历史</div>
        ${card.explanations.length ? card.explanations.map(e => `
          <details class="history-item">
            <summary>第 ${card.explanations.length - card.explanations.indexOf(e)} 次 · ${e.verdict === 'pass' ? '✅ 通过' : '❌ 需改进'} · ${e.score ? e.score + ' 分' : '未评分'} · ${escapeHtml(formatDateTimeCn(e.created_at))}</summary>
            <div style="margin-top:8px;font-size:13px">
              <div class="fb-label" style="font-size:11px;color:var(--muted)">我的讲解：</div>
              <div class="feedback-box">${escapeHtml(e.content)}</div>
              ${e.ai_feedback ? `<div class="fb-label" style="font-size:11px;color:var(--muted);margin-top:8px">AI 点评：</div>
              <div class="feedback-box">${escapeHtml(e.ai_feedback)}</div>` : ''}
            </div>
          </details>`).join('') : '<div class="empty" style="padding:14px">还没有讲解记录</div>'}
      </div>
      <div class="modal-actions">
        ${card.status === 'mastered' ? `<button class="btn" id="rv-re">↩️ 重新激活</button>` : ''}
        ${card.status !== 'mastered' ? `<button class="btn" id="rv-master">🏆 标记为已掌握</button>` : ''}
        <div class="spacer" style="flex:1"></div>
        <button class="btn btn-danger" id="rv-del">删除</button>
      </div>`;
  },

  wireDetail(body, card) {
    const genBtn = $('#rv-gen', body);
    if (genBtn) {
      genBtn.onclick = async () => {
        genBtn.disabled = true;
        genBtn.innerHTML = '<span class="spin">⏳</span> AI 拆解中…';
        try {
          const updated = await api(`/api/cards/${card.id}/generate`, { method: 'POST' });
          closeModal();
          this.openDetail(card.id);
        } catch (e) {
          toast(e.message, 'error');
          genBtn.disabled = false;
          genBtn.innerHTML = '✨ 用 AI 生成讲解任务';
        }
      };
    }

    $('#rv-submit', body).onclick = async () => {
      const content = $('#rv-explain', body).value.trim();
      if (!content) { toast('先写下你的讲解吧', 'warning'); return; }
      const btn = $('#rv-submit', body);
      btn.disabled = true;
      btn.innerHTML = '<span class="spin">⏳</span> AI 点评中…';
      try {
        const result = await api(`/api/cards/${card.id}/explain`, { method: 'POST', body: { content } });
        $('#rv-eval', body).innerHTML = this.evalHtml(result.evaluation, result.card);
        const again = $('#rv-again', body);
        if (again) {
          again.onclick = () => {
            const newContent = $('#rv-explain', body).value.trim();
            if (!newContent) { toast('请修改后再提交', 'warning'); return; }
            this.resubmit(body, card, newContent);
          };
        }
        // 刷新列表状态（详情关闭后）
        this._changed = true;
      } catch (e) {
        toast(e.message, 'error');
      }
      btn.disabled = false;
      btn.innerHTML = '🧠 提交讲解，让 AI 点评';
    };

    const masterBtn = $('#rv-master', body);
    if (masterBtn) {
      masterBtn.onclick = async () => {
        if (await confirmDialog('确认已完全掌握这张卡片吗？', '标记掌握')) {
          try {
            await api(`/api/cards/${card.id}/master`, { method: 'POST' });
            closeModal();
            toast('🏆 恭喜掌握！', 'success');
            this.refreshList();
          } catch (e) { toast(e.message, 'error'); }
        }
      };
    }
    const reBtn = $('#rv-re', body);
    if (reBtn) {
      reBtn.onclick = async () => {
        try {
          await api(`/api/cards/${card.id}/reactivate`, { method: 'POST' });
          closeModal();
          toast('已重新激活', 'success');
          this.refreshList();
        } catch (e) { toast(e.message, 'error'); }
      };
    }
    $('#rv-del', body).onclick = async () => {
      if (await confirmDialog('删除这张复盘卡片？讲解历史也会一并删除。', '删除')) {
        try {
          await api(`/api/cards/${card.id}`, { method: 'DELETE' });
          closeModal();
          toast('已删除', 'success');
          this.refreshList();
        } catch (e) { toast(e.message, 'error'); }
      }
    };
  },

  async resubmit(body, card, content) {
    const evalBox = $('#rv-eval', body);
    evalBox.innerHTML = '<div class="page-loading"><span class="spin">⏳</span> AI 点评中…</div>';
    try {
      const result = await api(`/api/cards/${card.id}/explain`, { method: 'POST', body: { content } });
      evalBox.innerHTML = this.evalHtml(result.evaluation, result.card);
      const again = $('#rv-again', evalBox);
      if (again) {
        again.onclick = () => {
          const newContent = $('#rv-explain', body).value.trim();
          if (!newContent) { toast('请修改后再提交', 'warning'); return; }
          this.resubmit(body, card, newContent);
        };
      }
    } catch (e) { toast(e.message, 'error'); }
  },

  evalHtml(ev, card) {
    const scores = ev.scores || {};
    const dims = [['准确性', scores['准确性']], ['完整性', scores['完整性']], ['清晰度', scores['清晰度']], ['简洁性', scores['简洁性']]];
    const pass = ev.verdict === 'pass';
    return `
      <div class="section-block" style="border-top:1px dashed var(--border);padding-top:14px">
        <div class="eval-verdict ${pass ? 'pass' : 'fail'}">
          ${pass ? '✅ 讲解通过！' : '❌ 还需要改进'}
          <span style="font-weight:400;font-size:12.5px;margin-left:auto">${card.review_count} 次讲解 · 最佳 ${card.best_score} 分</span>
        </div>
        ${scores['总分'] ? `<div style="font-size:22px;font-weight:800;color:var(--text);margin:8px 0">${scores['总分']}<span style="font-size:13px;color:var(--muted)"> / 40 分</span></div>` : ''}
        ${dims.map(([name, v]) => v ? `
          <div class="score-bar-row">
            <span class="score-bar-label">${name}</span>
            <div class="score-bar-track"><div class="score-bar-fill" style="width:${v * 10}%"></div></div>
            <span class="score-bar-num">${v}</span>
          </div>` : '').join('')}
        <div class="feedback-box"><div class="fb-label">❌ 错误与偏差</div>${escapeHtml(ev.errors || '无')}</div>
        <div class="feedback-box"><div class="fb-label">🔍 遗漏要点</div>${escapeHtml(ev.missed || '无')}</div>
        <div class="feedback-box"><div class="fb-label">💡 改进建议</div>${escapeHtml(ev.advice || '无')}</div>
        ${pass
          ? `<div style="margin-top:10px;font-size:13px;color:var(--success)">🎉 已进入复习队列，下次复习：${formatDateCn(card.due_date)}（${card.interval_days} 天后）</div>`
          : `<div class="modal-actions" style="margin-top:12px"><button class="btn btn-primary" id="rv-again">修改讲解，重新提交</button></div>`}
      </div>`;
  },

  refreshList() {
    const page = $('#page-content');
    if (page) this.render(page);
  }
};
