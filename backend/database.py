"""SQLite 数据层：连接管理 + 建表。"""
import sqlite3
import sys
from pathlib import Path

# 数据目录：打包成 exe 后放在 exe 旁边（便于分发/备份），开发时在项目根
if getattr(sys, "frozen", False):
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "lifeos.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    notes        TEXT DEFAULT '',
    priority     INTEGER DEFAULT 2,          -- 1 高 2 中 3 低
    status       TEXT DEFAULT 'todo',        -- todo | doing | done | cancelled
    due_date     TEXT,                       -- YYYY-MM-DD
    due_time     TEXT,                       -- HH:MM
    created_at   TEXT DEFAULT (datetime('now','localtime')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS habits (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    icon       TEXT DEFAULT '⭐',
    color      TEXT DEFAULT '#f59e0b',
    archived   INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS habit_logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id  INTEGER NOT NULL,
    log_date  TEXT NOT NULL,                 -- YYYY-MM-DD
    completed INTEGER DEFAULT 1,
    UNIQUE(habit_id, log_date),
    FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT DEFAULT '',
    category   TEXT DEFAULT 'course',        -- course | book | language | life
    tags       TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS cards (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    title          TEXT NOT NULL,
    source_content TEXT DEFAULT '',
    key_points     TEXT DEFAULT '',
    explain_prompt TEXT DEFAULT '',
    pitfalls       TEXT DEFAULT '',
    status         TEXT DEFAULT 'pending',   -- pending | needs_work | reviewing | mastered
    interval_days  INTEGER DEFAULT 1,
    due_date       TEXT DEFAULT (date('now','localtime')),
    review_count   INTEGER DEFAULT 0,
    best_score     REAL DEFAULT 0,
    last_reviewed_at TEXT,
    note_id        INTEGER,
    created_at     TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS explanations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    INTEGER NOT NULL,
    content    TEXT NOT NULL,
    ai_feedback TEXT,
    score      REAL,
    verdict    TEXT,                         -- pass | fail
    created_at TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plans (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT NOT NULL,              -- month | year
    period       TEXT NOT NULL,              -- YYYY-MM | YYYY
    title        TEXT NOT NULL,
    notes        TEXT DEFAULT '',
    status       TEXT DEFAULT 'active',      -- active | done | cancelled
    progress     INTEGER DEFAULT 0,          -- 0-100
    created_at   TEXT DEFAULT (datetime('now','localtime')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS courses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    teacher     TEXT DEFAULT '',
    location    TEXT DEFAULT '',
    weekday     INTEGER NOT NULL,            -- 1=周一 .. 7=周日
    start_time  TEXT DEFAULT '08:00',        -- HH:MM
    end_time    TEXT DEFAULT '09:40',        -- HH:MM
    week_start  INTEGER DEFAULT 1,           -- 起止周
    week_end    INTEGER DEFAULT 20,
    week_type   TEXT DEFAULT 'every',        -- every | odd | even
    color       TEXT DEFAULT '#e8893c',
    notes       TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS reflections (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT NOT NULL,                -- day | month | year
    period     TEXT NOT NULL,                -- YYYY-MM-DD | YYYY-MM | YYYY
    title      TEXT DEFAULT '',
    content    TEXT DEFAULT '',
    rating     INTEGER DEFAULT 0,            -- 0-5
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(type, period)
);

CREATE TABLE IF NOT EXISTS timers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    mode             TEXT NOT NULL,          -- stopwatch | countdown | pomodoro
    task_id          INTEGER,
    task_title       TEXT DEFAULT '',
    duration_seconds INTEGER DEFAULT 0,      -- 计划时长（倒计时/番茄工作）
    elapsed_seconds  INTEGER DEFAULT 0,      -- 实际专注秒数
    rounds           INTEGER DEFAULT 0,      -- 番茄完成轮数
    started_at       TEXT DEFAULT (datetime('now','localtime')),
    ended_at         TEXT,
    created_at       TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        _apply_migrations(conn)


# ---- 迁移机制：表结构演进（多设备/多版本就绪）----
MIGRATIONS: list[tuple[int, str]] = [
    # (版本号, DDL)，按顺序应用一次；新版本追加即可，勿改历史条目
    (2, "CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(status, due_date)"),
    (3, "CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status)"),
    (4, "CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at)"),
]


def _apply_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
               version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now','localtime'))
           )"""
    )
    applied = {r[0] for r in conn.execute("SELECT version FROM schema_migrations").fetchall()}
    for version, ddl in sorted(MIGRATIONS):
        if version in applied:
            continue
        conn.execute(ddl)
        conn.execute("INSERT INTO schema_migrations (version) VALUES (?)", (version,))
    conn.commit()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]


def query_one(sql: str, params: tuple = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: tuple = ()) -> int:
    """执行写操作，返回 lastrowid。"""
    with get_conn() as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid


class transaction:
    """多步写操作的事务助手：with database.transaction() as conn: ..."""

    def __enter__(self):
        self._conn = get_conn()
        return self._conn

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()
        return False


def get_setting(key: str, default: str = "") -> str:
    row = query_one("SELECT value FROM settings WHERE key = ?", (key,))
    return row["value"] if row else default
