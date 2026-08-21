"""费曼复习排程（纯函数，可独立测试/客户端复用）。"""
from __future__ import annotations

from datetime import date, timedelta

INTERVALS = [1, 3, 7, 15, 30, 60]


def next_interval(pass_count: int) -> int:
    """连续通过 N 次后的复习间隔（天）。"""
    return INTERVALS[min(max(pass_count, 0), len(INTERVALS) - 1)]


def apply_review(card: dict, verdict: str, score: float) -> dict:
    """根据本次点评结果计算卡片的新状态。
    - pass：review_count 推进，进入复习队列并按间隔排下次
    - fail：review_count 不推进（避免连败后首次通过直接跳到长间隔），当天可重讲
    返回 {status, interval_days, due_date, review_count, best_score}
    """
    today = date.today()
    if verdict == "pass":
        pass_count = card["review_count"] + 1
        interval = next_interval(pass_count)
        return {
            "status": "reviewing",
            "interval_days": interval,
            "due_date": (today + timedelta(days=interval)).isoformat(),
            "review_count": pass_count,
            "best_score": max(card["best_score"] or 0, score),
        }
    return {
        "status": "needs_work",
        "interval_days": 1,
        "due_date": today.isoformat(),
        "review_count": card["review_count"],
        "best_score": card["best_score"],
    }
