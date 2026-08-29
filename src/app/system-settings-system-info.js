function createSystemSettingsInfoHandlers(context) {
  const document = context.document;
  const ipcRenderer = context.ipcRenderer;
  const getCurrentDate = context.getCurrentDate;
  const getCurrentDateTime = context.getCurrentDateTime;

async function loadSystemInformation() {
    try {
        // Get system info from main process
        const systemInfo = await ipcRenderer.invoke('get-system-info');

        // Update system info fields
        if (systemInfo) {
            const nodeVersionElement = document.getElementById('nodeVersion');
            if (nodeVersionElement) nodeVersionElement.textContent = systemInfo.nodeVersion || 'غير متاح';

            const electronVersionElement = document.getElementById('electronVersion');
            if (electronVersionElement) electronVersionElement.textContent = systemInfo.electronVersion || 'غير متاح';

            const osInfoElement = document.getElementById('osInfo');
            if (osInfoElement) osInfoElement.textContent = systemInfo.osInfo || 'غير متاح';

            const memoryUsageElement = document.getElementById('memoryUsage');
            if (memoryUsageElement) memoryUsageElement.textContent = systemInfo.memoryUsage || 'غير متاح';

            const uptimeElement = document.getElementById('uptime');
            if (uptimeElement) uptimeElement.textContent = systemInfo.uptime || 'غير متاح';
        }

        // Update database info
        await updateDatabaseInfo();

        // Update last update date
        const lastUpdateElement = document.getElementById('lastUpdateDate');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = getCurrentDate();
        }

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحميل معلومات النظام:', error);
    }
}

async function updateDatabaseInfo() {
    try {
        // Get database size and record count
        const dbStats = await ipcRenderer.invoke('get-database-stats');

        if (dbStats) {
            const dbSizeElement = document.getElementById('dbSize');
            if (dbSizeElement) dbSizeElement.textContent = dbStats.size || 'غير متاح';

            const recordCountElement = document.getElementById('recordCount');
            if (recordCountElement) recordCountElement.textContent = dbStats.recordCount || '0';

            const lastDbUpdateElement = document.getElementById('lastDbUpdate');
            if (lastDbUpdateElement) {
                lastDbUpdateElement.textContent = getCurrentDateTime();
            }

            const dbConnectionsElement = document.getElementById('dbConnections');
            if (dbConnectionsElement) dbConnectionsElement.textContent = '1'; // SQLite is single connection
        }

    } catch (error) {
        console.error('❌ [SETTINGS] خطأ في تحديث معلومات قاعدة البيانات:', error);
    }
}

  return {
    loadSystemInformation,
    updateDatabaseInfo
  };
}

module.exports = {
  createSystemSettingsInfoHandlers
};
