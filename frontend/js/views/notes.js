/* 知识笔记库 */
const NotesView = {
  category: '',
  keyword: '',

  render(c) {
    c.innerHTML = `
      <div class="toolbar">
        <input class="input search-input" id="note-search" placeholder="🔍 搜索标题 / 内容 / 标签" value="${escapeHtml(this.keyword)}">
        <div class="spacer"></div>
        <button class="btn btn-primary" id="note-add">＋ 新建笔记</button>
      </div>
      <div class="tabs" id="note-tabs">
        ${[['', '全部'], ...Object.entries(CATEGORY_META).map(([k, v]) => [k, `${v.icon} ${v.label}`])]
          .map(([k, label]) => `<div class="tab ${this.category === k ? 'active' : ''}" data-cat="${k}">${label}</div>`).join('')}
      </div>
      <div id="note-list">${loadingHtml()}</div>`;
    $('#note-search').oninput = e => {
      this.keyword = e.target.value;
      this.load(c);
    };
    $('#note-add').onclick = () => this.openEditor(c, null);
    $$('#note-tabs .tab', c).forEach(tab => {
      tab.onclick = () => { this.category = tab.dataset.cat; this.render(c); };
    });
    this.load(c);
  },

  async load(c) {
    const listEl = $('#note-list', c);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (this.category) params.set('category', this.category);
      if (this.keyword.trim()) params.set('q', this.keyword.trim());
      const notes = await api(`/api/notes?${params}`);
      if (!notes.length) {
        listEl.innerHTML = '<div class="empty"><div class="big">📚</div>没有找到笔记</div>';
        return;
      }
      listEl.innerHTML = `
        <div class="grid grid-2">
          ${notes.map(n => {
            const m = CATEGORY_META[n.category] || CATEGORY_META.course;
            return `
              <div class="card note-card" data-id="${n.id}">
                <div class="note-title">${m.icon} ${escapeHtml(n.title)}</div>
                ${n.excerpt ? `<div class="note-excerpt">${escapeHtml(n.excerpt)}</div>` : ''}
                <div class="note-meta">
                  <div>
                    <span class="badge ${m.cls}">${m.label}</span>
                    ${(n.tags || '').split(',').filter(Boolean).map(t => `<span class="tag">${escapeHtml(t.trim())}</span>`).join('')}
                  </div>
                  <span>${escapeHtml(formatDateTimeCn(n.updated_at))}</span>
                </div>
              </div>`;
          }).join('')}
        </div>`;
      $$('.note-card', c).forEach(card => {
        card.onclick = () => this.openEditor(c, card.dataset.id);
      });
    } catch (e) {
      listEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  async openEditor(c, noteId) {
    let data = { title: '', content: '', category: this.category || 'course', tags: '' };
    if (noteId) {
      try { data = await api(`/api/notes/${noteId}`); } catch (e) { toast(e.message, 'error'); return; }
    }
    openModal({
      title: noteId ? '编辑笔记' : '新建笔记',
      width: 760,
      body: `
        <div class="field"><label>标题 *</label>
          <input class="input" id="n-title" value="${escapeHtml(data.title)}" placeholder="笔记标题"></div>
        <div class="input-row">
          <div class="field"><label>分类</label>
            <select class="input" id="n-category">
              ${Object.entries(CATEGORY_META).map(([k, v]) =>
                `<option value="${k}" ${data.category === k ? 'selected' : ''}>${v.icon} ${v.label}</option>`).join('')}
            </select></div>
          <div class="field"><label>标签（逗号分隔）</label>
            <input class="input" id="n-tags" value="${escapeHtml(data.tags || '')}" placeholder="如：高数, 第一章"></div>
        </div>
        <div class="field"><label>内容（支持 Markdown）</label>
          <textarea class="textarea" id="n-content" style="min-height:260px"
            placeholder="开始记录…">${escapeHtml(data.content)}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-sm" id="n-img">🖼️ 插入图片</button>
          <span class="hint">支持 png/jpg/gif/webp，也可以直接 Ctrl+V 粘贴截图</span>
          <input type="file" id="n-img-file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" multiple style="display:none">
        </div></div>
        <div class="editor-preview" id="n-preview"></div>
        <div class="modal-actions">
          ${noteId ? `<button class="btn" id="n-feynman">🧠 生成复盘卡片</button>` : ''}
          <div class="spacer" style="flex:1"></div>
          <button class="btn" id="n-cancel">取消</button>
          <button class="btn btn-primary" id="n-save">保存</button>
        </div>`,
      onMount: body => {
        const contentEl = () => $('#n-content', body);
        const preview = () => {
          $('#n-preview', body).innerHTML = `<div class="section-label">预览</div>` + mdToHtml(contentEl().value);
        };
        contentEl().addEventListener('input', preview);
        preview();
        $('#n-cancel', body).onclick = closeModal;

        /* ---- 图片插入 ---- */
        const insertAtCursor = (ta, text) => {
          const start = ta.selectionStart, end = ta.selectionEnd;
          ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
          ta.selectionStart = ta.selectionEnd = start + text.length;
          ta.focus();
          ta.dispatchEvent(new Event('input'));
        };
        const uploadAndInsert = async (file) => {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const res = await api('/api/files/image', { method: 'POST', body: fd });
            insertAtCursor(contentEl(), `\n![${escapeHtml(file.name.replace(/\.[^.]+$/, ''))}](${res.url})\n`);
            toast('图片已插入', 'success');
          } catch (e) {
            const hint = e.message.includes('404') || e.message.includes('无法连接')
              ? ' —— 服务版本过旧或未启动，请完全退出 LifeOS 后重新启动'
              : '';
            toast(e.message + hint, 'error', 6000);
          }
        };
        $('#n-img', body).onclick = () => $('#n-img-file', body).click();
        $('#n-img-file', body).onchange = async (e) => {
          const files = [...e.target.files];
          e.target.value = '';
          for (const f of files) await uploadAndInsert(f);
        };
        contentEl().addEventListener('paste', (e) => {
          const cd = e.clipboardData;
          if (!cd) return;
          // 1) 剪贴板直接带图片数据（截图粘贴等）
          for (const item of cd.items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              e.preventDefault();
              uploadAndInsert(item.getAsFile());
              return;
            }
          }
          // 2) 剪贴板是本地图片文件路径（Explorer 复制文件 / 复制路径）
          const localPath = detectLocalImagePath(cd.getData('text/uri-list') || '')
            || detectLocalImagePath(cd.getData('text/plain') || '');
          if (localPath) {
            e.preventDefault();
            uploadByPath(localPath);
          }
        });
        // 直接把图片文件拖进编辑框也能插入
        ['dragover', 'drop'].forEach(ev => {
          contentEl().addEventListener(ev, (e) => {
            e.preventDefault();
            if (ev === 'drop') {
              const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
              files.forEach(uploadAndInsert);
            }
          });
        });

        // 识别粘贴文本里的本地图片路径：C:\...\x.png / file:///C:/.../x.png
        function detectLocalImagePath(text) {
          const m = String(text || '').trim().match(/^(?:file:\/\/\/)?([A-Za-z]:[\\/][^\s]+)\.(png|jpe?g|gif|webp|bmp)$/i);
          return m ? m[1] + '.' + m[2].toLowerCase() : null;
        }
        async function uploadByPath(localPath) {
          try {
            const res = await api('/api/files/image-by-path', { method: 'POST', body: { path: localPath } });
            const name = localPath.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
            insertAtCursor(contentEl(), `\n![${escapeHtml(name)}](${res.url})\n`);
            toast('图片已插入', 'success');
          } catch (e) {
            toast(e.message, 'error', 6000);
          }
        }

        $('#n-save', body).onclick = async () => {
          const title = $('#n-title', body).value.trim();
          if (!title) { toast('标题不能为空', 'warning'); return; }
          const payload = {
            title,
            content: $('#n-content', body).value,
            category: $('#n-category', body).value,
            tags: $('#n-tags', body).value,
          };
          try {
            if (noteId) await api(`/api/notes/${noteId}`, { method: 'PUT', body: payload });
            else await api('/api/notes', { method: 'POST', body: payload });
            closeModal();
            toast('笔记已保存', 'success');
            this.load(c);
          } catch (e) { toast(e.message, 'error'); }
        };
        const feynmanBtn = $('#n-feynman', body);
        if (feynmanBtn) {
          feynmanBtn.onclick = async () => {
            const title = $('#n-title', body).value.trim() || '未命名笔记';
            const content = $('#n-content', body).value;
            try {
              const card = await api('/api/cards', { method: 'POST', body: { title: `📄 ${title}`, source_content: content, note_id: noteId } });
              closeModal();
              toast('复盘卡片已创建', 'success');
              navigate('reviews');
              ReviewsView.openDetail(card.id);
            } catch (e) { toast(e.message, 'error'); }
          };
        }
      }
    });
  }
};
