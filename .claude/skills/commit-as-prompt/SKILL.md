---
name: commit-as-prompt
description: 根据当前暂存区/工作区的改动，生成一条结构化的 commit log，明确写出 Why（为什么做这次提交）、What（提交了什么）、How（怎么做的），并执行提交。用户输入 /commit-as-prompt 时使用；也适用于用户说"帮我写 commit"、"提交一下并写清楚原因"等场景。
---

# commit-as-prompt

把一次提交写成一段"给未来读者的 prompt"：读 commit log 的人不看 diff 也能回答三个问题——**为什么改、改了什么、怎么改的**。

## 工作流程

0. **先处理 OpenSpec 归档**（仓库用了 OpenSpec 才做；`$ARGUMENTS` 含 `--no-archive` 时整步跳过）

   ```bash
   ROOT=$(git rev-parse --show-toplevel) && ls -d "$ROOT"/openspec/changes/*/ 2>/dev/null | grep -v '/archive/$'
   ```

   - 没有 `openspec/` 目录，或除 `archive/` 外没别的 → 跳过本步，直接进第 1 步。
   - 有未归档的 change → 读它的 `tasks.md` 判断完成度（只有 `- [x]` / `- [X]` 算完成，`- [ ]`、`- []`、`- [~]`、`- [-]` 都算没完成）：
     - **任务全部勾完** → 先执行 `/opsx:archive <change-name>`，等它把 change 移进 `openspec/changes/archive/YYYY-MM-DD-<name>/`、同步完 specs 再回来。归档产生的文件移动**要和代码改动一起进这次提交**，不要单独提一次。
     - **还有任务没勾完** → 不要自动归档：半截的 change 归档会把没做完的 spec 同步进主 specs。问用户一句「change `<name>` 还有 N 个任务没勾完，先直接提交，还是先归档？」，默认直接提交。
   - 多个未归档 change → 列出来让用户选，不要替用户挑。
   - 归档过了，第 1 步收集上下文时记得重新跑 `git status`，改动文件列表已经变了。

1. **收集上下文**（一次并行执行）：
   ```bash
   git status --short
   git diff --cached --stat
   git diff --cached
   git log --oneline -10
   ```
   - 暂存区为空但工作区有改动：先列出改动文件，问用户是全部 `git add -A` 还是只加部分；用户在 `$ARGUMENTS` 中已经说明的，直接照做。
   - 暂存区和工作区都为空：告诉用户没有可提交内容，结束。
   - 在默认分支（master/main）上：提醒一句，但仍按用户意愿提交，不自行建分支。

3. **理解改动**：逐个文件读 diff，归纳出这次提交的**单一意图**。如果 diff 明显包含两件不相关的事（例如一个 bug 修复 + 一个无关的重构），提示用户拆成两次提交，并给出拆分建议；用户坚持一起提交则照做。

4. **推断 Why**：优先级依次为
   - 用户在 `$ARGUMENTS` 里给出的说明
   - 本次会话中用户之前描述的需求 / 问题
   - diff 本身透露的信息（修复了什么异常路径、补了什么缺失的分支、新增了什么能力）
   - 仍然推断不出时，**问用户一句**"这次改动是为了解决什么问题？"，不要编造业务背景。

5. **生成 commit message**，格式见下文。

6. **展示并确认**：把完整 message 打给用户看。用户说"直接提交"、"不用确认"或 `$ARGUMENTS` 含 `-y` / `--yes` 时跳过确认。

7. **执行提交**：用 heredoc 传多行 message，避免引号转义问题：
   ```bash
   git commit -m "$(cat <<'MSG'
   <message>
   MSG
   )"
   ```
   提交后输出 `git log -1 --stat` 的结果。

## Commit message 格式

