export function initResponsiveToolbarToggle() {
  const toolbar = document.querySelector('#toolbarPanel');
  const toggleBtn = document.querySelector('#toolbarToggleBtn');
  const backdrop = document.querySelector('#toolbarBackdrop');
  if (!toolbar || !toggleBtn || !backdrop) return;

  const phoneMediaQuery = window.matchMedia('(max-width: 768px)');
  const setOpenState = (open) => {
    const shouldOpen = !!open && phoneMediaQuery.matches;
    document.body.classList.toggle('toolbar-open', shouldOpen);
    toggleBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    backdrop.hidden = !shouldOpen;
  };
  const syncToggleButtonVisibility = () => {
    const isPhone = phoneMediaQuery.matches;
    toggleBtn.style.display = isPhone ? 'grid' : 'none';
    if (!isPhone) setOpenState(false);
  };

  toggleBtn.addEventListener('click', () => {
    setOpenState(!document.body.classList.contains('toolbar-open'));
  });
  backdrop.addEventListener('click', () => setOpenState(false));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpenState(false);
  });
  const onMediaChange = (event) => {
    if (!event.matches) setOpenState(false);
    syncToggleButtonVisibility();
  };
  if (typeof phoneMediaQuery.addEventListener === 'function') {
    phoneMediaQuery.addEventListener('change', onMediaChange);
  } else if (typeof phoneMediaQuery.addListener === 'function') {
    phoneMediaQuery.addListener(onMediaChange);
  }
  setOpenState(false);
  syncToggleButtonVisibility();
}
