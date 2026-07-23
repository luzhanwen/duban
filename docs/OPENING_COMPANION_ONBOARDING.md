# 开书读伴设定流程（历史档案）

> 最后更新：2026-07-22
>
> 状态：完成阶段档案。本文中的分层 SVG、暖黄纸片和旧外观字段描述只反映当时实现，已经过时；当前形象、硬规则、软记忆、按需上下文和禁止主动提问的边界，以 [P7 计划](./COMPANION_ACTIVE_READING_PLAN.md)、[UI 标准](./UI_DESIGN_STANDARDS.md) 和 [统一陪读上下文](./READING_CONTRACT_CONTEXT.md) 为准。

本文档记录开书设置从“先等待整本书导读”改为“先和新读伴对话”的产品设计、数据边界和实现结果。它补充 [READING_CONTRACT_CONTEXT.md](./READING_CONTRACT_CONTEXT.md) 的数据说明，以及 [UI_CHANGELOG.md](./UI_CHANGELOG.md) 的界面演进记录。

## 背景问题

旧版开书设置把“生成整本书导读”放在第一步。这个设计有几个体验问题：

- 等待时间长，用户会被卡在开书页，无法自然继续设置节奏或开始阅读。
- 生成完成后仍然展示大块导读和诊断信息，视觉上像任务还没结束。
- 快速导读容易变成抽象分析，甚至用“这本书不是……”开头，先纠正用户而不是邀请用户进入书。
- 用户自己的阅读来意被处理成后台字段，缺少“我带着自己的问题进入这本书”的感觉。

新的产品判断是：开书不应该先让用户等待一份报告，而应该先让用户和即将陪读这本书的读伴建立关系。

## 设计目标

新流程的核心目标是让开书像一段安静的入书前对话：

1. 新读伴先出现，用对话气泡打招呼。
2. 页面保持纯净，只显示空白读伴、对话气泡、当前问题和回答入口。
3. 用户经过几轮对话，依次说明自己带着什么来读、想在书里找到什么、希望读伴怎么陪。
4. 读伴的样貌随着回答逐步完善，从空白小圆轮廓长出小圆耳、脸部内圈、小豆眼、腮红和右上书签。
5. 整本书开书地图从第一步移走，不再和读伴设定对话挤在同一窗口里。
6. 保存后，多轮对话进入 `readingProfile.companionFocus`，后续章节导读、阅读中问答和读后交流都可以读取。

这个流程的体验原则是：

- 先接住用户，再分析书。
- 先让人愿意翻开书，再提供地图。
- 开书地图是读伴的准备工作，不是第一步对话舞台的一部分。
- 用户原话要被保留，不能只压缩成笼统标签。

## 界面流程

当前 `ReadingPlanSetup.jsx` 的步骤变为：

1. `设定读伴`：读伴以空白形态出现，和用户进行几轮开场对话。
2. `阅读节奏`：选择轻松、标准或深入节奏，并设置开始日期、每周阅读日和长章节拆分。
3. `计划预览`：确认阅读计划并保存。

第一步是一个纯净对话舞台，不再显示顶部步骤卡、书籍统计摘要、开书地图、路线、难点、token 或费用信息。

当前对话轮次：

| 轮次 | 作用 | 读伴变化 |
| --- | --- | --- |
| Intro | 显示“Hi，我是读伴，你的阅读助手。接下来，我们会进行几轮对话，真正定制你的阅读体验。” | 空白小圆读伴轮廓 |
| 来处 | 询问用户已经带着什么印象、经验或疑问来到这本书前 | 小圆耳、脸部内圈、小豆眼和腮红出现 |
| 好奇心 | 询问用户最想在书里找到什么 | 右上书签和小书图标出现 |
| 陪读方式 | 询问用户希望读伴怎么陪，只保留文字回答和少量灵感按钮 | 描边和颜色轮廓更明确 |
| 成形 | 给读伴取名、换颜色、改表情，并保存这本书的专属读伴 | 颜色和表情完成定制 |

每一轮只展示一个问题、一个回答框和少量回答灵感，避免把设置页重新做成信息面板。陪读方式不再作为独立页面出现，也不再额外展示选择卡片。

头像实现已经从多层 DOM 拼图切换为独立 SVG 组件 `ReadingCompanionAvatar.jsx`。SVG 按底板、耳朵、头部、脸部内圈、眼睛、腮红、表情和书签分层，当前已支持阶段渐显、眨眼、耳朵轻动和书签轻晃，后续可以继续添加更细的待机动画或表情切换。

## 数据记录

