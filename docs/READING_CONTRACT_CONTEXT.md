# 开书契约上下文

> 最后更新：2026-06-15

本文档记录“开书契约上下文”的实现进展、设计意义和使用边界。它不是 prompt 文案文档，而是维护章节导读、阅读中问答、读后交流可以复用的轻量上下文能力。

## 当前状态

开书契约上下文已经完成第一轮主链路接入：

- `src/lib/readingContract.js`
- 导出 `buildReadingContractContext({ book, item })`
- 已接入章节导读、阅读中问答和读后交流
- 已支持单本书 `readingProfile.companionFocus` 的安全更新

这个函数从当前书籍对象和当前阅读计划项中抽取一份统一上下文，输出字段包括：

- `bookProblem`
- `coreQuestion`
- `companionFocus`
- `currentStructureRole`
- `currentDifficultyHints`
- `currentKeyTurns`
- `suggestedReadingPath`
- `planAdvice`
- `sourceLimitations`
- `available`

最初只新增上下文构建能力；截至 2026-06-15，章节导读、阅读中问答、读后交流已经统一使用这份轻量上下文。后续重点不再是继续铺入口，而是验证它是否真正让读伴显得更有全书视野，而不是机械复述开书分析。

## 为什么有意义

读伴后续的三个核心场景都需要知道同一件事：用户正在读的这一项，和整本书的开书契约有什么关系。

- 章节导读需要知道当前章节在全书结构中的位置。
- 阅读中问答需要知道用户选择的读伴侧重点，不要回答完就散掉。
- 读后交流需要追问用户是否更接近自己的阅读目标。

如果每个场景各自临时拼上下文，会出现字段不一致、旧书兼容逻辑重复、prompt 接入难以控制的问题。现在先把上下文构建做成纯函数，后续只需要在各生成入口 import 这一份数据，接入会更稳，也更容易测试。

## 兼容策略

旧书不会因为缺字段而中断阅读。

- 没有 `book.wholeBookGuide` 时，整本书导读相关字段返回空字符串或空数组，`available.wholeBookGuide` 为 `false`。
- 没有 `readingProfile.companionFocus` 时，根据旧版 `readingProfile.purpose` 保守映射：
  - `overview` -> `mainline`
  - `study` -> `background`
  - `deep` -> `argument`
  - `research` -> `output`
- 如果旧 `purpose` 也没有，默认使用 `mainline`。

默认 `promptInstruction` 会保持简短，避免提前改变 prompt 行为。

## 当前阅读项匹配

当前只做明确的 `chapterIds` 交集匹配：

- `item.chapterIds`
- `wholeBookGuide.structureMap[].chapterIds`
- `wholeBookGuide.difficultyMap[].chapterIds`
- `wholeBookGuide.keyTurns[].chapterIds`

只要有交集，就认为对应结构单元、难点或关键转折与当前阅读项相关。没有命中时返回空字符串或空数组，不根据标题、页码或语义做猜测。

这个选择偏保守，原因是后续 prompt 一旦使用这份上下文，错误匹配会比空上下文更容易误导读者。

## 纯函数边界

`buildReadingContractContext` 保持纯数据处理：

- 不返回 JSX。
- 不调用模型。
- 不读写 IndexedDB。
- 不依赖 React 状态。
- 只使用现有 `toText` / `cleanText` 清洗字符串。

这让它可以被章节导读、阅读中问答、读后交流共用，也方便后续补单元测试。

## 读伴记忆可编辑

`readingProfile.companionFocus` 是单本书的读伴记忆。它既来自开书设置，也可以在阅读过程中被安全更新。

当前数据层入口：

- `src/lib/books.js`
- `updateBookCompanionFocus(bookId, companionFocusPatch)`

这个函数只更新当前书籍元数据里的 `readingProfile.companionFocus`，不会修改 `wholeBookGuide`、`readingPlan`、阅读进度、伴读问答、读后交流、笔记或历史导读缓存。

兼容策略：

