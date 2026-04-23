function createSidebarToggleHandlers(deps) {
  const document = deps.document;
  const windowObj = deps.windowObj || globalThis;
  const localStorageObj = deps.localStorageObj || windowObj.localStorage;
  const logger = deps.logger || console;

  let sidebarCollapsed = false;

  function applySidebarState() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const toggleBtn = document.getElementById('sidebarToggle');
    const fixedToggleBtn = document.getElementById('fixedSidebarToggle');
    const body = document.body;

    if (!sidebar || !mainContent || !toggleBtn || !fixedToggleBtn) {
      logger.error('Sidebar toggle: Required elements not found');
      return;
    }

    if (sidebarCollapsed) {
      sidebar.classList.add('collapsed');
      mainContent.classList.add('expanded');
      toggleBtn.classList.add('collapsed');
      sidebar.setAttribute('aria-hidden', 'true');
      toggleBtn.setAttribute('aria-expanded', 'false');
      fixedToggleBtn.setAttribute('aria-expanded', 'false');
      if (body && body.classList) {
        body.classList.add('sidebar-collapsed');
      }

      fixedToggleBtn.style.display = 'flex';
      fixedToggleBtn.classList.remove('hidden');

      toggleBtn.title = 'إظهار القائمة الجانبية (Ctrl+B)';
      toggleBtn.setAttribute('aria-label', 'إظهار القائمة الجانبية');
      fixedToggleBtn.title = 'إظهار القائمة الجانبية (Ctrl+B)';
      fixedToggleBtn.setAttribute('aria-label', 'إظهار القائمة الجانبية');
      return;
    }

    sidebar.classList.remove('collapsed');
    mainContent.classList.remove('expanded');
    toggleBtn.classList.remove('collapsed');
    sidebar.setAttribute('aria-hidden', 'false');
    toggleBtn.setAttribute('aria-expanded', 'true');
    fixedToggleBtn.setAttribute('aria-expanded', 'true');
    if (body && body.classList) {
      body.classList.remove('sidebar-collapsed');
    }

    fixedToggleBtn.style.display = 'none';
    fixedToggleBtn.classList.add('hidden');

    toggleBtn.title = 'إخفاء القائمة الجانبية (Ctrl+B)';
    toggleBtn.setAttribute('aria-label', 'إخفاء القائمة الجانبية');
    fixedToggleBtn.title = 'إظهار القائمة الجانبية (Ctrl+B)';
    fixedToggleBtn.setAttribute('aria-label', 'إظهار القائمة الجانبية');
  }

  function saveSidebarState() {
    try {
      if (!localStorageObj) {
        return;
      }

      localStorageObj.setItem('sidebarCollapsed', sidebarCollapsed.toString());
      logger.log('Sidebar state saved:', sidebarCollapsed);
    } catch (error) {
      logger.error('Error saving sidebar state:', error);
    }
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    applySidebarState();
    saveSidebarState();

    logger.log('Sidebar toggled. New state:', sidebarCollapsed ? 'collapsed' : 'expanded');
  }

  function resetSidebarState() {
    sidebarCollapsed = false;
    applySidebarState();
    saveSidebarState();
    logger.log('Sidebar state reset to expanded');
  }

  function isSidebarCollapsed() {
    return sidebarCollapsed;
  }

  function initializeSidebarToggle() {
    if (localStorageObj && localStorageObj.getItem('sidebarCollapsed') === 'true') {
      sidebarCollapsed = true;
      applySidebarState();
    }

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    });

    logger.log('Sidebar toggle initialized. Current state:', sidebarCollapsed ? 'collapsed' : 'expanded');
    logger.log('Keyboard shortcut: Ctrl+B (or Cmd+B on Mac) to toggle sidebar');
  }

  windowObj.toggleSidebar = toggleSidebar;
  windowObj.resetSidebarState = resetSidebarState;
  windowObj.isSidebarCollapsed = isSidebarCollapsed;

  return {
    initializeSidebarToggle,
    toggleSidebar,
    applySidebarState,
    saveSidebarState,
    resetSidebarState,
    isSidebarCollapsed
  };
}

module.exports = {
  createSidebarToggleHandlers
};
