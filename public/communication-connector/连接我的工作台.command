#!/bin/bash
set -euo pipefail
CRM_CONNECTOR_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
CRM_WORKBENCH='/Applications/亦玩销售工作台.app/Contents/MacOS/亦玩销售工作台'
if [ ! -x "$CRM_WORKBENCH" ]; then
  printf '%s\n' '请确认原工作台已安装在“应用程序”中。'
  read -r -p '按回车退出…' CRM_EXIT
  exit 1
fi
if ! ELECTRON_RUN_AS_NODE=1 "$CRM_WORKBENCH" "$CRM_CONNECTOR_DIR/setup.cjs"; then
  printf '%s\n' '连接未完成，请核对上方提示。'
  read -r -p '按回车退出…' CRM_EXIT
  exit 1
fi
read -r -p '按回车关闭本窗口…' CRM_EXIT