保存开书设置时，`buildCompanionFocus` 会把用户捎话写入单本书读伴记忆。

主要字段：

```js
readingProfile.companionFocus = {
  schemaVersion: 1,
  type: "mainline",
  label: "帮我抓主线",
  openingMessage: "用户开书前捎给读伴的话",
  openingAnswers: {
    context: "用户带着什么来读",
    curiosity: "用户想在书里找到什么",
    companion: "用户希望读伴怎么陪"
  },
  companionProfile: {
    name: "读伴",
    color: "sage",
    expression: "gentle"
  },
  customFocus: "用户在自定义陪读方式中填写的目标",
  userText: "openingMessage 和 customFocus 的合并文本",
  aiSummary: "读伴对这段捎话和陪读方式的理解",
  promptInstruction: "后续导读、问答和读后交流应如何参考这段记忆",
  selectedFromWholeBookGuide: true,
  updatedAt: "ISO 时间"
}
```

兼容策略：

- 旧书没有 `openingMessage` 时，仍然读取旧的 `userText` 作为开书捎话。
- 旧书没有 `openingAnswers` 时，会把旧的 `openingMessage` 或 `userText` 放入第一轮 `context`，避免历史记忆丢失。
- 旧书没有 `companionProfile` 时，使用默认名字、颜色和表情。
- 非自定义陪读方式不会把 `customFocus` 写入额外目标。
- 后续 `buildReadingContractContext` 继续通过 `userText`、`aiSummary` 和 `promptInstruction` 给章节导读、阅读中问答和读后交流提供上下文。
- 阅读器里的「记忆」面板仍然可以编辑同一个 `companionFocus`，不改变阅读计划、进度、笔记或历史问答。

## 开书地图和 Prompt 约束

`wholeBookGuide.md` 的用户输入从“用户已知阅读意图”改为“用户给读伴捎的话”。当这段话有具体内容时，模型必须把它当成读伴记忆：

- `overview` 要自然接住用户捎话。
- `fullOverview` 要说明这本书如何回应用户的好奇、已有背景或阅读期待。
- `difficultyMap.supportStrategy` 至少有 2 条贴合用户捎话。
- `companionFocusOptions` 至少有 1 条专门回应用户捎话。

额外增加的文风约束：

- `overview` 第一段第一句必须正面说明这本书是什么、带你进入什么问题，或你可以从哪里进入。
- 不要用“这本书不是”“它不是”“并非”“不要把它看成”这类否定句开头。
- 不要先纠正用户，也不要把用户可能的误解放在第一句。
- 展示文字要尽量少用“不是……而是……”这类固定对照。

## 相关实现

主要改动文件：

- `src/components/ReadingPlanSetup.jsx`
  - 新增 `OpeningCompanionIntro`。
  - 新增 `OPENING_DIALOG_ROUNDS`，管理 Intro、来处、好奇心、陪读方式和成形五个状态。
  - 第一轮隐藏顶部步骤卡、书籍统计摘要和开书地图区域。
  - 保存时把 `openingAnswers`、`openingMessage` 和 `companionProfile` 写入 `companionFocus`。
  - 展示 Markdown 前会把误露出的 `\n` 转成真实换行。

- `src/index.css`
  - 新增纯净开场舞台、读伴逐步成形、名字、颜色、表情、对话气泡、回答框和进度条样式。
  - 移动端改为单列布局，避免对话区和预览区挤压。

- `src/prompts/wholeBookGuide.md`
  - 将用户输入定位从阅读意图改为给读伴的捎话。
  - 增加正面开场和慎用否定句的要求。

## 验证记录

已执行：

```bash
npm run build
```

结果：

- 构建通过。
- 仅保留 Vite 的 chunk 体积提示。
- 本地开发服务器可在 `http://localhost:5174/` 预览。

浏览器验证时，当前测试书仍处于“待确认”状态。继续进入真实开书页需要点击“保存并进入开书分析”，会修改本地书库状态，因此没有为了截图执行该保存动作。

## 后续建议

1. 用一本文本较完整的书走完整开书流程，验证捎话是否自然进入章节导读、问答和读后交流。
2. 观察每一轮问题是否足够像对话，而不是变成问卷。
3. 如果开书地图仍然需要保留入口，应放到后续步骤或后台任务，不回到第一步舞台。
4. 为 `buildCompanionFocus`、`buildOpeningMessage`、`normalizeOpeningAnswers`、`normalizeCompanionProfile` 和 `cleanGuideDisplayText` 补单元测试，覆盖旧书兼容、空对话、自定义侧重点、外观默认值和 `\n` 修复。