- 旧书没有 `readingProfile` 时，会创建一个兼容的 `readingProfile`。
- 旧书已有 `purpose`、`pace`、`startDate`、`weekdays` 等字段时，会原样保留。
- 旧书没有 `companionFocus` 时，会先生成默认读伴记忆，再合并更新 patch。
- `type` 不合法时回退到 `mainline`。
- `label`、`promptInstruction` 等空字符串字段会按类型补默认值。
- 更新后仍然保存在 `books` 列表里，不新增 IndexedDB key。

## 后续验证建议

当前开书契约上下文已经接入：

- 章节导读
- 阅读中问答
- 读后交流

后续重点不再是继续接入新场景，而是验证和调优：

1. 用旧书、没有 `wholeBookGuide` 的书、新版开书流程生成的书分别测试。
2. 检查导读、问答、读后交流是否会自然使用开书契约，而不是机械复述。
3. 如果多个生成入口的契约格式化逻辑重复明显，可以再抽出共享 formatter。
4. 后续可以补充单元测试，覆盖旧书兼容、`chapterIds` 匹配、空上下文、不同 `companionFocus` 类型。

## 开发记录

### 2026-06-15：第二步，接入章节导读

本次把 `buildReadingContractContext({ book, item })` 接入了章节导读生成链路。

改动文件：

- `src/lib/readingGuides.js`
- `src/prompts/readingGuide.md`

具体更新：

- 在 `readingGuides.js` 中引入 `buildReadingContractContext`。
- 在构建章节导读 prompt 前生成 `contractContext`。
- 将契约上下文格式化为 prompt 变量，而不是把完整对象直接塞进 prompt。
- 已传入章节导读的字段包括：
  - `bookProblem`
  - `coreQuestion`
  - `companionFocus.label`
  - `companionFocus.userText`
  - `companionFocus.aiSummary`
  - `companionFocus.promptInstruction`
  - `currentStructureRole`
  - `currentDifficultyHints`
  - `currentKeyTurns`
  - `suggestedReadingPath`
  - `sourceLimitations`
  - `available` 摘要
- 在 `readingGuide.md` 中新增“开书契约上下文”输入段。
- 在章节导读规则中要求：
  - 有全书问题意识时，把当前阅读项放回整本书的问题中。
  - 有结构位置时，说明今天这段在全书推进中的作用。
  - 有难点提示时，提前帮助用户留意可能卡住的地方。
  - 有读伴侧重点时，让 `goals` 和 `questions` 体现用户真实目标。
  - 空字段不编造，不提“缺少上下文”。

保持不变：

- 没有接入 `readingChat.js`。
- 没有接入 `readingReflection.js`。
- 没有改 UI。
- 没有改变 IndexedDB 数据结构。
- 章节导读输出结构仍是 `overview`、`goals`、`questions`。

验证：

- `npm run build` 通过。
- 构建只出现既有的大 chunk 提示。

### 2026-06-15：第三步，接入阅读中问答

本次把 `buildReadingContractContext({ book, item })` 接入了阅读中问答生成链路。

接入目标不是让每次回答都复述开书契约，而是让读伴在解释当前页、当前段、当前概念后，能自然收束回整本书的问题意识、当前阅读项的位置和用户选择的读伴侧重点。

改动文件：

- `src/lib/readingChat.js`
- `src/prompts/readingChat.md`

具体更新：

- 在 `readingChat.js` 中引入 `buildReadingContractContext`。
- 在构建阅读中问答 prompt 前生成 `contractContext`。
- 将契约上下文格式化为 prompt 变量，没有把完整对象直接塞进 prompt。
- 已传入阅读中问答的字段包括：
  - `bookProblem`
  - `coreQuestion`
  - `companionFocus.label`
  - `companionFocus.userText`
  - `companionFocus.aiSummary`
  - `companionFocus.promptInstruction`
  - `currentStructureRole`
  - `currentDifficultyHints`
  - `currentKeyTurns`
  - `suggestedReadingPath`
  - `sourceLimitations`
  - `available` 摘要
