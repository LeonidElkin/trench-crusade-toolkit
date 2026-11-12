#!/usr/bin/env python3
"""Install isolated, pinned CPU tools; do not download inference models."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[2]
CPU_INDEX = "https://download.pytorch.org/whl/cpu"
CPU_PACKAGES = ["torch==2.15.0+cpu", "torchvision==0.29.2+cpu"]


def run(command: list[str], **kwargs: object) -> None:
    subprocess.run(command, check=True, **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--venv", type=Path, default=ROOT / "tools/import-cache/docling-venv")
    parser.add_argument("--doctor", action="store_true", help="Inspect an existing environment without installing")
    parser.add_argument("--register-skill", action="store_true", help="Register only the official bundled Docling Skill via library-skills")
    args = parser.parse_args()
    target = args.venv.resolve()
    python = target / "bin/python"
    if not args.doctor:
        if sys.version_info[:2] != (3, 12):
            parser.error("The tested environment uses Python 3.12; choose that interpreter explicitly")
        if not python.exists():
            venv.EnvBuilder(with_pip=True).create(target)
        # Installing these first prevents pip from choosing Linux CUDA distributions.
        run([str(python), "-m", "pip", "install", *CPU_PACKAGES,
             "--index-url", CPU_INDEX, "--progress-bar", "off"])
        run([str(python), "-m", "pip", "install", "-r", str(ROOT / "tools/requirements-docling.txt"),
             "--progress-bar", "off"])
    run([str(python), "-c", """
import importlib.metadata as m, importlib.util, json, pathlib, torch
assert m.version('docling') == '2.150.0', 'Revalidate a different Docling version before use'
assert torch.version.cuda is None and '+cpu' in torch.__version__, 'CPU-only PyTorch required'
bad = [d.metadata['Name'] for d in m.distributions() if d.metadata['Name'].lower().startswith('nvidia-')]
assert not bad, f'Unexpected CUDA dependencies: {bad}'
spec = importlib.util.find_spec('docling')
skill = pathlib.Path(spec.submodule_search_locations[0]) / '.agents/skills/docling/SKILL.md'
assert skill.is_file(), f'Official bundled Skill missing: {skill}'
print(json.dumps({'python': __import__('platform').python_version(),
 'versions': {n:m.version(n) for n in ('docling','docling-core','docling-ibm-models','torch','torchvision','library-skills','PyMuPDF')},
 'cuda': torch.version.cuda, 'officialSkill':str(skill)}, indent=2))
"""])
    if args.register_skill:
        # library-skills deliberately does not use its own Python interpreter as
        # the target environment (it also supports uvx). Select our venv explicitly.
        environment = {**os.environ, "VIRTUAL_ENV": str(target)}
        run([str(target / "bin/library-skills"), "--no-tool-skill", "install", "--yes", "--skill", "docling"],
            cwd=ROOT, env=environment)


if __name__ == "__main__":
    main()
