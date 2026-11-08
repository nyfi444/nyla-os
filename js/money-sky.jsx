/* Cosmic > Financial Astrology: money timing from her own chart.

   The page itself is drawn by js/money-sky-view.js on top of
   js/money-sky-core.js, the same two files the Semester HQ Business OS and
   Company HQ use (they get copies from tools/sync-money-sky.mjs), so all three
   dashboards always say the same thing. This file only gives it the Nyla OS
   colors and her two business names.

   Remembers only device-local view choices (msk_* keys, never synced).
   Loads before the main app script: top level must not touch app globals.
   The only top-level name is MoneySkyPage. */

const MoneySkyPage = () => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !window.moneySkyView) return undefined;
    const h = window.moneySkyView.mount(ref.current, {
      loadAstronomy,
      names: [{ label: 'Semester HQ', name: 'Semester HQ' }, { label: 'Business OS', name: 'Business OS' }],
      businesses: ['semesterhq', 'businessos'],
      showTitle: false,
    });
    return () => h.destroy();
  }, []);
  const vars = { '--msk-ink': C.text, '--msk-muted': C.textLight, '--msk-line': C.border, '--msk-card': C.card, '--msk-soft': C.secondaryBg, '--msk-accent': C.rose };
  return (
    <div>
      <PageTitle subtitle="Money timing from your own chart · astrology, numerology, Matrix of Destiny and Human Design">💸 Financial Astrology</PageTitle>
      <div ref={ref} style={vars} />
    </div>
  );
};
