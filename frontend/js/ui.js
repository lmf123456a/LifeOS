/* LifeOS UI 基础工具 */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function formatDateCn(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
}

function formatDateTimeCn(dtStr) {
  if (!dtStr) return '';
  return dtStr.replace('T', ' ').slice(0, 16);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/* ===== Toast（带关闭按钮 + 渐隐动画） ===== */
function toast(msg, type = 'info', ms = 3000) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-msg">${escapeHtml(msg)}</span><button class="toast-close" aria-label="关闭提醒">✕</button>`;
  root.appendChild(el);

  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    el.classList.add('toast-hide');
    setTimeout(() => el.remove(), 360);
  };
  el.querySelector('.toast-close').onclick = hide;
  setTimeout(hide, ms);
}

/* ===== 弹窗 ===== */
function openModal({ title, body, width = 560, onMount = null }) {
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal" style="max-width:${width}px">
        <div class="modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" id="modal-close">✕</button>
        </div>
        <div class="modal-body" id="modal-body">${body}</div>
      </div>
    </div>`;
  $('#modal-close').onclick = closeModal;
  $('#modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  if (onMount) onMount($('#modal-body'));
}

function closeModal() {
  $('#modal-root').innerHTML = '';
}

function modalBody() {
  return $('#modal-body');
}

function confirmDialog(message, okText = '确定') {
  return new Promise(resolve => {
    openModal({
      title: '确认操作',
      width: 420,
      body: `<p style="margin-bottom:6px">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn" id="cf-cancel">取消</button>
          <button class="btn btn-danger" id="cf-ok">${escapeHtml(okText)}</button>
        </div>`,
      onMount: () => {
        $('#cf-cancel').onclick = () => { closeModal(); resolve(false); };
        $('#cf-ok').onclick = () => { closeModal(); resolve(true); };
      }
    });
  });
}

/* ===== 元数据 ===== */
const PRIORITY_META = {
  1: { label: '高', cls: 'badge-pri-1' },
  2: { label: '中', cls: 'badge-pri-2' },
  3: { label: '低', cls: 'badge-pri-3' },
};

const CATEGORY_META = {
  course: { label: '课程', icon: '📘', cls: 'badge-cat-course' },
  book: { label: '书籍', icon: '📖', cls: 'badge-cat-book' },
  language: { label: '语言', icon: '🗣️', cls: 'badge-cat-language' },
  life: { label: '经验', icon: '🌱', cls: 'badge-cat-life' },
};

const CARD_STATUS_META = {
  pending: { label: '待讲解', cls: 'badge-st-pending' },
  needs_work: { label: '待改进', cls: 'badge-st-needs_work' },
  reviewing: { label: '复习中', cls: 'badge-st-reviewing' },
  mastered: { label: '已掌握', cls: 'badge-st-mastered' },
};

function statusBadge(card) {
  const m = CARD_STATUS_META[card.status] || CARD_STATUS_META.pending;
  const overdue = (card.status === 'reviewing' || card.status === 'needs_work') && card.due_date < todayStr();
  const dueText = overdue ? '（已逾期）' : '';
  return `<span class="badge ${m.cls}">${m.label}${dueText}</span>`;
}

function loadingHtml(text = '加载中…') {
  return `<div class="page-loading"><span class="spin">⏳</span> ${escapeHtml(text)}</div>`;
}

/* 数字升温：统计数字从 0 滚动到目标值（尊重减少动效设置） */
function countUp(el, dur = 700) {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const m = (el.textContent || '').match(/^(\d+)(.*)$/);
  if (!m) return;
  const target = +m[1];
  const suffix = m[2];
  const t0 = performance.now();
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* 勾笔如签：任务勾选内嵌的 SVG 对勾 */
function checkSvgHtml() {
  return '<svg class="chk-svg" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4 5 9l4.5-6"/></svg>';
}

/* 自绘线性图标（stroke=currentColor，跟随文字颜色；不依赖系统 emoji 字体） */
const ICON_PATHS = {
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  tasks: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  courses: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  plans: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  habits: '<path d="M12.5 3c.8 2.6 3.8 4.4 3.8 7.9a4.4 4.4 0 0 1-8.8 0c0-1.6.7-3 1.6-4.2.5 1.1 1.5 1.7 2.4 1.8C11 6.6 11.7 4.3 12.5 3z"/>',
  notes: '<path d="M4.5 19A2.5 2.5 0 0 1 7 16.5H19.5V3.5A1 1 0 0 0 18.5 2.5H7A2.5 2.5 0 0 0 4.5 5v14z"/><path d="M4.5 19A2.5 2.5 0 0 0 7 21.5h12.5v-5"/>',
  reviews: '<path d="M20.5 11.5a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20l1.4-3.9A8.5 8.5 0 1 1 20.5 11.5z"/><path d="m12 7 .9 2.1L15 10l-2.1.9L12 13l-.9-2.1L9 10l2.1-.9z"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7"/><path d="M2 20h20"/>',
  reflections: '<path d="M7 3h10M7 21h10"/><path d="M8 3c0 4.8 4 6.4 4 9s-4 4.2-4 9M16 3c0 4.8-4 6.4-4 9s4 4.2 4 9"/>',
  settings: '<path d="M4 7h8.5M16.5 7H20M4 17h3M11 17h9"/><circle cx="14.5" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4z"/>',
};

function iconSvg(name, size = 18) {
  const paths = ICON_PATHS[name] || '';
  return `<svg class="nav-ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
