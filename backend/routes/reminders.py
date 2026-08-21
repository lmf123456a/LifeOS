"""提醒中心：返回当前需要提醒的事项。"""
from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter

from .. import database
from ..services import semester

router = APIRouter(prefix="/api/reminders", tags=["reminders"])


@router.get("")
def get_reminders():
    today = date.today().isoformat()
    now = datetime.now().strftime("%H:%M")

    # 1) 今天带时间、且时间已到、未完成的任务
    time_tasks = database.query(
        """SELECT id, title, due_time FROM tasks
           WHERE due_date = ? AND status IN ('todo','doing')
             AND due_time IS NOT NULL AND due_time <= ?
           ORDER BY due_time""",
        (today, now),
    )

    # 2) 到期的复盘卡片
    due_cards = database.query(
        """SELECT id, title FROM cards
           WHERE status IN ('pending','needs_work','reviewing') AND due_date <= ?
           ORDER BY due_date""",
        (today,),
    )

    # 3) 今天还没打卡的习惯
    habits = database.query("SELECT * FROM habits WHERE archived = 0 ORDER BY id")
    undone_habits = [
        {"id": h["id"], "name": h["name"], "icon": h["icon"]}
        for h in habits
        if not database.query_one(
            "SELECT 1 FROM habit_logs WHERE habit_id = ? AND log_date = ?",
            (h["id"], today),
        )
    ]

    # 4) 30 分钟内即将开始的课程
    upcoming_courses = []
    wn = semester.week_number(date.today())
    now_dt = datetime.now()
    for c in database.query(
        "SELECT * FROM courses WHERE weekday = ?",
        (date.today().isoweekday(),),
    ):
        if not semester.in_week(c, wn):
            continue
        try:
            start = datetime.strptime(c["start_time"], "%H:%M").time()
        except ValueError:
            continue
        start_dt = datetime.combine(date.today(), start)
        mins = (start_dt - now_dt).total_seconds() / 60
        if 0 <= mins <= 30:
            upcoming_courses.append(
                {
                    "id": c["id"],
                    "name": c["name"],
                    "location": c["location"],
                    "start_time": c["start_time"],
                }
            )

    return {
        "date": today,
        "time": now,
        "time_tasks": time_tasks,
        "due_cards": due_cards,
        "undone_habits": undone_habits,
        "upcoming_courses": upcoming_courses,
    }
