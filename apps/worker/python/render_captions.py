#!/usr/bin/env python3
"""
Gera imagens PNG transparentes + arquivo subs.ffconcat para queima de legendas via filtro
`overlay` do FFmpeg em ambientes onde o FFmpeg não possui `libass`.
"""
import json
import os
import re
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ASS_COLOR_TAG = re.compile(r"\{\\c&H00([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})\}")


def hex_to_rgba(hex_str: str, alpha: int = 255) -> tuple[int, int, int, int]:
    s = hex_str.strip().lstrip("#")
    if len(s) != 6:
        return (255, 255, 255, alpha)
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), alpha)


def find_font(font_name: str, font_size: int, fonts_dir: str | None = None) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates: list[str] = []
    clean = font_name.strip().lower()

    if fonts_dir and os.path.isdir(fonts_dir):
        for f in os.listdir(fonts_dir):
            if f.lower().endswith((".ttf", ".otf", ".ttc")):
                if clean.replace(" ", "") in f.lower().replace(" ", "").replace("-", ""):
                    candidates.insert(0, os.path.join(fonts_dir, f))
                else:
                    candidates.append(os.path.join(fonts_dir, f))

    venv_ttf_dir = Path(__file__).resolve().parent / ".venv/lib/python3.11/site-packages/matplotlib/mpl-data/fonts/ttf"
    mac_supp = Path("/System/Library/Fonts/Supplemental")
    linux_dejavu = Path("/usr/share/fonts/truetype/dejavu")

    font_map: dict[str, list[Path]] = {
        "impact": [
            mac_supp / "Impact.ttf",
            mac_supp / "Arial Black.ttf",
            mac_supp / "DIN Condensed Bold.ttf",
        ],
        "arial": [
            mac_supp / "Arial Bold.ttf",
            mac_supp / "Arial.ttf",
        ],
        "montserrat": [
            mac_supp / "Arial Rounded Bold.ttf",
            mac_supp / "Arial Bold.ttf",
            venv_ttf_dir / "DejaVuSans-Bold.ttf",
        ],
        "inter": [
            mac_supp / "Arial Bold.ttf",
            venv_ttf_dir / "DejaVuSans-Bold.ttf",
        ],
        "roboto": [
            mac_supp / "DIN Alternate Bold.ttf",
            mac_supp / "Arial Bold.ttf",
            venv_ttf_dir / "DejaVuSans-Bold.ttf",
        ],
        "dejavu sans": [
            venv_ttf_dir / "DejaVuSans-Bold.ttf",
            linux_dejavu / "DejaVuSans-Bold.ttf",
            mac_supp / "Arial Bold.ttf",
        ],
    }

    for key, paths in font_map.items():
        if key in clean:
            for p in paths:
                candidates.append(str(p))

    # Fallbacks universais
    candidates.extend([
        str(venv_ttf_dir / "DejaVuSans-Bold.ttf"),
        str(linux_dejavu / "DejaVuSans-Bold.ttf"),
        str(mac_supp / "Arial Bold.ttf"),
        str(mac_supp / "Impact.ttf"),
    ])

    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, font_size)
            except Exception:
                continue

    return ImageFont.load_default()


def parse_ass_tokens(text: str, default_color: tuple[int, int, int, int]) -> list[tuple[str, tuple[int, int, int, int]]]:
    """Converte texto com tags ASS {\\c&H00BBGGRR} em lista de (palavra, cor RGBA)."""
    tokens: list[tuple[str, tuple[int, int, int, int]]] = []
    cur_color = default_color
    pos = 0
    for m in ASS_COLOR_TAG.finditer(text):
        segment = text[pos : m.start()]
        for w in segment.split():
            if w:
                tokens.append((w, cur_color))
        bb, gg, rr = int(m.group(1), 16), int(m.group(2), 16), int(m.group(3), 16)
        cur_color = (rr, gg, bb, 255)
        pos = m.end()
    tail = text[pos:]
    for w in tail.split():
        if w:
            tokens.append((w, cur_color))
    return tokens


