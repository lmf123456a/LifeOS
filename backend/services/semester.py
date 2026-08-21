"""学期周次计算（纯函数，供课表/提醒/客户端复用）。"""
from __future__ import annotations

from datetime import date

from .. import database


def week_number(d: date) -> int | None:
    """根据学期开始日期计算第几周。
    - 未设置学期开始 → None（不过滤，全部显示）
    - 开学前 → 0（任何课程的周次范围都不覆盖 → 全部不显示）
    - 开学后 → 1 起的周数
    """
    start_s = database.get_setting("semester_start", "")
    if not start_s:
        return None
    try:
        start = date.fromisoformat(start_s)
    except ValueError:
        return None
    delta = (d - start).days
    if delta < 0:
        return 0
    return delta // 7 + 1


def in_week(course: dict, wn: int | None) -> bool:
    """课程是否在某周上课（周次范围 + 单双周）。"""
    if wn is None:
        return True
    if not (course["week_start"] <= wn <= course["week_end"]):
        return False
    if course["week_type"] == "odd":
        return wn % 2 == 1
    if course["week_type"] == "even":
        return wn % 2 == 0
    return True
