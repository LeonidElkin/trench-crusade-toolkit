#!/usr/bin/env python3
"""Replay the editor's page/block decisions for the independently read supplement.

This is a source-specific authoring recipe, not an automatic layout classifier.
Every block range below was chosen after viewing the original page at 180 dpi.
"""
from __future__ import annotations

import json
import re
import argparse
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "public/reference/allies-and-mercenaries-ru.pdf"
OUT = ROOT / "reconstruction/1.6.3/authored/allies.json"

# Explicit visual decisions: lore, table, equipment/abilities, right-hand notes.
PLAN = {
    2: {"id": "medic", "name": "Боевой Медик", "glory": 2, "lore": [5, 6, 7], "table": [8, 9], "rules": [10, 11, 13, 15, 16], "notes": [17],
        "profile": ["Медик", "6”/Пехота", "0", "0", "-1", "25 мм"], "factions": ["Паломники Траншей"],
        "equipment": ["Милосердие", "Медицинский Набор", "Противогаз", "Стандартная Броня"], "keywords": []},
    4: {"id": "witch-hunter", "name": "Истребитель ведьм", "glory": 5, "lore": [5, 6], "table": [7, 8, 9], "rules": [10, 11, 13, 15, 17, 18], "notes": [25],
        "profile": ["Истребитель ведьм", "6”/Пехота", "0", "+1D", "-2", "32 мм"], "factions": ["Новое Антиохийское Княжество", "Паломники Траншей"],
        "equipment": ["Укреплённая Броня", "Шлем", "Молот Правосудия"], "keywords": []},
    6: {"id": "communicant-tank-hunter", "name": "Коммуникант Истребитель Танков", "glory": 5, "lore": [5, 6], "table": [7, 8], "rules": [9, 10, 12, 14, 16, 17], "notes": [],
        "profile": ["Коммуникант", "6”/Пехота", "+1D", "+1D", "-1", "40 мм"], "factions": ["Новое Антиохийское Княжество", "Паломники Траншей"],
        "equipment": ["Противотанковая винтовка", "Шлем", "Две окопные дубины (кулаки)", "Стандартная Броня (плоть)"], "keywords": ["TOUGH", "STRONG"]},
    8: {"id": "mendelist-monk", "name": "Монах-Менделист", "glory": 2, "lore": [5, 6, 7], "table": [8, 9], "rules": [10, 11, 13, 15, 17, 19, 21, 22], "notes": [23],
        "profile": ["Монах", "6”/Пехота", "-1D", "-1D", "0", "25 мм"], "factions": ["Новое Антиохийское Княжество", "Паломники Траншей"],
        "equipment": ["Противогаз", "Таинство Боеприпасов"], "keywords": []},
    10: {"id": "sin-eater", "name": "Пожиратель Грехов", "glory": 6, "lore": [5, 6], "table": [7, 8, 9], "rules": [10, 11, 13, 15, 17, 19, 20], "notes": [],
        "profile": ["Пожиратель Грехов", "6”/Пехота", "-", "+2D", "-2", "50 мм"], "factions": ["Легион Еретиков", "Культ Чёрного Грааля", "Двор Семиглавого Змея"],
        "equipment": ["Усиленная Броня", "Молот-Размягчитель"], "keywords": ["HERETIC", "FEAR", "TOUGH", "STRONG"]},
    12: {"id": "goetic-warlock", "name": "Гоэтический Колдун", "glory": 4, "lore": [5, 6, 7], "table": [8, 9, 10], "rules": [11, 12, 14, 16, 18, 20, 21], "notes": [],
        "profile": ["Гоэтический Колдун", "6”/Пехота", "+1D", "+1D", "-2", "40 мм"], "factions": ["Легион Еретиков", "Двор Семиглавого Змея"],
        "equipment": ["Усиленная Броня", "Два меча (руки)"], "keywords": ["DEMONIC", "ARTIFICIAL", "FEAR"]},
    14: {"id": "observer", "name": "Наблюдатель", "glory": 3, "lore": [5, 6, 7, 8, 9], "table": [10, 11], "rules": [12, 13, 15, 17, 19, 21, 22], "notes": [23, 24],
        "profile": ["Наблюдатель", "8”/Пехота", "+1D", "+2D", "-1", "32 мм"], "factions": ["Новое Антиохийское Княжество", "Паломники Траншей"],
        "equipment": ["Стандартная Броня", "Шлем Окулус (Боевой Шлем и Противогаз)", "Древковое Оружие", "Встроенный Медицинский Набор"], "keywords": []},
    16: {"id": "mamluk-faris", "name": "Мамлюк Фарис", "glory": 4, "lore": [5, 6], "table": [7, 8], "rules": [9, 11, 13, 15, 16, 18, 20, 22, 23], "notes": [24],
        "profile": ["Мамлюк", "6”/Пехота", "+1D", "+1D", "-2(3)", "32 мм"], "factions": ["Железный Султанат", "Новое Антиохийское Княжество"],
        "equipment": ["Джезайл", "Алхимические Боеприпасы", "Шлем", "Усиленная Броня"], "keywords": []},
    18: {"id": "trench-dog", "name": "Окопная Собака", "glory": 1, "lore": [5], "table": [6, 7], "rules": [8, 9, 11, 12, 14, 16, 18, 20, 21], "notes": [],
        "profile": ["Окопная Собака", "8”/Пехота", "0", "0", "0", "25 мм"], "factions": None,
        "equipment": [], "keywords": []},
    20: {"id": "scripture-guardian", "name": "Хранитель Писаний", "glory": 7, "lore": [5, 6], "table": [7, 8], "rules": [9, 10, 12, 14, 16, 17], "notes": [],
        "profile": ["Хранитель", "6”/Пехота", "+1D", "+1D", "-2", "40 мм"], "factions": None,
        "equipment": ["Свиток Писаний", "Усиленная Броня", "Шлем"], "keywords": ["GOLEM"]},
}


