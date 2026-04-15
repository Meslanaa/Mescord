import { AnimatePresence, motion } from "framer-motion";

function statusLabel(status) {
  if (status === "available") {
    return "Yeni surum hazir";
  }

  if (status === "downloading") {
    return "Indiriliyor";
  }

  if (status === "downloaded") {
    return "Indirme tamamlandi";
  }

  if (status === "checking") {
    return "Kontrol ediliyor";
  }

  if (status === "error") {
    return "Hata";
  }

  return "Guncelleme";
}

export default function DesktopUpdateModal({
  isOpen,
  state,
  appInfo,
  onClose,
  onCheck,
  onDownload,
  onInstall,
}) {
  if (!isOpen) {
    return null;
  }

  const progress = Math.max(0, Math.min(100, Number(state.progress || 0)));
  const canDownload = state.status === "available";
  const canInstall = state.status === "downloaded";
  const headerVersion = state.downloadedVersion || state.availableVersion;

  return (
    <AnimatePresence>
      <motion.div
        className="update-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.section
          className="update-modal"
          initial={{ opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: 0.26, ease: "easeOut" }}
        >
          <header className="update-modal-head">
            <div>
              <p>{statusLabel(state.status)}</p>
              <h3>Mescord Desktop {headerVersion ? `v${headerVersion}` : ""}</h3>
              {appInfo?.appVersion ? <small>Mevcut surum: v{appInfo.appVersion}</small> : null}
            </div>
            <button className="modal-close-btn" type="button" onClick={onClose}>
              Kapat
            </button>
          </header>

          <div className="update-modal-body">
            <p>{state.error || state.message || "Guncelleme durum bilgisi burada gorunur."}</p>

            {state.status === "downloading" ? (
              <div className="update-progress-wrap" role="progressbar" aria-valuenow={progress}>
                <div className="update-progress-fill" style={{ width: `${progress}%` }} />
                <span>%{Math.round(progress)}</span>
              </div>
            ) : null}
          </div>

          <footer className="update-modal-actions">
            <button type="button" className="soft-btn" onClick={onCheck}>
              Kontrol Et
            </button>
            {canDownload ? (
              <button type="button" className="primary-btn" onClick={onDownload}>
                Guncellemeyi Indir
              </button>
            ) : null}
            {canInstall ? (
              <button type="button" className="primary-btn" onClick={onInstall}>
                Simdi Yeniden Baslat
              </button>
            ) : null}
          </footer>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
}
