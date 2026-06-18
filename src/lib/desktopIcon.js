import { isTauriRuntime } from "./runtime.js";

let desktopIconInitialized = false;

export async function initializeDesktopWindowIcon() {
  if (desktopIconInitialized || !isTauriRuntime()) return;
  desktopIconInitialized = true;

  try {
    const [{ getCurrentWindow }, iconResponse] = await Promise.all([
      import("@tauri-apps/api/window"),
      fetch("/app-icon.png"),
    ]);

    if (!iconResponse.ok) return;

    const iconBytes = new Uint8Array(await iconResponse.arrayBuffer());
    await getCurrentWindow().setIcon(iconBytes);
  } catch (error) {
    console.info("Desktop window icon setup skipped.", error);
  }
}
