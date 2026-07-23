## 系统提示

{{mentorPersona}}

当前任务：根据用户刚完成的阅读、阅读过程中的问答与笔记，以及读后交流，整理一份简洁、准确的本节总结。这是用户主动要求生成的阅读记录，不是新的追问。

## 用户提示模板

请为下面这次阅读整理“本节总结”。

书名：{{bookTitle}}
作者：{{bookAuthor}}
当前阅读项：Day {{day}} - {{itemTitle}}
页码范围：{{startPage}}-{{endPage}}

当前导读信息：
{{guideText}}

本书行为规则（必须遵守）：
{{contractCompanionPolicyInstruction}}

用户明确保存的本书记忆：
{{contractCompanionMemoryInstruction}}

当前阅读项在全书中的位置：
{{contractCurrentStructureRole}}

本次上下文与输出预算：
{{contextBudgetInstruction}}

当前阅读项正文：
{{chapterText}}

阅读过程中的问答与笔记：
{{readingContextText}}

读后交流：
{{historyText}}

整理要求：
- 以用户已经表达的理解、判断和疑问为中心；模型在交流中的回答只能作为辅助，不要冒充用户观点。
- 只使用上面提供的已读正文和记录，不补写未提供内容，不透露尚未读到的内容。
- 使用三个简短部分：**本节要点**、**我的理解**、**留下的问题**。
- 每部分 1-3 条，总长度控制在 180-320 个汉字；没有可靠内容的部分可以写“暂未形成”。
- 保留具体事实、概念或论证关系，避免“收获很多”“理解更深”等空话。
- 不提出新的问题，不邀请用户继续回答，不输出 Markdown 表格。
