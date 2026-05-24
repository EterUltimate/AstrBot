class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

type StorageName = "localStorage" | "sessionStorage";

function isStorageUsable(storage: Storage | undefined): storage is Storage {
  if (!storage) {
    return false;
  }
  const probeKey = "__astrbot_storage_probe__";
  try {
    storage.setItem(probeKey, "1");
    const usable = storage.getItem(probeKey) === "1";
    storage.removeItem(probeKey);
    return usable;
  } catch {
    return false;
  }
}

function getNativeStorage(name: StorageName): Storage | undefined {
  try {
    return window[name];
  } catch {
    return undefined;
  }
}

function installStorageFallback(name: StorageName): void {
  if (typeof window === "undefined" || isStorageUsable(getNativeStorage(name))) {
    return;
  }

  const fallback = new MemoryStorage();
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      value: fallback,
    });
  } catch {
    // Some restricted browser contexts may reject redefining storage. In that
    // case callers will keep seeing the native failure rather than a partial shim.
  }
}

function createSafeStorage(name: StorageName): Storage {
  const fallback = new MemoryStorage();

  function activeStorage(): Storage {
    const nativeStorage = getNativeStorage(name);
    return isStorageUsable(nativeStorage) ? nativeStorage : fallback;
  }

  return {
    get length(): number {
      return activeStorage().length;
    },
    clear(): void {
      activeStorage().clear();
    },
    getItem(key: string): string | null {
      return activeStorage().getItem(key);
    },
    key(index: number): string | null {
      return activeStorage().key(index);
    },
    removeItem(key: string): void {
      activeStorage().removeItem(key);
    },
    setItem(key: string, value: string): void {
      activeStorage().setItem(key, value);
    },
  };
}

installStorageFallback("localStorage");
installStorageFallback("sessionStorage");

export const safeLocalStorage = createSafeStorage("localStorage");
export const safeSessionStorage = createSafeStorage("sessionStorage");
