/* 课表页：周视图 + 课程管理 + Excel 导入 */
const WEEKDAY_CN = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const GRID_START = 8 * 60;    // 08:00
const GRID_END = 22 * 60;     // 22:00
const GRID_H = 840;           // 14 小时 × 60px
const COURSE_COLORS = ['#e8893c', '#4a7fc7', '#4c9e76', '#c25b5b', '#a884d6', '#c98a2d', '#cf7a9d', '#4fa8a0'];

function timeToMin(t) {
  const [h, m] = String(t || '0:00').split(':').map(Number);
  return h * 60 + (m || 0);
}
function weekTypeLabel(c) {
  if (c.week_type === 'odd') return `${c.week_start}-${c.week_end}周·单周`;
  if (c.week_type === 'even') return `${c.week_start}-${c.week_end}周·双周`;
  return `${c.week_start}-${c.week_end}周`;
}

const CoursesView = {
  render(c) {
    c.innerHTML = `
      <div class="toolbar">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <label style="font-size:12px;color:var(--muted-2)">学期开始</label>
          <input type="date" class="input" id="cs-sem" style="width:150px">
          <span class="hint" id="cs-week"></span>
        </div>
        <div class="spacer"></div>
        <button class="btn" id="cs-add">＋ 添加课程</button>
        <button class="btn btn-primary" id="cs-import">导入课表</button>
      </div>
      <div id="cs-grid">${loadingHtml()}</div>
      <div class="card stack">
        <div class="card-title">全部课程 <span id="cs-count" style="font-size:12px;color:var(--muted-2)"></span></div>
        <div id="cs-list"></div>
      </div>`;
    $('#cs-add', c).onclick = () => this.openEdit(c, null);
    $('#cs-import', c).onclick = () => this.openImport(c);
    $('#cs-sem', c).onchange = async (e) => {
      try {
        await api('/api/courses/semester-start', { method: 'PUT', body: { date: e.target.value } });
        toast('学期开始日期已保存', 'success');
        this.load(c);
      } catch (err) { toast(err.message, 'error'); }
    };
    this.load(c);
  },

  async load(c) {
    const gridEl = $('#cs-grid', c);
    const listEl = $('#cs-list', c);
    try {
      const data = await api('/api/courses/week');
      $('#cs-sem', c).value = data.semester_start || '';
      $('#cs-week', c).textContent = data.semester_start
        ? (data.week_number > 0
            ? `· 第 ${data.week_number} 周（今天${WEEKDAY_CN[data.weekday_today - 1]}）`
            : '· 开学前（今日课程暂不融入行程）')
        : '· 未设置学期开始（今日课程不过滤）';

      const courses = data.courses;
      // ===== 周视图 =====
      const axisLabels = [];
      for (let h = 8; h <= 21; h++) {
        axisLabels.push(`<div class="tt-axis-label" style="top:${(h - 8) * 60}px">${String(h).padStart(2, '0')}:00</div>`);
      }
      const todayIdx = data.weekday_today;
      const dayCols = WEEKDAY_CN.map((name, i) => {
        const dayCourses = courses.filter(c => c.weekday === i + 1);
        const blocks = dayCourses.map(c => {
          const top = (timeToMin(c.start_time) - GRID_START) / (GRID_END - GRID_START) * GRID_H;
          const height = Math.max((timeToMin(c.end_time) - timeToMin(c.start_time)) / (GRID_END - GRID_START) * GRID_H, 42);
          return `
            <div class="tt-course" data-id="${c.id}" style="top:${top}px;height:${height}px;background:${c.color}1f;border-left:3px solid ${c.color}"
              title="${escapeHtml(c.name)} · ${c.start_time}-${c.end_time}${c.location ? ' · ' + escapeHtml(c.location) : ''}">
              <div class="tt-course-name">${escapeHtml(c.name)}</div>
              <div class="tt-course-meta">${c.start_time}-${c.end_time}</div>
              ${c.location ? `<div class="tt-course-meta">📍 ${escapeHtml(c.location)}</div>` : ''}
            </div>`;
        }).join('');
        return `
          <div class="tt-day ${i + 1 === todayIdx ? 'today' : ''}" data-day="${i + 1}">
            ${blocks}
          </div>`;
      }).join('');

      gridEl.innerHTML = `
        <div class="tt">
          <div class="tt-header">
            <div class="tt-corner">时间</div>
            ${WEEKDAY_CN.map((n, i) =>
              `<div class="tt-dayhead ${i + 1 === todayIdx ? 'today' : ''}">${n}${i + 1 === todayIdx ? ' · 今天' : ''}</div>`).join('')}
          </div>
          <div class="tt-body">
            <div class="tt-axis">${axisLabels.join('')}</div>
            ${dayCols}
          </div>
        </div>`;

      $$('.tt-course', gridEl).forEach(block => {
        block.onclick = () => {
          const course = courses.find(x => x.id === Number(block.dataset.id));
          if (course) this.openEdit(c, course);
        };
      });

      // ===== 管理列表 =====
      $('#cs-count', c).textContent = `共 ${courses.length} 门`;
      listEl.innerHTML = courses.length ? courses.map(cs => `
        <div class="task-row">
          <div class="course-dot" style="background:${cs.color}"></div>
          <div class="task-main">
            <div class="task-title">${escapeHtml(cs.name)}${cs.teacher ? ` <span style="font-weight:400;color:var(--muted-2);font-size:12px">· ${escapeHtml(cs.teacher)}</span>` : ''}</div>
            <div class="task-meta">
              <span>${WEEKDAY_CN[cs.weekday - 1]}</span>
              <span>⏰ ${cs.start_time}-${cs.end_time}</span>
              <span>${weekTypeLabel(cs)}</span>
              ${cs.location ? `<span>📍 ${escapeHtml(cs.location)}</span>` : ''}
            </div>
          </div>
          <div class="task-actions">
            <button class="icon-btn" data-edit="${cs.id}" title="编辑">✏️</button>
            <button class="icon-btn danger" data-del="${cs.id}" title="删除">🗑️</button>
          </div>
        </div>`).join('') : '<div class="empty"><div class="big">📅</div>还没有课程<br>点「导入课表」上传教务系统导出的 Excel，或「添加课程」手动录入</div>';

      $$('[data-edit]', listEl).forEach(btn => {
        btn.onclick = () => {
          const course = courses.find(x => x.id === Number(btn.dataset.edit));
          if (course) this.openEdit(c, course);
        };
      });
      $$('[data-del]', listEl).forEach(btn => {
        btn.onclick = async () => {
          if (await confirmDialog('删除这门课程吗？', '删除')) {
            try {
              await api(`/api/courses/${btn.dataset.del}`, { method: 'DELETE' });
              toast('已删除', 'success');
              this.load(c);
            } catch (e) { toast(e.message, 'error'); }
          }
        };
      });
    } catch (e) {
      gridEl.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`;
    }
  },

  /* ===== 添加/编辑课程 ===== */
  openEdit(c, course) {
    const data = course || {};
    openModal({
      title: course ? '编辑课程' : '添加课程',
      width: 560,
      body: `
        <div class="field"><label>课程名称 *</label>
          <input class="input" id="cs-name" value="${escapeHtml(data.name || '')}" placeholder="如：高等数学"></div>
        <div class="input-row">
          <div class="field"><label>老师</label>
            <input class="input" id="cs-teacher" value="${escapeHtml(data.teacher || '')}"></div>
          <div class="field"><label>教室</label>
            <input class="input" id="cs-loc" value="${escapeHtml(data.location || '')}" placeholder="如：教三 201"></div>
        </div>
        <div class="input-row">
          <div class="field"><label>星期</label>
            <select class="input" id="cs-wd">
              ${WEEKDAY_CN.map((n, i) => `<option value="${i + 1}" ${(data.weekday || 1) === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}
            </select></div>
          <div class="field"><label>开始时间</label>
            <input type="time" class="input" id="cs-st" value="${data.start_time || '08:00'}"></div>
          <div class="field"><label>结束时间</label>
            <input type="time" class="input" id="cs-et" value="${data.end_time || '09:40'}"></div>
        </div>
        <div class="input-row">
          <div class="field"><label>起周</label>
            <input type="number" class="input" id="cs-ws" value="${data.week_start || 1}" min="1" max="30"></div>
          <div class="field"><label>止周</label>
            <input type="number" class="input" id="cs-we" value="${data.week_end || 20}" min="1" max="30"></div>
          <div class="field"><label>周型</label>
            <select class="input" id="cs-wt">
              <option value="every" ${(data.week_type || 'every') === 'every' ? 'selected' : ''}>每周</option>
              <option value="odd" ${data.week_type === 'odd' ? 'selected' : ''}>单周</option>
              <option value="even" ${data.week_type === 'even' ? 'selected' : ''}>双周</option>
            </select></div>
        </div>
        <div class="field"><label>颜色</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${COURSE_COLORS.map(col => `
              <span class="color-swatch ${(data.color || COURSE_COLORS[0]) === col ? 'sel' : ''}"
                data-color="${col}" style="background:${col}"></span>`).join('')}
          </div></div>
        <div class="modal-actions">
          <button class="btn" id="cs-cancel">取消</button>
          <button class="btn btn-primary" id="cs-save">保存</button>
        </div>`,
      onMount: body => {
        let color = data.color || COURSE_COLORS[0];
        $$('.color-swatch', body).forEach(s => {
          s.onclick = () => {
            $$('.color-swatch', body).forEach(x => x.classList.remove('sel'));
            s.classList.add('sel');
            color = s.dataset.color;
          };
        });
        $('#cs-cancel', body).onclick = closeModal;
        $('#cs-save', body).onclick = async () => {
          const name = $('#cs-name', body).value.trim();
          if (!name) { toast('课程名称不能为空', 'warning'); return; }
          const payload = {
            name,
            teacher: $('#cs-teacher', body).value.trim(),
            location: $('#cs-loc', body).value.trim(),
            weekday: Number($('#cs-wd', body).value),
            start_time: $('#cs-st', body).value || '08:00',
            end_time: $('#cs-et', body).value || '09:40',
            week_start: Number($('#cs-ws', body).value) || 1,
            week_end: Number($('#cs-we', body).value) || 20,
            week_type: $('#cs-wt', body).value,
            color,
          };
          try {
            if (course) await api(`/api/courses/${course.id}`, { method: 'PUT', body: payload });
            else await api('/api/courses', { method: 'POST', body: payload });
            closeModal();
            toast('已保存', 'success');
            this.load(c);
          } catch (e) { toast(e.message, 'error'); }
        };
      }
    });
  },

  /* ===== 导入课表 ===== */
  openImport(c) {
    openModal({
      title: '导入课表',
      width: 780,
      body: `
        <div class="hint" style="margin-bottom:12px">支持教务系统导出的 <b>.xls / .xlsx / .csv</b>，会自动识别「星期一~星期日」表头，解析课程名 / 教室 / 老师 / 单双周 / 起止周。先上传预览，确认无误后再导入。</div>
        <div class="field">
          <input type="file" id="ci-file" accept=".xls,.xlsx,.csv" style="display:none">
          <button class="btn" id="ci-pick">📂 选择课表文件</button>
        </div>
        <div id="ci-result">${loadingHtml('等待选择文件…')}</div>`,
      onMount: body => {
        $('#ci-pick', body).onclick = () => $('#ci-file', body).click();
        $('#ci-file', body).onchange = async (e) => {
          const file = e.target.files[0];
          e.target.value = '';
          if (!file) return;
          const result = $('#ci-result', body);
          result.innerHTML = loadingHtml('解析中…');
          try {
            const fd = new FormData();
            fd.append('file', file);
            const preview = await api('/api/courses/import', { method: 'POST', body: fd });
            if (!preview.courses.length) {
              result.innerHTML = '<div class="empty">没有解析到课程，请确认文件是教务系统导出的课表格式</div>';
              return;
            }
            let mode = 'append';
            result.innerHTML = `
              <div class="hint" style="margin-bottom:8px">解析成功：<b>${preview.count}</b> 门课程（${escapeHtml(preview.filename)}）</div>
              <div style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:10px">
                <table class="preview-table">
                  <thead><tr><th>课程</th><th>星期</th><th>时间</th><th>周次</th><th>教室</th><th>老师</th></tr></thead>
                  <tbody>
                    ${preview.courses.map(c => `
                      <tr>
                        <td>${escapeHtml(c.name)}</td>
                        <td>${WEEKDAY_CN[c.weekday - 1]}</td>
                        <td>${c.start_time}-${c.end_time}</td>
                        <td>${weekTypeLabel(c)}</td>
                        <td>${escapeHtml(c.location || '')}</td>
                        <td>${escapeHtml(c.teacher || '')}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
              <div class="field" style="margin-top:14px">
                <label>导入方式</label>
                <div style="display:flex;gap:18px">
                  <label style="display:flex;gap:6px;align-items:center"><input type="radio" name="ci-mode" value="append" checked> 追加到现有课表</label>
                  <label style="display:flex;gap:6px;align-items:center"><input type="radio" name="ci-mode" value="replace"> 清空后导入（覆盖）</label>
                </div>
              </div>
              <div class="modal-actions" style="margin-top:10px">
                <button class="btn" id="ci-back">重新选择</button>
                <button class="btn btn-primary" id="ci-confirm">确认导入 ${preview.count} 门</button>
              </div>`;
            $('#ci-back', body).onclick = () => { $('#ci-result', body).innerHTML = loadingHtml('等待选择文件…'); };
            $('#ci-confirm', body).onclick = async () => {
              const checked = body.querySelector('input[name="ci-mode"]:checked');
              mode = checked ? checked.value : 'append';
              const btn = $('#ci-confirm', body);
              btn.disabled = true;
              btn.innerHTML = '<span class="spin">⏳</span> 导入中…';
              try {
                const r = await api('/api/courses/import/confirm', { method: 'POST', body: { courses: preview.courses, mode } });
                closeModal();
                toast(`已导入 ${r.count} 门课程`, 'success');
                this.load(c);
              } catch (err) {
                toast(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = `确认导入 ${preview.count} 门`;
              }
            };
          } catch (err) {
            result.innerHTML = `<div class="empty">导入失败：${escapeHtml(err.message)}</div>`;
          }
        };
      }
    });
  }
};
