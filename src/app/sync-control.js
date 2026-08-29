function createSyncControl(deps) {
  const doc = deps.document;
  const ipc = deps.ipcRenderer;
  const swal = deps.Swal;
  const logger = deps.logger || console;
  const setTimeoutFn = deps.setTimeoutFn || setTimeout;
  const setIntervalFn = deps.setIntervalFn || setInterval;

  async function isSyncEnabled() {
    try {
      const result = await ipc.invoke('get-sync-status');
      return result.success && result.isEnabled;
    } catch (error) {
      logger.error('❌ [SYNC] خطأ في التحقق من حالة المزامنة:', error);
      return false;
    }
  }

  async function updateSyncUI() {
    try {
      const syncStatusBadge = doc.getElementById('syncStatusBadge');
      const toggleSyncBtn = doc.getElementById('toggleSyncBtn');
      const syncBtnText = doc.getElementById('syncBtnText');

      if (!syncStatusBadge || !toggleSyncBtn) {
        return;
      }

      const result = await ipc.invoke('get-sync-status');
      if (!result.success) {
        return;
      }

      const { isRunning, isEnabled } = result;
      if (isRunning) {
        syncStatusBadge.className = 'badge bg-success';
        syncStatusBadge.textContent = '✅ نشطة';
      } else {
        syncStatusBadge.className = 'badge bg-warning text-dark';
        syncStatusBadge.textContent = '⏸️ متوقفة';
      }

      if (syncBtnText) {
        if (isEnabled) {
          toggleSyncBtn.className = 'btn btn-lg w-100 btn-warning';
          syncBtnText.textContent = '⏸️ إيقاف المزامنة';
        } else {
          toggleSyncBtn.className = 'btn btn-lg w-100 btn-success';
          syncBtnText.textContent = '▶️ تفعيل المزامنة';
        }
      }

      const syncLastUpdate = doc.getElementById('syncLastUpdate');
      if (syncLastUpdate) {
        const now = new Date().toLocaleString('ar-SA', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        syncLastUpdate.textContent = `آخر تحديث: ${now}`;
      }
    } catch (error) {
      logger.error('❌ [SYNC-UI] خطأ في تحديث واجهة المزامنة:', error);
    }
  }

  async function toggleSync() {
    const toggleSyncBtn = doc.getElementById('toggleSyncBtn');
    const syncBtnText = doc.getElementById('syncBtnText');
    const syncBtnSpinner = doc.getElementById('syncBtnSpinner');

    if (!toggleSyncBtn) {
      return;
    }

    try {
      toggleSyncBtn.disabled = true;
      if (syncBtnSpinner && syncBtnSpinner.classList) {
        syncBtnSpinner.classList.remove('d-none');
      }
      if (syncBtnText) {
        syncBtnText.textContent = 'جاري العملية...';
      }

      const statusResult = await ipc.invoke('get-sync-status');
      if (!statusResult.success) {
        throw new Error('فشل الحصول على حالة المزامنة');
      }

      const newState = !statusResult.isEnabled;
      const result = await ipc.invoke('toggle-sync', newState);
      if (!result.success) {
        throw new Error(result.error || 'فشل تبديل حالة المزامنة');
      }

      const message = newState ? 'تم تفعيل المزامنة بنجاح ✅' : 'تم إيقاف المزامنة مؤقتاً ⏸️';
      const alertType = newState ? 'success' : 'warning';

      await swal.fire({
        icon: alertType,
        title: message,
        timer: 2000,
        showConfirmButton: false,
        position: 'top-end',
        toast: true
      });

      await updateSyncUI();
    } catch (error) {
      logger.error('❌ [SYNC-TOGGLE] خطأ في تبديل المزامنة:', error);
      await swal.fire({
        icon: 'error',
        title: 'خطأ',
        text: 'حدث خطأ في تبديل حالة المزامنة: ' + error.message,
        confirmButtonText: 'حسناً'
      });
      await updateSyncUI();
    } finally {
      toggleSyncBtn.disabled = false;
      if (syncBtnSpinner && syncBtnSpinner.classList) {
        syncBtnSpinner.classList.add('d-none');
      }
    }
  }

  function initializeSyncControls() {
    const toggleSyncBtn = doc.getElementById('toggleSyncBtn');
    if (!toggleSyncBtn) {
      return;
    }

    toggleSyncBtn.addEventListener('click', toggleSync);

    const systemTab = doc.getElementById('system-tab');
    if (systemTab) {
      systemTab.addEventListener('click', () => {
        setTimeoutFn(() => updateSyncUI(), 100);
      });
    }

    updateSyncUI();
    setIntervalFn(updateSyncUI, 30000);
  }

  return {
    isSyncEnabled,
    updateSyncUI,
    toggleSync,
    initializeSyncControls
  };
}

module.exports = {
  createSyncControl
};