def join_lines(lines: list[str]) -> str:
    result = ""
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if result.endswith("\u00ad"):
            result = result[:-1] + line
        else:
            result += (" " if result else "") + line
    return re.sub(r"[ \t]+", " ", result.replace("\u00ad", ""))


def text(block: dict, bold: bool = True) -> str:
    # Merge equal style runs across a line break before adding Markdown markers.
    runs: list[tuple[str, bool]] = []
    previous_line = False
    for line in block["lines"]:
        spans = [s for s in line["spans"] if s["text"].strip()]
        if not spans:
            continue
        if previous_line and runs:
            old, weight = runs[-1]
            runs[-1] = (old[:-1] if old.endswith("\u00ad") else old.rstrip() + " ", weight)
        for span in spans:
            content = span["text"].replace("\t", "")
            weight = bool(span["flags"] & 16) and bold
            if runs and runs[-1][1] == weight:
                runs[-1] = (runs[-1][0] + content, weight)
            else:
                runs.append((content, weight))
        previous_line = True
    return "".join(
        (" " if value.startswith(" ") else "") + "**" + value.strip().replace("\u00ad", "") + "**" + (" " if value.endswith(" ") else "")
        if weight and value.strip() else value.replace("\u00ad", "")
        for value, weight in runs
    ).strip()


def table(headers: list[str], rows: list[list[str]]) -> str:
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"] + ["| " + " | ".join(row) + " |" for row in rows])


def reference(number: int, section_id: str, blocks: list[int], page: fitz.Page) -> dict:
    raw = page.get_text("dict")["blocks"]
    return {"document": "allies", "pages": [number], "sectionId": section_id,
            "blocks": [{"id": f"b{i:03d}", "bbox": list(raw[i]["bbox"])} for i in blocks]}


def render_rule(block: dict) -> str:
    lines = block["lines"]
    first = "".join(s["text"] for s in lines[0]["spans"]).strip()
    if first in ("Экипировка", "Способности", "Ключевые слова"):
        tail = text({"lines": lines[1:]})
        return f"## {first}\n\n{tail}".rstrip()
    return ("- " if any("\t" in s["text"] for line in lines for s in line["spans"]) else "") + text(block)


