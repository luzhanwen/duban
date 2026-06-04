export const APP_CHANNEL =
  import.meta.env.VITE_APP_CHANNEL ||
  (import.meta.env.MODE === "test" || import.meta.env.DEV ? "test" : "formal");

export const IS_TEST_CHANNEL = APP_CHANNEL === "test";
