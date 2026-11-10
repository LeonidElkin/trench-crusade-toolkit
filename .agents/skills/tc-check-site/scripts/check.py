#!/usr/bin/env python3
import os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
env=dict(os.environ,APP_BASE_PATH='/trench-crusade-toolkit/')
subprocess.run(['npm','run','check'],cwd=ROOT,env=env,check=True)
subprocess.run(['npm','run','test:e2e'],cwd=ROOT,env=env,check=True)