def main() -> None:
    pdf = fitz.open(PDF)
    sections, units, items, upgrades, pages, issues = [], [], [], [], [], []
    for number in range(1, 23):
        page = pdf[number - 1]
        if number not in PLAN:
            pages.append({"pdfPage": number, "printedPage": None if number in (1, 22) else number, "contentType": "title" if number == 1 else "back-cover" if number == 22 else "illustration",
                          "readingOrder": ["Титул и сведения об авторах; самостоятельных правил нет" if number == 1 else "Полностраничная иллюстрация; самостоятельных правил нет"],
                          "sectionIds": [], "extractionStatus": "accounted-nonrules", "visualInspection": {"agent": "root", "status": "inspected", "notes": "Оригинальное изображение страницы рассмотрено при 180 dpi; игрового текста нет."}, "issues": []})
            continue
        plan = PLAN[number]
        section_id = "allies-" + plan["id"]
        raw = page.get_text("dict")["blocks"]
        rules = [render_rule(raw[i]) for i in plan["rules"]]
        markdown = f"# {plan['name']}\n\n" + text(raw[3]) + "\n\n" + text(raw[4]) + "\n\n## Профиль характеристик\n\n"
        markdown += table(["Название", "Движение", "ДБ", "ББ", "Броня", "База"], [plan["profile"]]) + "\n\n" + "\n\n".join(rules)
        markdown += "\n\n## Описание\n\n" + "\n\n".join(text(raw[i]) for i in plan["lore"])
        if plan["notes"]:
            markdown += "\n\n### Примечание оригинала\n\n" + "\n\n".join(text(raw[i]) for i in plan["notes"])
        sections.append({"id": section_id, "title": plan["name"], "category": "Союзники и наёмники", "originalSection": plan["name"], "pages": [number], "markdown": markdown + "\n"})
        source = reference(number, section_id, [3, 4] + plan["table"] + plan["rules"], page)
        unit = {"id": section_id, "name": plan["name"], "factionId": None, "mercenary": True, "cost": {"ducats": 0, "glory": plan["glory"]}, "min": 0, "max": 1,
                "stats": dict(zip(["name", "movement", "ranged", "melee", "armour", "base"], plan["profile"])), "profileRows": [plan["profile"]], "keywords": plan["keywords"],
                "allowedFactionNames": plan["factions"], "fixedEquipment": plan["equipment"], "equipmentPolicy": "weapons-fixed" if number == 8 else "fixed" if number not in (16, 18, 20) else "personal-loadout" if number == 16 else "unspecified" if number == 18 else "one-unrestricted-melee",
                "source": source,
                "fieldSources": {"cost": reference(number, section_id, [3, 4], page), "stats": reference(number, section_id, plan["table"], page)},
                "abilityRefs": []}
        for block_number in plan["rules"]:
            block = raw[block_number]
            plain = text(block, False)
            match = re.match(r"(.+?\([A-Za-z][^)]*\)):", plain)
            if match:
                unit["abilityRefs"].append({"name": match.group(1), "source": reference(number, section_id, [block_number], page)})
        units.append(unit)
        assigned = [3, 4] + plan["lore"] + plan["table"] + plan["rules"] + plan["notes"]
        if number == 4:
            weapon_id = "allies-gavel-of-justice"
            weapon_table = table(["Название", "Тип", "Дальность", "Модификаторы", "Ключевые слова"], [["Молот Правосудия", "Одноручное", "ББ", "-", "-"]])
            weapon_md = "# Молот Правосудия\n\n" + text(raw[20]) + "\n\n" + weapon_table + "\n\n" + text(raw[21]) + "\n"
            sections.append({"id": weapon_id, "title": "Молот Правосудия", "category": "Союзники и наёмники", "originalSection": "Особое оружие. Молот Правосудия (Gavel of Justice)", "pages": [4], "markdown": weapon_md})
            items.append({"id": weapon_id, "name": "Молот Правосудия", "englishName": "Gavel of Justice", "category": "melee", "hands": 1, "range": "ББ", "modifiers": "-", "keywords": [], "source": reference(4, weapon_id, [19, 20, 22, 23, 24, 21], page), "purchase": None})
            assigned += [19, 20, 21, 22, 23, 24]
        if number == 16:
            unit["loadoutGroups"] = [{"id": "personal-arsenal", "name": "Личный арсенал перед каждой битвой", "min": 1, "max": 1, "choices": [
                {"id": "polearm-shield", "name": "Древковое Оружие и Окопный Щит", "equipment": ["Древковое Оружие", "Окопный Щит"], "armour": "-3"},
                {"id": "sword-pistol", "name": "Меч и Пистолет", "equipment": ["Меч", "Пистолет"], "armour": "-2"},
                {"id": "greatsword", "name": "Двуручный Меч", "equipment": ["Двуручный Меч"], "ignoredKeywords": ["HEAVY"], "armour": "-2"}],
                "source": reference(16, section_id, [9, 11, 13, 15], page)}]
        if number == 18:
            unit["equipmentUncertainty"] = "В профиле собаки нет явного разрешения или запрета на покупку обычной экипировки; не выводить запрет из вида модели."
            unit["roleGroup"] = "trench-dog-types"
            unit["cannotBecomeElite"] = True
            roles = [
                ("guard", "Сторожевая Собака", ["Легион Еретиков", "Паломники Траншей", "Железный Султанат", "Новое Антиохийское Княжество"], 14),
                ("mercy", "Собака Милосердия", ["Новое Антиохийское Княжество"], 16),
                ("martyrdom", "Собака-Мученик", ["Паломники Траншей"], 18),
                ("hellhound", "Адская Гончая", ["Культ Чёрного Грааля", "Двор Семиглавого Змея", "Легион Еретиков"], 20),
            ]
            for role, name, factions, block in roles:
                units.append({**unit, "id": "allies-dog-" + role, "name": name, "cost": {"ducats": 0, "glory": 2}, "allowedFactionNames": factions,
                              "stats": {**unit["stats"], "name": name, **({"melee": "+1D"} if role == "hellhound" else {})},
                              "fixedEquipment": ["Медицинский Набор"] if role == "mercy" else ["Устройство Мученичества"] if role == "martyrdom" else [],
                              "role": role, "source": reference(18, section_id, [3, 4, 12, block], page)})
            upgrades.append({"id": "allies-dog-fireteam", "name": "Собака: FIRETEAM", "cost": {"ducats": 0, "glory": 1}, "unitIds": ["allies-trench-dog"] + ["allies-dog-" + role[0] for role in roles], "limitPerModel": 1, "source": reference(18, section_id, [8], page)})
            issues.append({"id": "allies-dog-equipment", "source": reference(18, section_id, [8], page), "status": "source-uncertainty", "description": unit["equipmentUncertainty"]})
        if number == 20:
            unit["purchasePolicy"] = {"category": "melee", "maxWeapons": 1, "handsAvailable": 2, "requiresUnrestrictedOffer": True, "cost": "standard", "source": reference(20, section_id, [9], page)}
        page_sections = [section_id] + (["allies-gavel-of-justice"] if number == 4 else [])
        pages.append({"pdfPage": number, "printedPage": number, "contentType": "mercenary-profile", "readingOrder": [
            "Основная полоса: название/стоимость → условие найма → курсивное описание → таблица профиля → экипировка → способности → ключевые слова",
            *(["Особое оружие: название и описание → таблица → Правила (таблица расположена выше правил, хотя поток PDF перечисляет её позже)"] if number == 4 else []),
            *( ["Красное боковое примечание справа — лор, читать отдельно после основного профиля"] if number in (14, 16) else ["Красная цитата справа внизу — отдельный лор"] if plan["notes"] else [])],
            "sectionIds": page_sections, "extractionStatus": "authored", "visualInspection": {"agent": "root", "status": "inspected", "notes": "Изображение оригинальной страницы 180 dpi рассмотрено; заголовок, стоимость, профиль и последовательность блоков сверены."},
            "blocks": [{"id": f"b{i:03d}", "bbox": list(raw[i]["bbox"])} for i in sorted(set(assigned))], "issues": ["allies-dog-equipment"] if number == 18 else []})
    issues.append({"id": "allies-mamluk-armour", "source": {"document": "allies", "pages": [16], "sectionId": "allies-mamluk-faris"}, "status": "explicit-conditional-value", "description": "Профиль печатает -2(3); сохранено дословно. В личном арсенале есть набор с Окопным Щитом; UI обязан показывать выбранный набор и исходный профиль отдельно."})
    result = {"schemaVersion": 2, "author": "root", "document": "allies", "pageRange": list(range(1, 23)), "sections": sections, "entities": {"units": units, "items": items, "upgrades": upgrades}, "pages": pages, "issues": issues}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Authored supplement: {len(sections)} sections, {len(units)} profiles/types, 22 pages; independent review pending")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace-unreviewed", action="store_true")
    args = parser.parse_args()
    if OUT.exists():
        reviews = ROOT / "reconstruction/1.6.3/reviews"
        reviewed = any(Path(json.loads(p.read_text()).get("authorFile", "")).name == OUT.name
                       for p in reviews.glob("*.json"))
        if reviewed or not args.replace_unreviewed:
            parser.error("Existing authored JSON is primary; never overwrite reviewer corrections. Use another staging for replay.")
    main()
