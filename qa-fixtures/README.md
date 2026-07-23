# 读伴 QA Fixtures

> 这些样本用于 P6.10 QA 矩阵。运行 `npm run qa:fixtures` 可重新生成确定性的合成文件和 `fixtures.json`。

## 可提交样本

- `books/duban-qa-two-page.pdf`
  - 合成两页 PDF。
  - 用于 PDF 导入、阅读器打开、翻页 smoke test。
- `books/duban-qa-corrupt.pdf`
  - 故意损坏的 PDF。
  - 用于导入失败和友好错误测试。
- `books/duban-qa-mini-book.html`
  - 自写 HTML 源文本。
  - 不是可导入 MOBI；保留给后续生成合法 MOBI fixture。
- `backups/duban-backup-empty-v3/manifest.json`
  - 空目录式备份 manifest。
  - 用于备份预览和校验 smoke test；merge import 是 no-op，replace import 会清空当前数据，人工测试时要谨慎。
- `backups/duban-backup-companion-events-v3/manifest.json`
  - P7.5/P7.9.3 合成书籍、跨阅读项记忆与统一陪读事件备份，不含真实正文、问答或私人笔记。
  - 用于验证来源锚点、两条记忆与本节记录关联、删除 tombstone、schema 10 导入和重复合并去重。
- `backups/duban-backup-tampered-v3/manifest.json`
  - manifest hash 故意错误。
  - 用于校验报告负向测试。

## MOBI 样本策略

当前仓库不提交二进制 MOBI fixture。MOBI 用人工本地授权样本验证：

- 公版或开源授权书籍。
- 用户自写内容生成的 MOBI/AZW3。
- 不含版权受限正文、私人笔记、聊天记录或 API Key。

执行 QA 时，在测试记录里写清楚 MOBI 样本的文件名、大小、章节数和来源授权摘要即可，不要把该文件提交到仓库。

## 本地合成长书

运行 `npm run qa:synthetic-books` 会在 `output/pdf/duban-synthetic-qa/` 生成四本不提交 Git 的自写 PDF：

- `01-standard-outline.pdf`：96 页，标准 PDF 目录，覆盖完整业务流程。
- `02-spaced-frontmatter.pdf`：54 页，覆盖标题空格、出版说明、参考书目和附录识别。
- `03-no-outline-layout.pdf`：72 页，不含 PDF 目录，覆盖页面大标题识别。
- `04-large-outline.pdf`：220 页，覆盖大体量导入、打开、分页和性能观察。

正文都是确定性的占位文本，不含真实作品内容、私人数据或密钥。AI 端到端测试只选一本代表性样本，避免重复产生费用。

## 重新生成

```bash
npm run qa:fixtures
npm run qa:synthetic-books
```

生成后检查：

```bash
git diff -- qa-fixtures scripts/generate_qa_fixtures.mjs package.json
```

如果 storage schema 或 backupVersion 升级，重新运行脚本并更新相关 QA 文档。
