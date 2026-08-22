/* LifeOS 应用入口：导航 + 页面路由 */
const PAGES = {
  dashboard: { title: '概览', sub: '今天的状态，一目了然', eyebrow: 'Overview', view: DashboardView },
  tasks: { title: '今日规划', sub: '安排每一天的任务', eyebrow: 'Today', view: TasksView },
  courses: { title: '课表', sub: '一周课程一目了然，自动融入行程', eyebrow: 'Timetable', view: CoursesView },
  timers: { title: '项目计时', sub: '正计时 / 倒计时 / 番茄计时，记录每一次专注', eyebrow: 'Focus', view: TimerView },
  plans: { title: '长期计划', sub: '月任务与年任务，盯住大目标', eyebrow: 'Plans', view: PlansView },
  habits: { title: '习惯追踪', sub: '小习惯，大改变', eyebrow: 'Habits', view: HabitsView },
  notes: { title: '知识笔记库', sub: '记录、沉淀、转化', eyebrow: 'Notes', view: NotesView },
  reviews: { title: '费曼复盘', sub: '讲出来，才算真正学会', eyebrow: 'Feynman Review', view: ReviewsView },
  reports: { title: '周 / 月报告', sub: '用数据复盘你的成长', eyebrow: 'Insights', view: ReportsView },
  reflections: { title: '反思总结', sub: '日省、月思、年定，让成长有迹可循', eyebrow: 'Reflection', view: ReflectionsView },
  settings: { title: '设置', sub: 'DeepSeek 接入与个人档案', eyebrow: 'Preferences', view: SettingsView },
};

let currentPage = 'dashboard';

function navigate(page) {
  if (!PAGES[page]) page = 'dashboard';
  currentPage = page;
  if (location.hash !== '#' + page) location.hash = page;
  $$('#nav .nav-item').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const meta = PAGES[page];
  $('#page-header').innerHTML = `<div class="eyebrow">${escapeHtml(meta.eyebrow)}</div><h1>${meta.title}</h1><div class="sub">${meta.sub}</div>`;
  const content = $('#page-content');
  content.innerHTML = '';
  // 仅概览页：进入时允许换一句新的每日美句（其他视图的 _fresh 字段不要动！）
  if (meta.view === DashboardView) meta.view._fresh = true;
  try {
    meta.view.render(content);
  } catch (e) {
    content.innerHTML = `<div class="empty">页面出错：${escapeHtml(e.message)}</div>`;
  }
  updateFooter();
}

function updateFooter() {
  api('/api/cards/due').then(cards => {
    const el = $('#sidebar-footer');
    if (el) {
      const ico = iconSvg('reviews', 14);
      el.innerHTML = cards.length
        ? `<a style="cursor:pointer;display:flex;align-items:center;gap:6px" onclick="navigate('reviews')">${ico}待复习 <span class="due-badge">${cards.length}</span></a>`
        : `<span style="display:flex;align-items:center;gap:6px">${ico}今天没有到期复盘 ✨</span>`;
    }
  }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
  Notify.init();
  TimerManager.init();
  $$('#nav .nav-item').forEach(a => {
    a.onclick = () => navigate(a.dataset.page);
  });
  window.addEventListener('hashchange', () => {
    const page = location.hash.replace('#', '');
    if (page && PAGES[page] && page !== currentPage) {
      currentPage = page;
      navigate(page);
    }
  });
  navigate(location.hash.replace('#', '') || 'dashboard');
  setInterval(updateFooter, 60000);

  /* 服务端版本自检：旧实例没有 /api/version，或 api 号落后 → 提示重启 */
  api('/api/version').then(v => {
    if (v.api < 5) staleServerWarning();
  }).catch(() => staleServerWarning());
});

function staleServerWarning() {
  setTimeout(() => {
    toast('检测到 LifeOS 服务版本过旧（新功能如图片上传不可用），请完全退出后重新启动应用', 'warning', 9000);
  }, 1500);
}
