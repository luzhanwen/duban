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
- `backups/duban-backup-tampered-v3/manifest.json`
  - manifest hash 故意错误。
  - 用于校验报告负向测试。

## MOBI 样本策略

当前仓库不提交二进制 MOBI fixture。MOBI 用人工本地授权样本验证：

- 公版或开源授权书籍。
- 用户自写内容生成的 MOBI/AZW3。
- 不含版权受限正文、私人笔记、聊天记录或 API Key。

执行 QA 时，在测试记录里写清楚 MOBI 样本的文件名、大小、章节数和来源授权摘要即可，不要把该文件提交到仓库。

## 重新生成

```bash
npm run qa:fixtures
```

生成后检查：

```bash
git diff -- qa-fixtures scripts/generate_qa_fixtures.mjs package.json
```

如果 storage schema 或 backupVersion 升级，重新运行脚本并更新相关 QA 文档。
