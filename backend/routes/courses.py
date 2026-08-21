"""课程表：CRUD + 周课表/今日课程 + Excel 导入（预览 → 确认）。"""
from __future__ import annotations

import re
import zipfile
from datetime import date

from fastapi import APIRouter, File, HTTPException, UploadFile

from .. import database
from ..services import course_parser, semester

router = APIRouter(prefix="/api/courses", tags=["courses"])

TIME_RE = re.compile(r"^\d{2}:\d{2}$")
WEEK_TYPES = ("every", "odd", "even")


def _validate_course(c: dict) -> None:
    """create/update/import 共用的服务端校验。"""
    try:
        weekday = int(c.get("weekday", 1))
    except (TypeError, ValueError):
        raise HTTPException(400, "星期必须为 1-7 的数字")
    if not 1 <= weekday <= 7:
        raise HTTPException(400, "星期必须为 1-7")
    try:
        ws, we = int(c.get("week_start", 1)), int(c.get("week_end", 20))
    except (TypeError, ValueError):
        raise HTTPException(400, "起止周必须是数字")
    if not (1 <= ws <= we <= 53):
        raise HTTPException(400, "起止周范围不合法（1 <= 起周 <= 止周 <= 53）")
    wt = c.get("week_type", "every")
    if wt not in WEEK_TYPES:
        raise HTTPException(400, "周型必须是 every/odd/even")
    for key in ("start_time", "end_time"):
        v = c.get(key, "")
        if v and not TIME_RE.match(v):
            raise HTTPException(400, f"时间格式应为 HH:MM：{v}")


@router.get("")
def list_courses():
    return database.query("SELECT * FROM courses ORDER BY weekday, start_time, id")


@router.get("/week")
def week_courses(date_str: str = ""):
    """课表周视图：返回完整课表（静态参考，不做周次过滤），
    周次/开学信息仅用于页面提示。今日课程才做严格过滤。"""
    try:
        d = date.fromisoformat(date_str) if date_str else date.today()
    except ValueError:
        raise HTTPException(400, "日期格式应为 YYYY-MM-DD")
    wn = semester.week_number(d)
    courses = database.query("SELECT * FROM courses ORDER BY weekday, start_time")
    return {
        "week_date": d.isoformat(),
        "week_number": wn,
        "weekday_today": d.isoweekday(),
        "semester_start": database.get_setting("semester_start", ""),
        "courses": courses,
    }


@router.get("/today")
def today_courses():
    today = date.today()
    wn = semester.week_number(today)
    courses = database.query(
        "SELECT * FROM courses WHERE weekday = ? ORDER BY start_time",
        (today.isoweekday(),),
    )
    return {
        "date": today.isoformat(),
        "week_number": wn,
        "courses": [c for c in courses if semester.in_week(c, wn)],
    }


@router.post("")
def create_course(body: dict):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "课程名称不能为空")
    _validate_course(body)
    cid = database.execute(
        """INSERT INTO courses (name, teacher, location, weekday, start_time, end_time,
           week_start, week_end, week_type, color, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            name,
            body.get("teacher", ""),
            body.get("location", ""),
            int(body.get("weekday", 1)),
            body.get("start_time", "08:00"),
            body.get("end_time", "09:40"),
            int(body.get("week_start", 1)),
            int(body.get("week_end", 20)),
            body.get("week_type", "every"),
            body.get("color", "#e8893c"),
            body.get("notes", ""),
        ),
    )
    return database.query_one("SELECT * FROM courses WHERE id = ?", (cid,))


@router.put("/semester-start")
def set_semester_start(body: dict):
    value = (body.get("date") or "").strip()
    if value:
        try:
            date.fromisoformat(value)
        except ValueError:
            raise HTTPException(400, "日期格式应为 YYYY-MM-DD")
    database.execute(
        "INSERT INTO settings (key, value) VALUES ('semester_start', ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (value,),
    )
    return {"ok": True, "semester_start": value}


@router.put("/{cid}")
def update_course(cid: int, body: dict):
    course = database.query_one("SELECT * FROM courses WHERE id = ?", (cid,))
    if not course:
        raise HTTPException(404, "课程不存在")
    merged = {**course, **{k: v for k, v in body.items() if v is not None}}
    _validate_course(merged)
    database.execute(
        """UPDATE courses SET name=?, teacher=?, location=?, weekday=?, start_time=?,
           end_time=?, week_start=?, week_end=?, week_type=?, color=?, notes=? WHERE id=?""",
        (
            body.get("name", course["name"]),
            body.get("teacher", course["teacher"]),
            body.get("location", course["location"]),
            int(body.get("weekday", course["weekday"])),
            body.get("start_time", course["start_time"]),
            body.get("end_time", course["end_time"]),
            int(body.get("week_start", course["week_start"])),
            int(body.get("week_end", course["week_end"])),
            body.get("week_type", course["week_type"]),
            body.get("color", course["color"]),
            body.get("notes", course["notes"]),
            cid,
        ),
    )
    return database.query_one("SELECT * FROM courses WHERE id = ?", (cid,))


@router.delete("/{cid}")
def delete_course(cid: int):
    database.execute("DELETE FROM courses WHERE id = ?", (cid,))
    return {"ok": True}


@router.post("/import")
async def import_preview(file: UploadFile = File(...)):
    """上传 Excel/CSV → 解析 → 返回预览（不写入数据库）。"""
    data = await file.read()
    if not data:
        raise HTTPException(400, "文件内容为空")
    try:
        result = course_parser.parse_file(file.filename or "", data)
    except (ValueError, OSError, zipfile.BadZipFile) as e:
        raise HTTPException(400, f"文件解析失败：{e}") from e
    if result.get("error"):
        raise HTTPException(400, result["error"])
    return {
        "filename": file.filename,
        "sheet": result.get("sheet", ""),
        "header_row": result.get("header_row", 0),
        "count": len(result["courses"]),
        "courses": result["courses"],
        "warnings": result.get("warnings", []),
    }


@router.post("/import/confirm")
def import_confirm(body: dict):
    """确认导入：mode=append 追加 / replace 覆盖。导入前服务端二次校验。"""
    courses = body.get("courses")
    if not isinstance(courses, list) or not courses:
        raise HTTPException(400, "没有可导入的课程")
    mode = body.get("mode", "append")
    if mode not in ("append", "replace"):
        raise HTTPException(400, "mode 必须是 append 或 replace")
    for c in courses:
        if not isinstance(c, dict):
            raise HTTPException(400, "课程数据格式不正确")
        _validate_course(c)
    with database.transaction() as conn:
        if mode == "replace":
            conn.execute("DELETE FROM courses")
        for c in courses:
            conn.execute(
                """INSERT INTO courses (name, teacher, location, weekday, start_time, end_time,
                   week_start, week_end, week_type, color)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    c.get("name", ""),
                    c.get("teacher", ""),
                    c.get("location", ""),
                    int(c.get("weekday", 1)),
                    c.get("start_time", "08:00"),
                    c.get("end_time", "09:40"),
                    int(c.get("week_start", 1)),
                    int(c.get("week_end", 20)),
                    c.get("week_type", "every"),
                    c.get("color", "#e8893c"),
                ),
            )
    return {"ok": True, "count": len(courses), "mode": mode}