```
<type>: <一句话描述，≤ 50 字，动词开头，不加句号>

Why:
  <为什么要做这次提交：解决什么问题 / 满足什么需求 / 消除什么风险。
   写触发原因，而不是复述改动。1–3 行。>

What:
  - <改动点 1：改了哪个模块 / 文件 / 行为>
  - <改动点 2>
  - <涉及数据结构、接口、配置、队列契约等对外可见的变化要单独列出>
  - <本次顺带归档了 OpenSpec change 的，单列一条：归档 openspec change <name>>

How:
  <采用了什么方案、为什么选这个方案而不是别的、有什么取舍或已知限制。
   如果改法很直白（比如改个拼写），一行即可；不要硬凑。>

<可选：关联 issue / PR / 文档 / OpenSpec change，
 如 Refs: #123、See: docs/business-logic.md §7、Refs: openspec/changes/archive/2026-09-21-add-snapshot-api>

```

### `type` 取值

`feature | fix | opt`（团队规范，和分支类型一致）

判断规则：
- 新增对外能力 → `feature`
- 修正错误行为 → `fix`
- 其余（重构、性能、文档、配置、脚本、测试） → `opt`

如果当前仓库的 CLAUDE.md / CONTRIBUTING.md 规定了别的 type 集合或格式（例如要求 scope `fix(video):`），**以仓库规范为准**。

### 语言

- 跟随用户提问所用的语言；用户用中文就写中文，用英文就写英文。
- 仓库历史 commit（`git log`）明显是单一语言时，跟随仓库历史。
- 标题行中的 `type` 始终是英文小写。

## 写作要求

- **不写本机私有信息。** `openspec/` 没进 git 的仓库（被 `.git/info/exclude` 或 `.gitignore` 忽略）不要写 `Refs: openspec/...`，同事打不开；个人笔记库的路径、任务编号同样不写。
- **不加任何 AI 署名。** 提交信息末尾不写 `Co-Authored-By: Claude ...`，也不写 `Generated with Claude Code` 之类的字样。提交只属于提交人本人（团队约定）。

- **Why 写动机，不写结果。** ❌ "新增了重试逻辑" ✅ "Redis 抖动时任务会直接丢失，线上一天丢 30+ 条"
- **What 写事实，可核对。** 每条能在 diff 里找到对应；不要写"优化了代码"这种无法核对的话。
- **How 写决策，不写流水账。** 说明"为什么这样做"比"做了 A 然后 B 然后 C"更有价值。有替代方案被否决时写一句为什么。
- 不写"本次提交"、"我"这类主语；不写"简单"、"只是"这类淡化措辞。
- 标题行不要超过 72 个字符，正文每行不超过 100 个字符。
- 不猜测、不夸大影响范围；不确定的写"可能"，或者去问用户。

## 示例

```
fix: 修复 video_update_task 消费时 keywords 字段为空导致的落库失败

Why:
  fastdata_video 在 AI 分析超时时会回写 keywords 为空数组，PHP 侧
  updateVideoVttFromQueue() 未做空值判断，直接 implode 报 TypeError，
  导致同一 video_id 后续的 analysis、status 消息全部堆积在队列里。

What:
  - VideoService::updateVideoVttFromQueue() 对 keywords 增加空数组/null 判断
  - 空 keywords 时跳过该字段更新，不再中断后续消息处理
  - 补充单测覆盖 keywords 为 []、null、缺失三种情况

How:
  只在 PHP 消费侧兜底，不改 Go 侧回写协议：队列契约（business-logic.md §7）
  本来就允许 keywords 为空，问题出在消费方假设过强。
  没有选择在 Go 侧过滤空消息，因为 status 消息需要照常回写。

```

## 参数

`$ARGUMENTS` 支持：
- 任意自由文本 → 作为 Why 的补充说明
- `-y` / `--yes` → 跳过确认直接提交
- `--no-add` → 只提交已暂存内容，不询问是否 `git add`
- `--dry-run` → 只生成 message，不执行 `git commit`
- `--no-archive` → 跳过第 0 步的 OpenSpec 归档检测，直接提交
