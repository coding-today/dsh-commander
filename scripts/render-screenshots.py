#!/usr/bin/env python3
"""把真实运行输出渲染成 README 用的终端截图。

设计取舍：
- 图不是「截屏」是**转录渲染**：源文件 `docs/screenshots/src/*.txt` 由真跑的命令输出保存而来，
  渲染只是把它画成终端样式，所以每次输出变化都能 diff 出来、重新生成。
- 只用系统自带字体（Menlo + Hiragino Sans GB），不下载任何资源。

用法：
    python3 scripts/render-screenshots.py            # 渲染全部
    python3 scripts/render-screenshots.py gate-blocked   # 只渲染一张
"""

from __future__ import annotations

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_DIR = ROOT / "docs" / "screenshots" / "src"
OUT_DIR = ROOT / "docs" / "screenshots"

FONT_MONO = "/System/Library/Fonts/Menlo.ttc"
FONT_CJK = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_SIZE = 19
LINE_HEIGHT = 30
PAD_X = 26
PAD_TOP = 22
TITLE_H = 44
WIDTH = 1500

COLORS = {
    "bg": "#0d1117",
    "title_bg": "#161b22",
    "border": "#30363d",
    "text": "#c9d1d9",
    "dim": "#8b949e",
    "cmd": "#e6edf3",
    "prompt": "#7ee787",
    "ok": "#3fb950",
    "bad": "#ff7b72",
    "warn": "#d29922",
    "code": "#d2a8ff",
    "head": "#79c0ff",
}

TITLES = {
    "gate-blocked": "commander_dispatch_check — 三条阻断",
    "gate-pass": "commander_dispatch_check — 通过",
    "expert-brief": "commander_expert brief qa-engineer",
    "check-and-mount": "pnpm run check && dsh 挂载",
}


def load_fonts() -> tuple[ImageFont.FreeTypeFont, ImageFont.FreeTypeFont]:
    return (
        ImageFont.truetype(FONT_MONO, FONT_SIZE),
        ImageFont.truetype(FONT_CJK, FONT_SIZE + 1),
    )


def is_wide(char: str) -> bool:
    """CJK / 全角标点走中文字体。"""
    code = ord(char)
    return (
        0x2E80 <= code <= 0x9FFF
        or 0xF900 <= code <= 0xFAFF
        or 0xFF00 <= code <= 0xFF60
        or 0x3000 <= code <= 0x303F
        or char in "→←↑↓…—"
    )


def line_color(line: str) -> str:
    if line.startswith("$ "):
        return "cmd"
    if line.startswith("派发闸门：未通过") or line.startswith("阻断") or line.startswith("exit=1"):
        return "bad"
    if line.startswith("派发闸门：通过") or line.startswith("exit=0") or line.startswith("All matched"):
        return "ok"
    if line.startswith("提醒"):
        return "warn"
    if line.startswith("## "):
        return "head"
    if line.startswith("# "):
        return "warn"
    if line.startswith("- "):
        return "text"
    if line.startswith("[dsh-commander]"):
        return "ok"
    return "text"


def segment_color(segment: str, default: str) -> str:
    stripped = segment.strip()
    if stripped.startswith("[") and "]" in stripped:
        return "code"
    if stripped.startswith("→"):
        return "dim"
    return default


def measure(text: str, mono: ImageFont.FreeTypeFont, cjk: ImageFont.FreeTypeFont) -> float:
    width = 0.0
    for char in text:
        font = cjk if is_wide(char) else mono
        width += font.getlength(char)
    return width


