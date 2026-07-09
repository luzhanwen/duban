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
      <p className="text-sm text-ink-soft">本地优先，使用你自己的 API Key</p>
      <h2 className="mt-2 font-serif text-3xl text-ink">隐私说明</h2>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-soft">
        读伴采用本地优先设计：你的书籍、笔记和阅读进度默认保存在本机；
        API Key 在浏览器版保存在当前浏览器，在桌面版保存在系统钥匙串。只有当你主动生成导读或提问时，相关文本才会发送给你选择的模型服务商。
      </p>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <PrivacyCard
          title="书籍文件"
          stored="浏览器版保存在当前浏览器；桌面版原始文件保存在本机 App 数据目录，书籍信息和分页文本保存在本机数据库。"
          sent="生成整本书导读、章节导读、伴读问答、本书读伴聊天或读后交流时，会把必要的章节文本、当前页文本、阅读进度、读伴记忆或抽样文本发送给当前模型服务商。"
          note="书籍默认留在本机；云端同步和分享由你自己决定。"
        />
        <PrivacyCard
          title="API Key"
          stored="浏览器版保存在当前浏览器；桌面版保存在系统钥匙串。下载当前配置时，TXT 文件也会包含 API Key。"
          sent="测试连接或调用 AI 时，Key 会作为请求头发送给你选择的模型服务商。自定义 Base URL 时，Key 会发送到你填写的地址。"
          note="请把 Key 当作密码保存；下载配置后，只放在你信任的位置。"
        />
        <PrivacyCard
          title="笔记与高亮"
          stored="浏览器版保存在当前浏览器；桌面版保存在本机数据库。"
          sent="读后交流里如果你选择带入伴读问答和笔记，这些内容会作为上下文发送给当前模型服务商。"
          note="笔记默认留在本机；触发 AI 功能或自行导出时，才会离开当前设备。"
        />
        <PrivacyCard
          title="聊天记录"
          stored="浏览器版保存在当前浏览器；桌面版按书籍与阅读项保存在本机数据库。"
          sent="继续同一段伴读问答或读后交流时，最近的历史消息会发送给当前模型服务商，帮助模型接上上下文。"
          note="读伴只在本机保存聊天记录；模型服务商如何处理请求数据，以你所选服务商的政策为准。"
        />
      </section>

      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-7 text-amber-900">
        <h3 className="font-medium">使用时需要注意</h3>
        <p className="mt-2">
          浏览器本地存储的安全级别有限；桌面版虽然使用系统钥匙串保存 API Key，但本机恶意软件或不可信设备仍可能带来风险。
          建议只在可信设备上使用读伴，并为模型服务设置额度、限额或单独的 API Key。
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-paper-card p-5 text-sm leading-7 text-ink-soft">
        <h3 className="font-medium text-ink">你可以怎样控制数据</h3>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>在设置页可以清空全部本地数据，包括书籍、进度、聊天记录、笔记和 API Key。</li>
          <li>清理浏览器站点数据会移除浏览器版数据；桌面版清空数据会同时删除本机数据库和系统钥匙串中的读伴 API Key。</li>
          <li>下载当前 AI 配置会生成包含 API Key 的 TXT 文件，请只保存在可信位置。</li>
          <li>填写自定义 Base URL 前，请确认该服务商可信；第三方地址的安全性需要你自行判断。</li>
        </ul>
      </section>
    </div>
  );
}

function PrivacyCard({ title, stored, sent, note }) {
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
          <dt className="text-xs font-medium text-ink-soft">补充说明</dt>
          <dd className="mt-1 text-ink">{note}</dd>
        </div>
      </dl>
    </article>
  );
}
