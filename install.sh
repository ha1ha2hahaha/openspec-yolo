#!/usr/bin/env bash
# openspec-yolo 一键安装（只装 skill，不碰 yapi CLI 和登录）。在业务仓库根目录跑：
#   curl -fsSL https://raw.githubusercontent.com/ha1ha2hahaha/openspec-yolo/main/install.sh | bash
# 幂等：重复跑等于更新；不会覆盖你已经填过的 references/project.md。
set -euo pipefail

TGZ="https://github.com/ha1ha2hahaha/openspec-yolo/archive/refs/heads/main.tar.gz"
need() { command -v "$1" >/dev/null 2>&1; }
ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
todo() { printf '\033[1;33m→\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ -d .git ] || die "请在业务仓库根目录运行（这里没有 .git）"
need node || die "需要 Node 18+：https://nodejs.org"
need npm  || die "需要 npm"

# 1. OpenSpec CLI + openspec/ 目录
need openspec || npm i -g @fission-ai/openspec@latest
ok "openspec $(openspec --version)"
if [ ! -d openspec ]; then
  openspec init --tools claude --language zh-CN --no-animation --force >/dev/null
  ok "openspec init 完成（选了 Claude Code）"
else
  ok "openspec/ 已存在"
fi

# 2. 拿 skill 包：默认从 GitHub 下载；OPENSPEC_YOLO_SRC 指向本地目录时用本地的（开发用）
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -n "${OPENSPEC_YOLO_SRC:-}" ]; then
  SRC="$OPENSPEC_YOLO_SRC/.claude"
else
  curl -fsSL "$TGZ" | tar -xz -C "$TMP" --strip-components=1
  SRC="$TMP/.claude"
fi
[ -f "$SRC/skills/yapi/SKILL.md" ] || die "skill 包不完整：$SRC"

# 3. 拷进 .claude/（只动 commands/opsx、skills/openspec-*、skills/yapi）
mkdir -p .claude/commands .claude/skills .claude/skills/yapi/references
rm -rf .claude/commands/opsx && cp -R "$SRC/commands/opsx" .claude/commands/opsx
for d in "$SRC"/skills/openspec-*; do n=$(basename "$d"); rm -rf ".claude/skills/$n"; cp -R "$d" ".claude/skills/$n"; done
cp "$SRC/skills/yapi/SKILL.md" .claude/skills/yapi/SKILL.md
rm -rf .claude/skills/yapi/scripts .claude/skills/yapi/openspec-schema
cp -R "$SRC/skills/yapi/scripts"         .claude/skills/yapi/scripts
cp -R "$SRC/skills/yapi/openspec-schema" .claude/skills/yapi/openspec-schema
cp "$SRC/skills/yapi/references/example-api.md" .claude/skills/yapi/references/example-api.md
[ -f .claude/skills/yapi/references/project.md ] || cp "$SRC/skills/yapi/references/project.md" .claude/skills/yapi/references/project.md   # 待填项由 AI 第一次用时自己补
ok "skill 包已拷入 .claude/（opsx 命令、openspec-* 六个 skill、yapi skill）"

# 4. 接进 OpenSpec（复制产物清单到用户级目录、config.yaml 切 api-contract、.gitignore 加 .yapi/）
node .claude/skills/yapi/scripts/yapi.mjs init >/dev/null
openspec schemas --json 2>/dev/null | grep -q '"api-contract"' && ok "OpenSpec 已认到 api-contract 产物清单" || die "openspec schemas 里没有 api-contract，把上面的输出发给维护者"

echo
echo "skill 装好了。yapi CLI 的安装、登录和 YApi 环境配置见团队文档。"
todo "把 .claude/ openspec/ CLAUDE.md 提交进 git"
