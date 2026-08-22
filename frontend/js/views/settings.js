/* 设置页 */
const SettingsView = {
  render(c) {
    c.innerHTML = loadingHtml();
    api('/api/settings').then(s => {
      c.innerHTML = `
        <div class="card" style="max-width:660px">
          <div class="card-title">DeepSeek AI 接入</div>
          <div class="field"><label>API Key</label>
            <input type="password" class="input" id="s-key" value="${escapeHtml(s.deepseek_api_key)}" placeholder="sk-...">
            <div class="hint">用于费曼讲解点评、讲解任务生成、周/月总结。可在 platform.deepseek.com 申请。</div></div>
          <div class="input-row">
            <div class="field"><label>Base URL</label>
              <input class="input" id="s-url" value="${escapeHtml(s.deepseek_base_url)}"></div>
            <div class="field"><label>模型</label>
              <input class="input" id="s-model" value="${escapeHtml(s.deepseek_model)}" style="width:190px"></div>
          </div>
          <div class="field" style="margin-top:2px">
            <span class="badge ${s.configured ? 'badge-st-mastered' : 'badge-st-needs_work'}">${s.configured ? '已配置 ✓' : '未配置 API Key'}</span>
          </div>
          <div class="field"><label>个人档案（让 AI 更懂你，可选）</label>
            <textarea class="textarea" id="s-profile" style="min-height:100px" placeholder="如：大三计算机专业，正在学概率论、准备六级，目标是考研…">${escapeHtml(s.profile)}</textarea></div>
          <div class="modal-actions" style="margin-top:8px">
            <button class="btn" id="s-test">🔌 测试连接</button>
            <div class="spacer" style="flex:1"></div>
            <button class="btn btn-primary" id="s-save">保存设置</button>
          </div>
          <div id="s-result"></div>
        </div>
        <div class="card" style="max-width:660px;margin-top:16px">
          <div class="card-title">提醒</div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px">
            <input type="checkbox" id="s-notify" ${s.notify_enabled === '1' ? 'checked' : ''} style="width:17px;height:17px;accent-color:var(--accent)">
            启用提醒：任务到点 / 复盘卡片到期 / 晚 18 点习惯未打卡
          </label>
          <div class="hint">应用运行期间每分钟检查一次，会在应用内弹提醒；系统通知需要浏览器/WebView 允许通知权限。</div>
        </div>
        <div class="card" style="max-width:660px;margin-top:16px">
          <div class="card-title">桌面悬浮窗</div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px">
            <input type="checkbox" id="s-float" ${s.float_enabled === '1' ? 'checked' : ''} style="width:17px;height:17px;accent-color:var(--accent)">
            显示常驻悬浮窗（右下角：今日计划滚动 / 计时显示）
          </label>
          <div class="hint">悬浮窗可拖动；点右上角 × 立即关闭并记住选择；重新开启需重启应用生效。</div>
        </div>
        <div class="card" style="max-width:660px;margin-top:16px">
          <div class="card-title">数据备份</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn" id="b-export">📤 导出备份（JSON）</button>
            <button class="btn" id="b-import">📥 导入备份</button>
            <button class="btn" id="b-export-md">📝 导出笔记为 Markdown</button>
            <input type="file" id="b-file" accept=".json,application/json" style="display:none">
          </div>
          <div class="hint" id="b-info" style="margin-top:10px">
            导出时会在 <code>data\backups</code> 自动保存一份副本；导入会<b>覆盖</b>当前全部数据（建议先导出）；笔记 Markdown 导出到 <code>data\exports</code>，可用于迁移到 Obsidian / Notion。
          </div>
          <div id="b-result"></div>
        </div>`;

      const result = $('#s-result', c);
      $('#s-test', c).onclick = async () => {
        const btn = $('#s-test', c);
        result.innerHTML = '<div class="hint">测试中…</div>';
        btn.disabled = true;
        try {
          const r = await api('/api/settings/test', { method: 'POST' });
          result.innerHTML = `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:var(--success-soft);color:var(--success-deep);font-size:13px">✅ ${escapeHtml(r.message)}</div>`;
        } catch (e) {
          result.innerHTML = `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;background:var(--danger-soft);color:var(--danger-deep);font-size:13px">❌ ${escapeHtml(e.message)}</div>`;
        }
        btn.disabled = false;
      };
      $('#s-save', c).onclick = async () => {
        const btn = $('#s-save', c);
        btn.disabled = true;
        try {
          await api('/api/settings', {
            method: 'PUT',
            body: {
              deepseek_api_key: $('#s-key', c).value.trim(),
              deepseek_base_url: $('#s-url', c).value.trim(),
              deepseek_model: $('#s-model', c).value.trim(),
              profile: $('#s-profile', c).value,
            },
          });
          toast('设置已保存', 'success');
          setTimeout(() => this.render(c), 400);
        } catch (e) {
          toast(e.message, 'error');
        }
        btn.disabled = false;
      };

      /* ---- 提醒开关 ---- */
      $('#s-notify', c).onchange = async (e) => {
        try {
          await api('/api/settings', { method: 'PUT', body: { notify_enabled: e.target.checked ? '1' : '0' } });
          toast(e.target.checked ? '提醒已开启' : '提醒已关闭', 'success');
        } catch (err) {
          toast(err.message, 'error');
          e.target.checked = !e.target.checked;
        }
      };

      /* ---- 悬浮窗开关 ---- */
      $('#s-float', c).onchange = async (e) => {
        try {
          await api('/api/settings', { method: 'PUT', body: { float_enabled: e.target.checked ? '1' : '0' } });
          toast(e.target.checked ? '悬浮窗已开启，重启后生效' : '悬浮窗已关闭（当前窗口可点 × 立即关闭）', 'success');
        } catch (err) {
          toast(err.message, 'error');
          e.target.checked = !e.target.checked;
        }
      };

      /* ---- 数据备份 ---- */
      const bInfo = $('#b-info', c);
      const bResult = $('#b-result', c);
      const showBResult = (html, ok) => {
        bResult.innerHTML = `<div style="margin-top:10px;padding:10px 14px;border-radius:8px;font-size:13px;background:${ok ? 'var(--success-soft)' : 'var(--danger-soft)'};color:${ok ? 'var(--success)' : 'var(--danger)'}">${html}</div>`;
      };
      $('#b-export', c).onclick = async () => {
        const btn = $('#b-export', c);
        btn.disabled = true;
        btn.innerHTML = '<span class="spin">⏳</span> 导出中…';
        try {
          const r = await api('/api/backup/export');
          // 触发浏览器下载（WebView2 会存到默认下载目录）
          const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = r.backup_file.split('/').pop();
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
          showBResult(`✅ 已导出，本地副本保存在 <code>data\\${escapeHtml(r.backup_file)}</code>`, true);
          toast('备份导出成功', 'success');
        } catch (e) {
          showBResult(`❌ ${escapeHtml(e.message)}`, false);
        }
        btn.disabled = false;
        btn.innerHTML = '📤 导出备份（JSON）';
      };
      $('#b-import', c).onclick = () => $('#b-file', c).click();
      $('#b-file', c).onchange = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!(await confirmDialog('导入将<b>覆盖当前全部数据</b>（任务/习惯/笔记/复盘/设置），确定继续吗？建议先导出备份。', '覆盖导入'))) return;
          const r = await api('/api/backup/import', { method: 'POST', body: { data } });
          showBResult(`✅ 导入成功：任务 ${r.counts.tasks} · 习惯 ${r.counts.habits} · 笔记 ${r.counts.notes} · 复盘卡片 ${r.counts.cards}`, true);
          toast('数据导入成功', 'success');
        } catch (err) {
          showBResult(`❌ 导入失败：${escapeHtml(err.message)}`, false);
        }
      };
      $('#b-export-md', c).onclick = async () => {
        const btn = $('#b-export-md', c);
        btn.disabled = true;
        btn.innerHTML = '<span class="spin">⏳</span> 导出中…';
        try {
          const r = await api('/api/backup/notes/markdown');
          showBResult(`✅ 已导出 ${r.count} 篇笔记到 <code>data\\${escapeHtml(r.dir)}</code>`, true);
          toast('笔记导出成功', 'success');
        } catch (e) {
          showBResult(`❌ ${escapeHtml(e.message)}`, false);
        }
        btn.disabled = false;
        btn.innerHTML = '📝 导出笔记为 Markdown';
      };
    }).catch(e => {
      c.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    });
  }
};
