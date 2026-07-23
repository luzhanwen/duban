#!/usr/bin/env python3
"""Generate deterministic, copyright-free PDF books for local end-to-end QA."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH, PAGE_HEIGHT = A4
BODY_FONT = "DubanSyntheticCJK"
INK = HexColor("#3C332C")
MUTED = HexColor("#8A7C70")
ACCENT = HexColor("#B94335")


@dataclass(frozen=True)
class Section:
    title: str
    start_page: int
    end_page: int
    outline_title: str | None = None
    body_kind: str = "正文"


@dataclass(frozen=True)
class BookSpec:
    filename: str
    title: str
    subtitle: str
    pages: int
    sections: tuple[Section, ...]
    include_outline: bool = True


PLACEHOLDER_SENTENCES = (
    "这是用于读伴质量验证的合成文本，不包含真实作品内容。",
    "本页反复提供人物、地点、时间、概念和因果关系等基础信息。",
    "测试人员可以据此检查导入、分页、章节识别、搜索和问答流程。",
    "每一段都使用确定性的占位内容，便于比较不同版本的识别结果。",
    "文中的甲地、乙地和测试人物均为虚构名称，只承担结构测试作用。",
    "如果阅读器工作正常，正文应当清晰、连续，并且不会超出页面边界。",
    "章节开头保留醒目的标题，目录版本还会写入标准 PDF 书签。",
    "长文本用于观察大书库场景下的解析速度、内存占用和页面切换表现。",
)


def register_fonts() -> None:
    candidates = (
        Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
        Path("/Library/Fonts/Arial Unicode.ttf"),
    )
    font_path = next((path for path in candidates if path.exists()), None)
    if font_path is None:
        raise RuntimeError(
            "A Unicode TrueType font is required. Install Arial Unicode or "
            "extend register_fonts() with an available CJK .ttf path."
        )
    pdfmetrics.registerFont(TTFont(BODY_FONT, str(font_path)))


def section_for_page(sections: Iterable[Section], page_number: int) -> Section:
    for section in sections:
        if section.start_page <= page_number <= section.end_page:
            return section
    raise ValueError(f"No section covers page {page_number}")


def draw_wrapped_line(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    font_size: float,
    max_chars: int,
    leading: float,
) -> float:
    for offset in range(0, len(text), max_chars):
        pdf.drawString(x, y, text[offset : offset + max_chars])
        y -= leading
    return y


def draw_title_page(pdf: canvas.Canvas, spec: BookSpec, page_number: int) -> None:
    pdf.setFillColor(ACCENT)
    pdf.setFont(BODY_FONT, 12)
    pdf.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 110, "读伴合成质量验证")

    pdf.setFillColor(INK)
    pdf.setFont(BODY_FONT, 27)
    pdf.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 215, spec.title)
    pdf.setFont(BODY_FONT, 14)
    pdf.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 250, spec.subtitle)

    pdf.setStrokeColor(ACCENT)
    pdf.setLineWidth(1.4)
    pdf.line(PAGE_WIDTH / 2 - 72, PAGE_HEIGHT - 280, PAGE_WIDTH / 2 + 72, PAGE_HEIGHT - 280)

    pdf.setFillColor(MUTED)
    pdf.setFont(BODY_FONT, 11)
    pdf.drawCentredString(PAGE_WIDTH / 2, 150, "作者：读伴合成测试组")
    pdf.drawCentredString(PAGE_WIDTH / 2, 126, "用途：本地导入与业务流程测试")
    draw_footer(pdf, page_number)


def draw_section_page(
    pdf: canvas.Canvas,
    spec: BookSpec,
    section: Section,
    page_number: int,
) -> None:
    first_page = page_number == section.start_page
    top = PAGE_HEIGHT - 72

    if first_page:
        pdf.setFillColor(ACCENT)
        pdf.setFont(BODY_FONT, 10)
        pdf.drawString(58, top, section.body_kind)
        pdf.setFillColor(INK)
        pdf.setFont(BODY_FONT, 22)
        top = draw_wrapped_line(pdf, section.title, 58, top - 38, 22, 23, 29)
        pdf.setStrokeColor(HexColor("#D8C9BA"))
        pdf.setLineWidth(0.7)
        pdf.line(58, top - 4, PAGE_WIDTH - 58, top - 4)
        top -= 32
    else:
        pdf.setFillColor(MUTED)
        pdf.setFont(BODY_FONT, 9)
        pdf.drawString(58, top, section.title)
        top -= 30

    pdf.setFillColor(INK)
    pdf.setFont(BODY_FONT, 10)
    leading = 18
    paragraph_number = 1
    y = top
    while y > 74:
        seed = page_number + paragraph_number
        sentences = [
            PLACEHOLDER_SENTENCES[(seed + index * 3) % len(PLACEHOLDER_SENTENCES)]
            for index in range(3)
        ]
        paragraph = f"测试段落{paragraph_number}。" + "".join(sentences)
        y = draw_wrapped_line(pdf, paragraph, 58, y, 10, 38, leading)
        y -= 10
        paragraph_number += 1

    draw_footer(pdf, page_number)


def draw_footer(pdf: canvas.Canvas, page_number: int) -> None:
    pdf.setFillColor(MUTED)
    pdf.setFont(BODY_FONT, 8)
    pdf.drawCentredString(PAGE_WIDTH / 2, 38, f"合成测试页 {page_number}")


def write_book(output_dir: Path, spec: BookSpec) -> Path:
    output_path = output_dir / spec.filename
    pdf = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    pdf.setTitle(spec.title)
    pdf.setAuthor("读伴合成测试组")
    pdf.setSubject("读伴本地 QA 合成书籍")
    pdf.setCreator("scripts/generate_synthetic_qa_books.py")

    outline_pages = {
        section.start_page: section
        for section in spec.sections
        if section.outline_title is not None
    }

    for page_number in range(1, spec.pages + 1):
        section = section_for_page(spec.sections, page_number)
        if spec.include_outline and page_number in outline_pages:
            key = f"section-{page_number}"
            pdf.bookmarkPage(key)
            pdf.addOutlineEntry(
                outline_pages[page_number].outline_title or section.title,
                key,
                level=0,
                closed=False,
            )

        if page_number == 1:
            draw_title_page(pdf, spec, page_number)
        else:
            draw_section_page(pdf, spec, section, page_number)
        pdf.showPage()

    pdf.save()
    return output_path


def book_specs() -> tuple[BookSpec, ...]:
    standard_sections = (
        Section("书名页", 1, 1, "书名页", "前置页"),
        Section("出版说明", 2, 2, "出版说明", "前置页"),
        Section("序言：为什么要做这次测试", 3, 5, "序言", "导读"),
        Section("目录", 6, 7, "目录", "前置页"),
        *tuple(
            Section(
                f"第{index}章 标准流程测试主题{index}",
                8 + (index - 1) * 11,
                18 + (index - 1) * 11,
                f"第{index}章 标准流程测试主题{index}",
            )
            for index in range(1, 9)
        ),
        Section("参考书目", 96, 96, "参考书目", "后置页"),
    )

    spaced_sections = (
        Section("书 名 页", 1, 1, "书 名 页", "前置页"),
        Section("增订纪念本出版说明", 2, 3, "增订纪念本出版说明", "前置页"),
        Section("自 序", 4, 5, "自 序", "导读"),
        Section("目 录", 6, 6, "目 录", "前置页"),
        Section("第一章 前置内容识别", 7, 16, "第一章 前置内容识别"),
        Section("第二章 正文范围确认", 17, 26, "第二章 正文范围确认"),
        Section("第三章 章节选择测试", 27, 36, "第三章 章节选择测试"),
        Section("第四章 阅读计划测试", 37, 46, "第四章 阅读计划测试"),
        Section("参 考 书 目", 47, 49, "参 考 书 目", "后置页"),
        Section("附 录 一", 50, 52, "附 录 一", "附录"),
        Section("本书出版历史", 53, 54, "本书出版历史", "后置页"),
    )

    no_outline_sections = (
        Section("书名页", 1, 1, None, "前置页"),
        Section("目录", 2, 3, None, "前置页"),
        *tuple(
            Section(
                f"第{index}章 无目录识别测试{index}",
                4 + (index - 1) * 11,
                14 + (index - 1) * 11,
                None,
            )
            for index in range(1, 7)
        ),
        Section("附录：识别结果核对", 70, 72, None, "附录"),
    )

    large_sections = (
        Section("书名页", 1, 1, "书名页", "前置页"),
        Section("出版说明", 2, 3, "出版说明", "前置页"),
        Section("前言", 4, 7, "前言", "导读"),
        Section("目录", 8, 11, "目录", "前置页"),
        *tuple(
            Section(
                f"第{index}章 大体量解析测试{index}",
                12 + (index - 1) * 14,
                25 + (index - 1) * 14,
                f"第{index}章 大体量解析测试{index}",
            )
            for index in range(1, 15)
        ),
        Section("参考资料", 208, 213, "参考资料", "后置页"),
        Section("附录一 数据说明", 214, 217, "附录一 数据说明", "附录"),
        Section("附录二 测试清单", 218, 220, "附录二 测试清单", "附录"),
    )

    return (
        BookSpec(
            "01-standard-outline.pdf",
            "读伴标准目录测试书",
            "有标准 PDF 目录的中等体量样本",
            96,
            standard_sections,
        ),
        BookSpec(
            "02-spaced-frontmatter.pdf",
            "读伴异常前后置页测试书",
            "空格标题、出版说明、参考书目与附录",
            54,
            spaced_sections,
        ),
        BookSpec(
            "03-no-outline-layout.pdf",
            "读伴无目录识别测试书",
            "依靠页面大标题识别章节",
            72,
            no_outline_sections,
            include_outline=False,
        ),
        BookSpec(
            "04-large-outline.pdf",
            "读伴大体量性能测试书",
            "二百二十页、十四章的长书样本",
            220,
            large_sections,
        ),
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default="output/pdf/duban-synthetic-qa",
        help="Directory for generated PDF books.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    register_fonts()

    for spec in book_specs():
        path = write_book(output_dir, spec)
        print(f"{path.name}\t{spec.pages} pages\t{path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
