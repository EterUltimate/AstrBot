import { defineStore } from "pinia";
import { getApiBaseUrl, normalizeConfiguredApiBaseUrl, setApiBaseUrl } from "@/utils/request";
import { safeLocalStorage } from "@/utils/storageFallback";

export type ApiPreset = {
  name: string;
  url: string;
};

export const useApiStore = defineStore("api", {
  state: () => ({
    // 优先从 safeLocalStorage 读取用户手动设置的地址
    apiBaseUrl: safeLocalStorage.getItem("apiBaseUrl") || getApiBaseUrl() || "",
    configPresets: [] as ApiPreset[],
    customPresets: JSON.parse(safeLocalStorage.getItem("customPresets") || "[]") as ApiPreset[],
  }),
  getters: {
    presets: (state): ApiPreset[] => [...state.configPresets, ...state.customPresets],
  },
  actions: {
    setPresets(presets: ApiPreset[]) {
      this.configPresets = presets;
    },

    addPreset(preset: ApiPreset) {
      this.customPresets.push(preset);
      safeLocalStorage.setItem("customPresets", JSON.stringify(this.customPresets));
    },

    removePreset(name: string) {
      this.customPresets = this.customPresets.filter((p) => p.name !== name);
      safeLocalStorage.setItem("customPresets", JSON.stringify(this.customPresets));
    },

    /**
     * 设置 API 基础地址
     * @param url 后端地址，例如 http://localhost:6185
     */
    setApiBaseUrl(url: string) {
      // Normalize: prepend https:// if missing, strip trailing slashes
      const normalized = normalizeConfiguredApiBaseUrl(url);

      this.apiBaseUrl = normalized;

      if (normalized) {
        safeLocalStorage.setItem("apiBaseUrl", normalized);
      } else {
        safeLocalStorage.removeItem("apiBaseUrl");
      }

      setApiBaseUrl(normalized);
    },

    /**
     * 初始化 API 配置
     * 通常在应用启动时调用，同步 safeLocalStorage 到 axios
     */
    init() {
      if (this.apiBaseUrl) {
        this.apiBaseUrl = setApiBaseUrl(this.apiBaseUrl);
      }
    },
  },
});