- 在 `readingChat.md` 中新增“开书契约上下文”输入段。
- 在阅读中问答规则中要求：
  - 开书契约是方向盘，不是每次都要复述的材料。
  - 用户问具体原文、概念、当前页或当前段时，先直接回答用户问题。
  - 自然相关时，再用 1-2 句话收束回全书问题、当前结构位置或读伴侧重点。
  - 空字段不编造，不提“缺少上下文”。

保持不变：

- 没有接入 `readingReflection.js`。
- 没有改 UI。
- 没有改变 IndexedDB 数据结构。
- 没有改变聊天消息保存结构。
- 没有改变流式输出方式。

验证：

- `npm run build` 通过。
- 构建只出现既有的大 chunk 提示。

### 2026-06-15：第四步，接入读后交流

本次把 `buildReadingContractContext({ book, item })` 接入了读后交流生成链路。

接入目标不是让读后交流复述开书契约，而是让读伴在接住用户读后回答后，能围绕整本书的问题意识、当前阅读项的位置、用户选择的读伴侧重点，以及用户读中问答和笔记，提出更贴近阅读目标的追问。

改动文件：

- `src/lib/readingReflection.js`
- `src/prompts/readingReflection.md`

具体更新：

- 在 `readingReflection.js` 中引入 `buildReadingContractContext`。
- 在构建读后交流 prompt 前生成 `contractContext`。
- 将契约上下文格式化为 prompt 变量，没有把完整对象直接塞进 prompt。
- 已传入读后交流的字段包括：
  - `bookProblem`
  - `coreQuestion`
  - `companionFocus.label`
  - `companionFocus.userText`
  - `companionFocus.aiSummary`
  - `companionFocus.promptInstruction`
  - `currentStructureRole`
  - `currentDifficultyHints`
  - `currentKeyTurns`
  - `suggestedReadingPath`
  - `sourceLimitations`
  - `available` 摘要
- 在 `readingReflection.md` 中新增“开书契约上下文”输入段。
- 在读后交流规则中要求：
  - 开书契约是追问方向，不是每次都要复述的材料。
  - 先接住用户刚才的读后回答，再判断是否可以收束到全书问题、当前结构位置或读伴侧重点。
  - 伴读问答和笔记仍然可以自然引用，但不机械复述。
  - 空字段不编造，不提“缺少上下文”。
  - 仍然只追问 1 个问题。

保持不变：

- 没有改 UI。
- 没有改变 IndexedDB 数据结构。
- 没有改变读后交流消息保存结构。
- 没有改变流式输出方式。

验证：

- `npm run build` 通过。
- 构建只出现既有的大 chunk 提示。

### 2026-06-15：读伴记忆数据层

本次完善了单本书 `readingProfile.companionFocus` 的数据层更新能力。

改动文件：

- `src/lib/books.js`

具体更新：

- 完善 `updateBookCompanionFocus(bookId, companionFocusPatch)`。
- 新增并导出：
  - `normalizeCompanionFocus(value)`
  - `getDefaultCompanionFocus(type)`
  - `companionFocusLabelByType(type)`
  - `companionFocusInstructionByType(type)`
- 保存时会保留原有 book 字段和 `readingProfile` 字段，只合并更新 `companionFocus`。
- 自动补齐 `readingProfile.updatedAt`、book `updatedAt`、`companionFocus.updatedAt` 和 `companionFocus.schemaVersion`。
- 旧书没有 `readingProfile` 或 `companionFocus` 时也能保存。
- 没有新增 IndexedDB key，仍然写回 `books` 列表。

保持不变：

- 没有修改 `wholeBookGuide`。
- 没有修改 `readingPlan`。
- 没有清空 progress、chat、reflection、notes 或历史导读缓存。
- 没有调用模型。
- 没有新增 UI。

验证：

- `normalizeCompanionFocus` 的纯函数样例通过。
- 规范化后的 `companionFocus` 放入 book 后，`buildReadingContractContext({ book, item })` 可以读到新的读伴记忆。
- `npm run build` 通过。
- 构建只出现既有的大 chunk 提示。
