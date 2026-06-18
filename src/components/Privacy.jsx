export default function Privacy({ onBack }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:bg-paper-card"
      >
        返回设置
      </button>
      <p className="text-sm text-ink-soft">本地优先与 BYOK</p>
      <h2 className="mt-2 font-serif text-3xl text-ink">隐私说明</h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-soft">
        读伴没有自己的后端账号、云书库或分析服务。你的书籍、笔记和阅读进度默认保存在本机；
        API Key 在浏览器版保存在 IndexedDB，在桌面版保存在系统 Keychain。当你主动使用 AI 能力时，相关文本会发送给你选择的模型服务商。
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <PrivacyCard
          title="书籍文件"
          stored="浏览器版保存在本机浏览器 IndexedDB；桌面版原始文件保存在 App 数据目录，书籍元数据和分页文本保存在 SQLite。"
          sent="生成整本书导读、章节导读、伴读问答或读后交流时，会把必要的章节文本、当前页文本或抽样文本发送给当前模型服务商。"
          notSent="不会上传到读伴自己的服务器，也不会默认同步到云端。"
        />
        <PrivacyCard
          title="API Key"
          stored="浏览器版保存在本机浏览器 IndexedDB；桌面版保存在系统 Keychain。下载当前配置时，TXT 文件也会包含 API Key。"
          sent="测试连接或调用 AI 时，Key 会作为请求头发送给你选择的模型服务商。自定义 Base URL 时，Key 会发送到你填写的地址。"
          notSent="不会写进代码仓库，不会发送给读伴自己的服务器。"
        />
        <PrivacyCard
          title="笔记与高亮"
          stored="浏览器版保存在本机浏览器 IndexedDB；桌面版保存在本地 SQLite。"
          sent="读后交流里如果你选择带入伴读问答和笔记，这些内容会作为上下文发送给当前模型服务商。"
          notSent="不会公开发布，也不会离开当前浏览器，除非你主动触发相关 AI 功能或之后自行导出。"
        />
        <PrivacyCard
          title="聊天记录"
          stored="浏览器版保存在本机浏览器 IndexedDB；桌面版按书籍与阅读项保存在本地 SQLite。"
          sent="继续同一段伴读问答或读后交流时，最近的历史消息会发送给当前模型服务商，帮助模型接上上下文。"
          notSent="不会被读伴用于训练，也不会上传到读伴自己的服务器。模型服务商如何处理数据，以你所选服务商的政策为准。"
        />
      </section>

      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
        <h3 className="font-medium">需要你知道的边界</h3>
        <p className="mt-2">
          IndexedDB 不是硬件级安全存储；桌面版虽然使用系统 Keychain 保存 API Key，但本机恶意软件或不可信设备仍可能带来风险。
          建议只在可信设备上使用读伴，并为模型服务设置额度、限额或单独的 API Key。
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-5 text-sm leading-7 text-ink-soft">
        <h3 className="font-medium text-ink">你可以怎样控制数据</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>在设置页可以清空全部本地数据，包括书籍、进度、聊天记录、笔记和 API Key。</li>
          <li>清理浏览器站点数据会移除浏览器版数据；桌面版清空数据会同时删除 SQLite 数据和 Keychain 中的读伴 API Key。</li>
          <li>下载当前 AI 配置会生成包含 API Key 的 TXT 文件，请只保存在可信位置。</li>
          <li>填写自定义 Base URL 前，请确认该服务商可信；读伴无法替你验证第三方地址是否安全。</li>
        </ul>
      </section>
    </div>
  );
}

function PrivacyCard({ title, stored, sent, notSent }) {
  return (
    <article className="rounded-xl border border-line bg-paper-card p-5 shadow-sm">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      <dl className="mt-4 space-y-3 text-sm leading-6">
        <div>
          <dt className="text-xs font-medium text-ink-soft">存在哪里</dt>
          <dd className="mt-1 text-ink">{stored}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-soft">会发给谁</dt>
          <dd className="mt-1 text-ink">{sent}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-ink-soft">不会发给谁</dt>
          <dd className="mt-1 text-ink">{notSent}</dd>
        </div>
      </dl>
    </article>
  );
}
