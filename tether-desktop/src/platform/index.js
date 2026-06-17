import * as darwin from "./darwin.js";
import * as win32 from "./win32.js";

const adapters = {
  darwin,
  win32,
};

export function getPlatformAdapter() {
  const adapter = adapters[process.platform];
  if (!adapter) {
    throw new Error(
      `Desktop companion is not supported on ${process.platform} yet. Use macOS or Windows.`,
    );
  }
  return adapter;
}
