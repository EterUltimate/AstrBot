import { defineStore } from "pinia";
import { router } from "@/router";
import { createLoginProof, type LoginChallenge } from "@/utils/authLoginProof";
import axios from "@/utils/request";
import { safeLocalStorage } from "@/utils/storageFallback";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    // @ts-expect-error
    username: "",
    returnUrl: null,
  }),
  actions: {
    async finishAuthenticatedSession(data: any): Promise<void> {
      this.username = data.username;
      safeLocalStorage.setItem("user", this.username);
      safeLocalStorage.setItem("token", data.token);
      const passwordUpgradeRequired = !!data?.password_upgrade_required;
      const passwordWarning = !!data?.change_pwd_hint || (!!data?.legacy_pwd_hint && !passwordUpgradeRequired);
      if (passwordWarning) {
        safeLocalStorage.setItem("change_pwd_hint", "true");
        if (data?.legacy_pwd_hint && !passwordUpgradeRequired) {
          safeLocalStorage.setItem("legacy_pwd_hint", "true");
        } else {
          safeLocalStorage.removeItem("legacy_pwd_hint");
        }
      } else {
        safeLocalStorage.removeItem("change_pwd_hint");
        safeLocalStorage.removeItem("legacy_pwd_hint");
      }
      if (passwordUpgradeRequired) {
        safeLocalStorage.setItem("password_upgrade_required", "true");
      } else {
        safeLocalStorage.removeItem("password_upgrade_required");
      }

      const onboardingCompleted = await this.checkOnboardingCompleted();
      this.returnUrl = null;
      if (passwordWarning) {
        router.push("/auth/setup");
        return;
      }
      if (onboardingCompleted) {
        router.push("/dashboard/default");
      } else {
        router.push("/welcome");
      }
    },
    async login(
      username: string,
      password: string,
      code?: string,
      trustDeviceToken = false,
    ): Promise<"totp_required" | undefined> {
      try {
        const res = await axios.post(
          "/api/auth/login",
          {
            username: username,
            password: password,
            code: code,
            trust_device_flag: trustDeviceToken,
          },
          {
            validateStatus: (status) => (status >= 200 && status < 300) || status === 401,
          },
        );

        if (res.status === 401 && res.data?.data?.totp_required) {
          return "totp_required";
        }

        if (res.data.status === "error") {
          return Promise.reject(res.data.message);
        }

        await this.finishAuthenticatedSession(res.data.data);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    async setup(username: string, password: string, confirmPassword: string): Promise<void> {
      try {
        const endpoint = this.has_token() ? "/api/auth/setup-authenticated" : "/api/auth/setup";
        const res = await axios.post(endpoint, {
          username: username,
          password: password,
          confirm_password: confirmPassword,
        });

        if (res.data.status === "error") {
          return Promise.reject(res.data.message);
        }

        await this.finishAuthenticatedSession(res.data.data);
      } catch (error) {
        return Promise.reject(error);
      }
    },
    async checkOnboardingCompleted(): Promise<boolean> {
      try {
        // 1. 检查平台配置
        const platformRes = await axios.get("/api/config/get");
        const hasPlatform = (platformRes.data.data.config.platform || []).length > 0;
        if (!hasPlatform) return false;

        // 2. 检查提供者配置
        const providerRes = await axios.get("/api/config/provider/template");
        const providers = providerRes.data.data?.providers || [];
        const sources = providerRes.data.data?.provider_sources || [];
        const sourceMap = new Map();
        sources.forEach((s: any) => sourceMap.set(s.id, s.provider_type));

        const hasProvider = providers.some((provider: any) => {
          if (provider.provider_type) return provider.provider_type === "chat_completion";
          if (provider.provider_source_id) {
            const type = sourceMap.get(provider.provider_source_id);
            if (type === "chat_completion") return true;
          }
          return String(provider.type || "").includes("chat_completion");
        });

        return hasProvider;
      } catch (e) {
        console.error("Failed to check onboarding status:", e);
        return false;
      }
    },
    logout() {
      this.username = "";
      safeLocalStorage.removeItem("user");
      safeLocalStorage.removeItem("token");
      safeLocalStorage.removeItem("change_pwd_hint");
      safeLocalStorage.removeItem("legacy_pwd_hint");
      safeLocalStorage.removeItem("password_upgrade_required");
      void axios.post("/api/auth/logout").catch(() => undefined);
      router.push("/auth/login");
    },
    has_token(): boolean {
      return !!safeLocalStorage.getItem("token");
    },
  },
});
