/* LifeOS 提醒轮询：到期任务 / 复盘卡片 / 习惯打卡 */
const Notify = {
  enabled: true,
  notified: new Set(JSON.parse(localStorage.getItem('lifeos_notified') || '[]')),

  init() {
    api('/api/settings').then(s => {
      this.enabled = s.notify_enabled !== '0';
    }).catch(() => {});
    if ('Notification' in window) {
      try { Notification.requestPermission(); } catch (e) { /* WebView2 可能不支持 */ }
    }
    this.check();
    setInterval(() => this.check(), 60000);
    // 定期压缩已通知记录，防止无限增长
    setInterval(() => {
      const arr = [...this.notified];
      if (arr.length > 300) this.notified = new Set(arr.slice(-200));
      localStorage.setItem('lifeos_notified', JSON.stringify([...this.notified]));
    }, 120000);
  },

  async check() {
    if (!this.enabled) return;
    let r;
    try { r = await api('/api/reminders'); } catch (e) { return; }
    const today = r.date;
    const fired = [];

    for (const t of r.time_tasks) {
      const key = `task-${t.id}-${today}`;
      if (!this.notified.has(key)) {
        this.notified.add(key);
        fired.push(`⏰ 任务时间到：《${t.title}》（${t.due_time}）`);
      }
    }
    for (const c of r.due_cards) {
      const key = `card-${c.id}-${today}`;
      if (!this.notified.has(key)) {
        this.notified.add(key);
        fired.push(`🧠 复盘卡片到期：《${c.title}》，去费曼一下！`);
      }
    }
    if (r.undone_habits.length && r.time >= '18:00') {
      const key = `habit-${today}`;
      if (!this.notified.has(key)) {
        this.notified.add(key);
        fired.push(`🔥 今天还有习惯没打卡：${r.undone_habits.map(h => h.name).join('、')}`);
      }
    }
    for (const c of (r.upcoming_courses || [])) {
      const key = `course-${c.id}-${today}-${c.start_time}`;
      if (!this.notified.has(key)) {
        this.notified.add(key);
        fired.push(`📚 即将上课：《${c.name}》${c.start_time}${c.location ? ' · ' + c.location : ''}`);
      }
    }
    for (const msg of fired) this.fire(msg);
  },

  fire(msg) {
    toast(msg, 'warning', 6000);
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('LifeOS 提醒', { body: msg });
      } catch (e) { /* 忽略 */ }
    }
  }
};
