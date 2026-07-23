# 开书契约与统一陪读上下文

> 最后更新：2026-07-22

本文档保留“开书契约上下文”的演进，并记录 P7 统一陪读上下文、阅读边界和缓存来源。它不是 prompt 文案文档；产品文风维护在 `PROMPT_WRITING_STANDARDS.md`。

## 当前状态

当前分为两层：`readingContract.js` 规范化单本书的开书契约，`companionContext.js` 再按导读、问答和读后场景选择可用材料、执行防剧透边界、预算与缓存。第一轮主链路已经完成：

- `src/lib/readingContract.js`
- 导出 `buildReadingContractContext({ book, item })`
- `src/lib/companionContext.js`
- 导出统一的 `buildCompanionContext(...)`
- 已接入章节导读、阅读中问答和读后交流
- 已支持单本书 `readingProfile.companionFocus` 的安全更新
- 当前解析整本书导读时复用 `normalizeWholeBookGuide`，避免上下文构建和开书导读模块各自维护一套 JSON 修复逻辑

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

截至 2026-07-06，开书设置第一步已改为“多轮设定读伴对话”。这几轮回答会被保存到同一个 `companionFocus` 中，并通过现有开书契约上下文进入后续导读、问答和读后交流。

截至 2026-07-22，长期软记忆与后续导读之间增加了受控承接层。`buildReadingContractContext` 仍负责规范化整本书策略和记忆，`buildCompanionContext` 则根据当前场景决定哪些记忆真正进入请求：章节导读只接受当前阅读项之前、用户明确保留且本次相关的记录，最多 3 条；问答和读后继续使用各自的按需规则。该筛选不新增存储字段或 schema。

导读承接判定：

- `source: session_record` 且 `sourceItemKey` 为紧邻上一项：按连续阅读关系可用。
- `source: session_record` 且来自更早阅读项：必须与当前导读查询命中。
- `source: user`：必须与当前导读查询命中。
- `source: legacy`、当前/未来阅读项、来源项缺失或无关记录：不可用。
- 来源追踪保留 `memorySource`、`sourceItemKey`、`sourceEventId` 和 `relevance`，不保留正文。

当前主要字段：

- `type`：读伴侧重点，例如 `mainline`、`background`、`argument`、`application`、`output` 或 `custom`；当前在设定读伴最后一轮选择，不再单独开页面。
- `label`：界面展示的侧重点名称。
- `openingAnswers`：用户在设定读伴对话中的结构化回答，当前包含 `context`、`curiosity` 和 `companion`。
- `openingMessage`：由 `openingAnswers` 合成的开书前记忆文本，保留用户原意。
- `companionProfile`：本书读伴的外观档案，当前包含 `name`、`color` 和 `expression`。
- `customFocus`：当用户选择自定义陪读方式时填写的具体目标。
- `userText`：兼容字段，合并 `openingMessage` 和 `customFocus`，供旧链路和上下文格式化继续读取。
- `aiSummary`：读伴对用户捎话和陪读方式的理解。
- `promptInstruction`：后续章节导读、阅读中问答和读后交流应如何围绕这段记忆调整。

当前数据层入口：

- `src/lib/books.js`
- `updateBookCompanionFocus(bookId, companionFocusPatch)`

这个函数只更新当前书籍元数据里的 `readingProfile.companionFocus`，不会修改 `wholeBookGuide`、`readingPlan`、阅读进度、伴读问答、读后交流、笔记或历史导读缓存。

兼容策略：

- 旧书没有 `readingProfile` 时，会创建一个兼容的 `readingProfile`。
- 旧书已有 `purpose`、`pace`、`startDate`、`weekdays` 等字段时，会原样保留。
- 旧书没有 `companionFocus` 时，会先生成默认读伴记忆，再合并更新 patch。
- 旧书没有 `openingAnswers` 时，开书设置会回退读取旧的 `openingMessage` 或 `userText`，并放入第一轮 `context`。
- 旧书没有 `companionProfile` 时，开书设置使用默认名字、颜色和表情。
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

### 2026-07-06：多轮设定读伴对话进入读伴记忆

本次把开书设置第一步从“先生成整本书导读”改为“先通过几轮对话设定读伴”。用户回答会保存为 `readingProfile.companionFocus.openingAnswers`，合成为 `openingMessage`；读伴名字、颜色和表情保存为 `companionProfile`；同时同步写入 `userText`、`aiSummary` 和 `promptInstruction`，让现有 `buildReadingContractContext({ book, item })` 不需要新增读取入口也能带入这段记忆。

改动文件：

- `src/components/ReadingPlanSetup.jsx`
- `src/prompts/wholeBookGuide.md`
- `docs/OPENING_COMPANION_ONBOARDING.md`

设计说明见 [OPENING_COMPANION_ONBOARDING.md](./OPENING_COMPANION_ONBOARDING.md)。

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

## 2026-07-18：P7.7 统一按需上下文

### 唯一组装入口

书内 AI 请求统一调用：

```js
buildCompanionContext({
  scene: "readingGuide" | "readingChat" | "readingReflection",
  book,
  item,
  itemKey,
  chapterSections,
  currentPageContext,
  readingContext,
  guide,
  history,
  readingChatMessages,
  readingNotes,
  userMessage,
  quote,
  sessionOverride,
  settings,
  itemCompleted,
});
```

调用文件不得重新拼整项正文或历史材料。组装结果提供：

- `sections`：已经过筛选和预算裁剪的 prompt 材料。
- `contractPromptValues`：按场景和剧透边界裁剪后的开书契约字段。
- `contextBudgetInstruction`：简短/适中/深入对应的结构与硬预算说明。
- `maxOutputTokens`：当前策略允许的最大输出。
- `trace`：不含正文的来源、指纹、排除原因、prompt/策略/模型版本和缓存信息。

