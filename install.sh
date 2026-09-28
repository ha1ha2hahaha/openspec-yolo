#!/usr/bin/env bash
# openspec-yolo 一键安装。在业务仓库根目录跑：
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

# 4. yapi CLI
need yapi || npm i -g @leeguoo/yapi-mcp
ok "yapi CLI $(yapi --version 2>/dev/null | head -1)"

# 5. 接进 OpenSpec（复制产物清单到用户级目录、config.yaml 切 api-contract、.gitignore 加 .yapi/）
node .claude/skills/yapi/scripts/yapi.mjs init >/dev/null
openspec schemas --json 2>/dev/null | grep -q '"api-contract"' && ok "OpenSpec 已认到 api-contract 产物清单" || die "openspec schemas 里没有 api-contract，把上面的输出发给维护者"

# 6. YApi 登录（一台电脑一次）。有终端就当场问；curl | bash 没有终端，就打印两条命令
if yapi whoami --no-update 2>/dev/null | grep -q '"errcode": 0'; then
  ok "yapi CLI 已登录"
elif [ -t 0 ] || [ -e /dev/tty ]; then
  echo
  echo "登录 YApi（密码只用来换 cookie，不落盘；7 天后重跑 yapi login）"
  read -r -p "  YApi 地址（如 http://yapi.example.com）: " YAPI_URL </dev/tty
  read -r -p "  邮箱: " YAPI_EMAIL </dev/tty
  read -r -s -p "  密码: " YAPI_PASS </dev/tty; echo
  yapi config init --base-url="$YAPI_URL" --auth-mode=global --email="$YAPI_EMAIL" >/dev/null
  yapi login --base-url="$YAPI_URL" --email="$YAPI_EMAIL" --password="$YAPI_PASS" >/dev/null && ok "yapi CLI 已登录" || die "登录失败，检查地址、邮箱、密码"
  unset YAPI_PASS
else
  todo "登录 YApi 一次：yapi config init --base-url=<YApi 地址> --auth-mode=global --email=<邮箱> && yapi login --base-url=<YApi 地址> --email=<邮箱> --password=<密码>"
fi

echo
echo "装好了。项目事实（返回格式、成功码、test 域名、YApi 项目 id、测试数据）由 AI 第一次跑 /opsx:propose 时自己读代码补齐，读不到的它会问你一次。"
todo "把 .claude/ openspec/ CLAUDE.md 提交进 git"
todo "test 环境要 cookie 才能过的话（风控、登录态），在 Chrome 里对 test 域名设一次，见 README"
