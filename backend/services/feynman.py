"""费曼学习法：提示词构建 + AI 输出解析。"""
from __future__ import annotations

import re

from . import ai


def _profile_line(profile: str) -> str:
    p = (profile or "").strip()
    return f"\n学习者背景：{p}" if p else ""


def build_generate_prompt(content: str, profile: str = "") -> str:
    """把投喂的学习内容变成费曼讲解任务。"""
    return f"""你是一位经验丰富的费曼学习法教练。用户把一段学习内容投喂给你，请帮他把内容拆解成可讲解的费曼任务。

---学习内容---
{content[:8000]}
---内容结束---

请完成三件事：
1. 【核心要点】把内容拆解成 3~6 个核心概念/要点，每个要点用一句话说清"是什么、为什么重要"。
2. 【讲解任务】生成一个明确的讲解任务：要求用户用自己的话、像给一个完全不懂的小学生讲课一样，讲清楚上面内容（讲整体或聚焦一个核心点，由你指定）。要求必须包含：要讲清哪些概念、必须用到的关键术语、禁止使用的术语（如果内容里有专业黑话，要求用户换成大白话）。
3. 【易错点】列出 2~3 个学习时最容易出错或忽略的地方，提示用户在讲解时特别留意。

严格按以下格式输出（不要输出其他内容）：
【核心要点】
1. ...
2. ...
【讲解任务】
...
【易错点】
- ...
- ...{_profile_line(profile)}"""


def parse_generate(text: str) -> dict:
    def grab(section: str) -> str:
        m = re.search(rf"【{section}】\s*(.*?)(?=【|$)", text, re.S)
        return m.group(1).strip() if m else ""

    return {
        "key_points": grab("核心要点"),
        "explain_prompt": grab("讲解任务"),
        "pitfalls": grab("易错点"),
    }


def build_evaluate_prompt(topic: str, explanation: str, profile: str = "") -> str:
    """点评学生的费曼讲解。"""
    return f"""你是一位严格的费曼学习法教练，正在评估学生围绕主题的讲解质量。

---讲解主题---
{topic[:2000]}
---主题结束---

---学生的讲解---
{explanation[:8000]}
---讲解结束---

请从四个维度打分（每项 1~10 分）：
- 准确性：有没有讲错、讲偏、编造事实
- 完整性：该讲到的核心概念是否都覆盖了
- 清晰度：逻辑是否通顺、别人能否听懂
- 简洁性：是否啰嗦、是否用了不必要的术语

然后：
1. 指出讲解中的错误或明显偏差（没有就写"无"）
2. 指出遗漏的关键要点（没有就写"无"）
3. 给出 2~3 条具体、可执行的改进建议
4. 给出结论：pass（基本掌握，可以安排间隔复习）或 fail（有明显错误或重大遗漏，需要修改后重新讲解）

严格按以下格式输出（不要输出其他内容）：
【评分】准确性:x 完整性:x 清晰度:x 简洁性:x 总分:x
【错误与偏差】...
【遗漏要点】...
【改进建议】...
【结论】pass|fail{_profile_line(profile)}"""


def parse_evaluate(text: str) -> dict:
    scores = {}
    m = re.search(r"【评分】\s*(.+)", text)
    if m:
        line = m.group(1)
        for key in ("准确性", "完整性", "清晰度", "简洁性", "总分"):
            sm = re.search(rf"{key}:?\s*(\d+(?:\.\d+)?)", line)
            if sm:
                scores[key] = float(sm.group(1))

    def grab(section: str) -> str:
        m = re.search(rf"【{section}】\s*(.*?)(?=【|$)", text, re.S)
        return m.group(1).strip() if m else ""

    verdict_m = re.search(r"【结论】\s*(pass|fail)", text, re.I)
    return {
        "scores": scores,
        "errors": grab("错误与偏差"),
        "missed": grab("遗漏要点"),
        "advice": grab("改进建议"),
        "verdict": verdict_m.group(1).lower() if verdict_m else "fail",
    }


def build_report_prompt(range_name: str, stats_text: str, profile: str = "") -> str:
    return f"""你是用户的个人成长助手。请根据下面这{range_name}的真实数据，用温暖、鼓励但不空洞的语气，写一段 180 字以内的复盘总结：先肯定做得好的地方，再温和指出一个最值得改进的点，最后给一条具体可行的下周/下月建议。不要编造数据，不要用"我"称呼自己。

---数据---
{stats_text[:4000]}
---数据结束---{_profile_line(profile)}"""