def draw_line(draw: ImageDraw.ImageDraw, x: float, y: float, text: str, color: str, mono, cjk) -> None:
    """逐字符绘制，遇到 `[CODE]` 段或箭头时换色。"""
    cursor = x
    # 拆成「代码码段 / 箭头 / 普通文本」三类片段
    pieces: list[tuple[str, str]] = []
    buffer = ""
    index = 0
    while index < len(text):
        if text[index] == "[" and "]" in text[index:]:
            end = text.index("]", index)
            if buffer:
                pieces.append((buffer, color))
                buffer = ""
            pieces.append((text[index : end + 1], "code"))
            index = end + 1
            continue
        if text[index] == "→":
            if buffer:
                pieces.append((buffer, color))
                buffer = ""
            pieces.append(("→", "dim"))
            index += 1
            continue
        buffer += text[index]
        index += 1
    if buffer:
        pieces.append((buffer, color))

    for piece, piece_color in pieces:
        paint = COLORS[segment_color(piece, piece_color)]
        for char in piece:
            font = cjk if is_wide(char) else mono
            draw.text((cursor, y), char, font=font, fill=paint)
            cursor += font.getlength(char)


def wrap(lines: list[str], mono, cjk, limit: float) -> list[str]:
    """超宽行按字符折行，续行缩进，保证图里不被裁切。"""
    wrapped: list[str] = []
    for line in lines:
        if measure(line, mono, cjk) <= limit:
            wrapped.append(line)
            continue
        if " / " in line:
            # Prefer breaking long "a / b / c" runs on the separator so a tool
            # name never gets chopped in half.
            indent = "    "
            current = ""
            for part in line.split(" / "):
                piece = part if current == "" else f" / {part}"
                if current != "" and measure(current + piece, mono, cjk) > limit:
                    wrapped.append(current)
                    current = indent + part
                else:
                    current += piece
            if current:
                wrapped.append(current)
            continue
        indent = "  " if line.startswith("$ ") else "    "
        current = ""
        width = 0.0
        for char in line:
            char_width = (cjk if is_wide(char) else mono).getlength(char)
            if width + char_width > limit and current:
                wrapped.append(current)
                current = indent + char
                width = measure(indent, mono, cjk) + char_width
            else:
                current += char
                width += char_width
        if current:
            wrapped.append(current)
    return wrapped


def render(name: str) -> pathlib.Path:
    source = SRC_DIR / f"{name}.txt"
    raw_lines = source.read_text(encoding="utf-8").rstrip("\n").split("\n")
    mono, cjk = load_fonts()
    lines = wrap(raw_lines, mono, cjk, WIDTH - 2 * PAD_X)
    height = TITLE_H + PAD_TOP + LINE_HEIGHT * len(lines) + PAD_TOP

    image = Image.new("RGB", (WIDTH, height), COLORS["bg"])
    draw = ImageDraw.Draw(image)

    # 标题栏 + 三颗窗口按钮
    draw.rectangle([0, 0, WIDTH, TITLE_H], fill=COLORS["title_bg"])
    draw.line([0, TITLE_H, WIDTH, TITLE_H], fill=COLORS["border"])
    for offset, color in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        cx = 22 + offset * 22
        draw.ellipse([cx - 6, TITLE_H / 2 - 6, cx + 6, TITLE_H / 2 + 6], fill=color)
    title = TITLES.get(name, name)
    draw.text((100, TITLE_H / 2 - 9), title, font=cjk, fill=COLORS["dim"])

    y = TITLE_H + PAD_TOP
    for raw in lines:
        if raw.startswith("$ "):
            draw.text((PAD_X, y), "$", font=mono, fill=COLORS["prompt"])
            draw_line(draw, PAD_X + mono.getlength("$ ") + 2, y, raw[2:], "cmd", mono, cjk)
        else:
            draw_line(draw, PAD_X, y, raw, line_color(raw), mono, cjk)
        y += LINE_HEIGHT

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{name}.png"
    image.save(target, optimize=True)
    return target


def main() -> int:
    wanted = sys.argv[1:]
    names = wanted or sorted(path.stem for path in SRC_DIR.glob("*.txt"))
    for name in names:
        target = render(name)
        print(f"rendered {target.relative_to(ROOT)} ({target.stat().st_size // 1024} kB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
