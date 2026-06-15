# 读伴文档索引

> 最后更新：2026-06-15

这个目录保存「读伴」的项目说明、路线图、UI 标准和开发日志。后续维护文档时，先看这份索引，再决定内容应该写到哪里。

## 文档分工

| 文档 | 用途 | 适合记录 |
| --- | --- | --- |
| [PROJECT_NOTES.md](./PROJECT_NOTES.md) | 项目总记录 | 产品愿景、核心流程、已确认需求、架构共识、数据结构、完整开发日志、已知限制 |
| [ROADMAP.md](./ROADMAP.md) | 路线图 | 当前状态、阶段目标、优先级、Backlog、暂不优先事项 |
| [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md) | 开书契约上下文 | 统一上下文构建函数、字段含义、兼容策略、三类 prompt 接入记录、读伴记忆数据层 |
| [UI_DESIGN_STANDARDS.md](./UI_DESIGN_STANDARDS.md) | UI 设计标准 | 视觉气质、色彩字体、布局比例、卡片边界、页面过渡、动效规范、验收清单 |
| [UI_CHANGELOG.md](./UI_CHANGELOG.md) | UI/体验更新日志 | 书架、阅读器、笔记、品牌视觉、交互细节等前端体验改动 |

## 阅读顺序

1. 想快速理解项目方向：先读 [ROADMAP.md](./ROADMAP.md)。
2. 想接手开发或理解历史决策：读 [PROJECT_NOTES.md](./PROJECT_NOTES.md)。
3. 要维护开书契约、导读/问答/读后交流 prompt 或读伴记忆：读 [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md)。
4. 要开发或修改前端界面：先读 [UI_DESIGN_STANDARDS.md](./UI_DESIGN_STANDARDS.md)。
5. 想追踪界面为什么变成现在这样：读 [UI_CHANGELOG.md](./UI_CHANGELOG.md)。

## 维护规则

- 新功能完成后，先判断它影响哪一类文档：
  - 改变产品流程、数据结构、架构共识：更新 `PROJECT_NOTES.md`。
  - 改变优先级、阶段目标或待办：更新 `ROADMAP.md`。
  - 改变开书契约上下文构建、兼容策略或 prompt 接入边界：更新 `READING_CONTRACT_CONTEXT.md`。
  - 改变视觉规范、布局标准、交互边界：更新 `UI_DESIGN_STANDARDS.md`。
  - 改变视觉、布局、交互、文案体验：更新 `UI_CHANGELOG.md`。
- 每次更新都尽量写清楚三件事：为什么改、改了什么、还有什么限制。
- `PROJECT_NOTES.md` 可以保留完整背景，但不要把所有 UI 微调都塞进去；细节优先放到 `UI_CHANGELOG.md`。
- `ROADMAP.md` 不写流水账，只写当前状态、下一步和取舍。
- `UI_DESIGN_STANDARDS.md` 是前端 UI 的护栏；新增功能时不要绕过它直接改视觉比例。
- `UI_CHANGELOG.md` 不替代产品需求文档；如果某个 UI 改动背后改变了核心流程，还要同步更新 `PROJECT_NOTES.md` 或 `ROADMAP.md`。

## 当前整理结论

- `PROJECT_NOTES.md` 是主上下文文档，但已经较长，后续新增日志应尽量按日期追加，避免在前半部分不断扩写细枝末节。
- `ROADMAP.md` 的阶段路线已经能覆盖当前方向，后续应优先维护 P0/P1 的进展和优先事项；开书契约接入已经从待办转为验证和调优任务。
- `READING_CONTRACT_CONTEXT.md` 是开书契约和单本书读伴记忆的专项来源，当前已记录章节导读、阅读中问答、读后交流三条链路的接入情况。
- `UI_DESIGN_STANDARDS.md` 用来保护现有视觉气质和组件边界，尤其是封面书架比例、封面主操作、菜单边界、动效克制和主次操作层级。
- `UI_CHANGELOG.md` 适合作为界面演进记录，尤其适合记录书架、阅读器、笔记和品牌视觉的连续试错。