def render_event_png(
    out_path: str,
    tokens: list[tuple[str, tuple[int, int, int, int]]],
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    width: int,
    height: int,
    position: str,
    margin_v: int,
    margin_h: int,
    outline_color: tuple[int, int, int, int],
    outline_width: int,
    shadow: int,
) -> None:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    if not tokens:
        img.save(out_path, "PNG", compress_level=1)
        return

    draw = ImageDraw.Draw(img)
    space_bbox = draw.textbbox((0, 0), " ", font=font)
    space_w = max(14, space_bbox[2] - space_bbox[0])
    max_line_w = max(200, width - 2 * margin_h)

    # Agrupa tokens em linhas caso passem da largura útil
    lines: list[list[tuple[str, tuple[int, int, int, int], int, int]]] = []
    cur_line: list[tuple[str, tuple[int, int, int, int], int, int]] = []
    cur_w = 0

    for word, color in tokens:
        bbox = draw.textbbox((0, 0), word, font=font, stroke_width=outline_width)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        needed = w if not cur_line else cur_w + space_w + w
        if cur_line and needed > max_line_w:
            lines.append(cur_line)
            cur_line = [(word, color, w, h)]
            cur_w = w
        else:
            cur_line.append((word, color, w, h))
            cur_w = needed
    if cur_line:
        lines.append(cur_line)

    line_heights = [max(item[3] for item in line) for line in lines]
    line_gap = 12
    total_h = sum(line_heights) + line_gap * max(0, len(lines) - 1)

    if position == "top":
        start_y = margin_v
    elif position == "middle":
        start_y = (height - total_h) // 2
    else:
        start_y = height - margin_v - total_h

    y = max(margin_h, min(height - total_h - 40, start_y))

    for line, lh in zip(lines, line_heights):
        line_w = sum(item[2] for item in line) + space_w * max(0, len(line) - 1)
        x = (width - line_w) // 2
        for word, color, w, _ in line:
            if shadow > 0:
                draw.text(
                    (x + shadow, y + shadow),
                    word,
                    font=font,
                    fill=(0, 0, 0, 180),
                    stroke_width=outline_width,
                    stroke_fill=(0, 0, 0, 180),
                )
            draw.text(
                (x, y),
                word,
                font=font,
                fill=color,
                stroke_width=outline_width,
                stroke_fill=outline_color,
            )
            x += w + space_w
        y += lh + line_gap

    img.save(out_path, "PNG", compress_level=1)


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Uso: render_captions.py <input.json>")

    with open(sys.argv[1], "r", encoding="utf-8") as f:
        data = json.load(f)

    work_dir = Path(data["workDir"])
    events = data.get("events", [])
    style = data.get("style", {})
    total_ms = max(100, int(data.get("totalDurationMs", 1000)))
    fonts_dir = data.get("fontsDir")

    width = int(style.get("playResX", 1080))
    height = int(style.get("playResY", 1920))
    font_name = str(style.get("fontName", "DejaVu Sans"))
    font_size = int(style.get("fontSize", 78))
    primary_color = hex_to_rgba(str(style.get("primaryColor", "#FFFFFF")))
    outline_color = hex_to_rgba(str(style.get("outlineColor", "#000000")))
    outline_width = int(style.get("outlineWidth", 6))
    shadow = int(style.get("shadow", 2))
    position = str(style.get("position", "bottom"))
    margin_v = int(style.get("marginV", 360))
    margin_h = int(style.get("marginH", 60))

    font = find_font(font_name, font_size, fonts_dir)

    blank_path = work_dir / "cap_blank.png"
    Image.new("RGBA", (width, height), (0, 0, 0, 0)).save(str(blank_path), "PNG", compress_level=1)

    concat_lines = ["ffconcat version 1.0"]
    cursor_ms = 0
    safe_end_ms = max(50, total_ms - 33)

    for idx, ev in enumerate(events):
        start_ms = max(cursor_ms, int(ev["startMs"]))
        end_ms = min(safe_end_ms, int(ev["endMs"]))
        if end_ms <= start_ms:
            continue

        if start_ms > cursor_ms:
            dur = (start_ms - cursor_ms) / 1000.0
            concat_lines.append("file 'cap_blank.png'")
            concat_lines.append(f"duration {dur:.6f}")

        png_name = f"cap_{idx}.png"
        png_path = work_dir / png_name
        tokens = parse_ass_tokens(str(ev["text"]), primary_color)
        render_event_png(
            str(png_path),
            tokens,
            font,
            width,
            height,
            position,
            margin_v,
            margin_h,
            outline_color,
            outline_width,
            shadow,
        )
        dur = (end_ms - start_ms) / 1000.0
        concat_lines.append(f"file '{png_name}'")
        concat_lines.append(f"duration {dur:.6f}")
        cursor_ms = end_ms

    if cursor_ms < safe_end_ms:
        dur = (safe_end_ms - cursor_ms) / 1000.0
        concat_lines.append("file 'cap_blank.png'")
        concat_lines.append(f"duration {dur:.6f}")

    # Repete o último arquivo conforme exigido pelo demuxer concat do FFmpeg
    concat_lines.append("file 'cap_blank.png'")

    concat_path = work_dir / "subs.ffconcat"
    with open(concat_path, "w", encoding="utf-8") as f:
        f.write("\n".join(concat_lines) + "\n")


if __name__ == "__main__":
    main()