### 场景边界

- `readingGuide`：允许使用目标阅读项生成不剧透导读；严格模式不带入整书关键转折和后续阅读路径。
- `readingChat`：严格/方向模式仅使用选区、当前页、确认已读正文和相关用户记忆；允许后文模式才加入本项全文、导读和模型历史。
- `readingReflection`：当前项确认完成后可使用本项全文；未完成时只使用当前页与确认已读正文。用户勾选带入的问答和笔记按优先级选择。
- 阅读停留、翻页、高亮和窗口状态只更新进度或来源，不调用组装器后的模型路径。

### 缓存与失效

- 上下文中间材料只保存在最多 48 项的会话内 LRU，不落 SQLite，也不进入备份。
- 章节导读完整制品沿用既有 `book:{id}:questions:{itemKey}` / `reading_guides`。
- cache key 包含正文与来源指纹、开书契约/读伴侧重点、策略、模型与服务地址/profile、prompt 版本、用户问题和导读连续性。
- 正文、阅读计划连续性、策略、模型或 prompt 任一变化都会失效。
- 普通“生成导读”可以复用完全匹配制品；用户明确“重新生成导读”会绕过制品缓存。

### 隐私和兼容

- `contextTrace` 不保存书籍正文、用户问题全文或模型回答全文，只保存引用和指纹。
- usage 与费用继续保存在原导读/消息字段中；预算和调用诊断沿用 P6。
- 本轮不新增持久化 schema，桌面 schema 仍为 10、目录备份仍为 v3。

### 2026-07-16：P7.4 行为策略、记忆与单次覆盖

`buildReadingContractContext({ book, item, sessionOverride })` 现在会统一提供：

- `companionPolicy`：规范化后的有效策略；单次覆盖只在本次构建中合并。
- `companionPolicyInstruction`：剧透、回答深度、追问和知识边界的最高优先级规则，并固定要求只响应用户主动发起的阅读操作。
- `companionMemory`：用户显式保存或旧 `companionFocus` 惰性映射的可见记忆。
- `companionMemoryInstruction`：最多 8 条、总长受限的记忆文本，并明确不得把记忆当作书中事实。

接入范围：

- `readingGuides.js`：策略决定输出 token，并将行为规则和记忆带入章节导读。
- `readingChat.js`：策略决定输出 token；默认防剧透时不构建完整阅读项 `chapterText`，只保留当前可见页等已允许上下文。
- `readingReflection.js`：策略决定输出 token，并约束是否追问及知识范围。

兼容边界：

- 没有新策略的旧书使用稳定默认值，不要求迁移后才能阅读。
- 旧书中的 `proactivity` 仅作兼容字段读取，统一降级为 `quiet`，不会恢复主动提问。
- `companionFocus` 仍继续作为原有阅读目标兼容字段使用，不会被 `companionPolicy` 覆盖或删除。
- P7.6 已接入按正文块记录的已读范围；旧书或旧进度没有新字段时继续按空范围保守处理。

验证：`npm run test:companion-policy` 和 `npm run test:p7` 通过。

### 2026-07-16：P7.5 事件引用与来源锚点

- 开书契约、行为策略和软记忆的可编辑对象仍保存在 `book.readingProfile`，避免出现两份可写真相源。
- 陪读事件会保存策略/记忆快照引用、单次覆盖范围和相关问答事件 id，便于本节记录与后续诊断追踪“当时使用了什么规则”。
- 导读、聊天、读后和笔记正文仍保存在各自原表；事件只保存 payload reference 与 `sourceAnchor`，禁止复制正文到事件索引。
- P7.5 的页码、文本页、字符范围和选区矩形继续兼容；P7.6 可选增加正文块 id、块内字符范围、内容指纹和定位状态。

### 2026-07-16：防剧透上下文硬隔离

- `spoiler=avoid / hint` 时，阅读中问答只带入当前可见页、用户问题、用户引用和用户显式记忆；完整阅读项正文继续保持关闭。
- 整本书问题意识、核心问题、结构位置、难点地图、关键转折、建议阅读路径、章节导读和历史 assistant 消息均视为潜在未读内容，不进入严格请求。
- `spoiler=allow` 才恢复上述书内上下文和逐字流式回答。
- 严格回答在完整生成后经过 `sanitizeCompanionAnswerForPolicy` 检查再展示与持久化，避免传输过程中出现后文提示又在结束时消失。
- P7.6 已将系统确认读过的合格正文块加入严格请求；未读块、低质量块和整节正文仍保持关闭。

### 2026-07-17：P7.6 已读范围与来源定位

- 正文分块来自本地已有页文本，使用稳定 id、页码、阅读项、字符范围、内容指纹和质量等级描述，不向模型发送内容，也不要求旧书重新导入。
- 阅读进度按阅读项记录 `reachedRanges`、`engagedRanges` 和 `completedAt`。翻到某页只算到达；可见停留、划词、提问、记笔记或完成本节才算确认阅读。
- `spoiler=avoid / hint` 的阅读中问答使用当前可见页，加上系统确认已读且文本质量合格的历史正文块；跳页形成的空档、未读页和低质量块不会进入请求。
- 来源定位 v2 增加 `contentBlockId`、`blockCharRange`、`contentFingerprint` 和 `anchorStatus`。旧 v1 仍可读取；文本轻微变化时可尝试回找，失败时返回失效状态。
- `readStateByItemKey` 保存在既有 `reading_progress.raw_json`，来源字段保存在既有事件/笔记/聊天 JSON；SQLite schema 和备份格式不变。

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
