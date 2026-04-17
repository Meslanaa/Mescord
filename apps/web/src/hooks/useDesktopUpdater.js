import { useCallback, useEffect, useState } from "react";

const INITIAL_STATE = {
  status: "idle",
  message: "",
  availableVersion: "",
  downloadedVersion: "",
  progress: 0,
  error: "",
};

export function useDesktopUpdater() {
  const desktopApi = window.mescordDesktop;
  const isDesktop = Boolean(desktopApi?.isDesktop);

  const [appInfo, setAppInfo] = useState(null);
  const [state, setState] = useState(INITIAL_STATE);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const applyEvent = useCallback((eventPayload = {}) => {
    if (!eventPayload.type) {
      return;
    }

    if (eventPayload.type === "checking") {
      setState((prev) => ({
        ...prev,
        status: "checking",
        message: "Guncelleme kontrol ediliyor...",
        error: "",
      }));
      return;
    }

    if (eventPayload.type === "available") {
      setState((prev) => ({
        ...prev,
        status: "available",
        availableVersion: eventPayload.info?.version || "",
        message: "Yeni Mescord surumu bulundu. Arka planda indiriliyor...",
        error: "",
      }));
      setIsModalOpen(true);
      return;
    }

    if (eventPayload.type === "not-available") {
      setState((prev) => ({
        ...prev,
        status: "up-to-date",
        message: "Su an en guncel surumu kullaniyorsun.",
        error: "",
      }));
      return;
    }

    if (eventPayload.type === "download-progress") {
      setState((prev) => ({
        ...prev,
        status: "downloading",
        progress: Number(eventPayload.progress?.percent || 0),
        message: "Guncelleme indiriliyor...",
      }));
      setIsModalOpen(true);
      return;
    }

    if (eventPayload.type === "downloaded") {
      setState((prev) => ({
        ...prev,
        status: "downloaded",
        downloadedVersion: eventPayload.info?.version || prev.availableVersion,
        message: "Guncelleme indirildi. Simdi Kur butonuyla mevcut kurulum klasorune guncelleyebilirsin.",
        progress: 100,
      }));
      setIsModalOpen(true);
      return;
    }

    if (eventPayload.type === "installing") {
      setState((prev) => ({
        ...prev,
        status: "installing",
        message: eventPayload.message || "Guncelleme arka planda kuruluyor...",
        progress: 100,
        error: "",
      }));
      setIsModalOpen(true);
      return;
    }

    if (eventPayload.type === "dev-mode") {
      setState((prev) => ({
        ...prev,
        status: "info",
        message: eventPayload.message || "Update kontrolu sadece paketli surumde aciktir.",
      }));
      return;
    }

    if (eventPayload.type === "error") {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: eventPayload.error || "Bilinmeyen update hatasi",
      }));
      setIsModalOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      return undefined;
    }

    desktopApi
      .getAppInfo()
      .then((info) => {
        setAppInfo(info);
      })
      .catch(() => {
        setAppInfo(null);
      });

    const unsubscribe = desktopApi.onUpdateEvent((eventPayload) => {
      applyEvent(eventPayload);
    });

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [applyEvent, desktopApi, isDesktop]);

  const checkForUpdates = useCallback(async () => {
    if (!isDesktop) {
      return { ok: false, reason: "not-desktop" };
    }

    const result = await desktopApi.checkForUpdates();
    if (!result.ok && result.message) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: result.message,
      }));
      setIsModalOpen(true);
    }

    return result;
  }, [desktopApi, isDesktop]);

  const downloadUpdate = useCallback(async () => {
    if (!isDesktop) {
      return { ok: false, reason: "not-desktop" };
    }

    const result = await desktopApi.downloadUpdate();
    if (!result.ok && result.message) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: result.message,
      }));
      setIsModalOpen(true);
    }

    return result;
  }, [desktopApi, isDesktop]);

  const installUpdate = useCallback(async () => {
    if (!isDesktop) {
      return { ok: false, reason: "not-desktop" };
    }

    return desktopApi.installUpdate();
  }, [desktopApi, isDesktop]);

  const dismissModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  return {
    isDesktop,
    appInfo,
    state,
    isModalOpen,
    dismissModal,
    openModal,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  };
}
