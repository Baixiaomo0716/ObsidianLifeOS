export function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
    record: "M5 3h14v18H5Z M8 7h8 M8 11h8 M8 15h5",
    review: "M12 8v5l4 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
    riji: "M5 3h14v18H5Z M8 7h8 M8 11h8 M8 15h5",
    jizhang: "M12 3v18 M16 7c-1-3-8-3-8 1s8 3 8 7-7 4-8 1",
    daiban: "M4 4h16v16H4Z M8 12l3 3 5-6",
    xiangmu: "M3 6h7l2 3h9v12H3Z",
    yuedu: "M12 5v16 M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2Z",
    yingshi: "M3 8h18v13H3Z M3 8V4h18v4 M7 4l-2 4 M13 4l-2 4 M19 4l-2 4",
    youxi: "M7 7h10l4 12h-4l-3-3h-4l-3 3H3Z M7 10v5 M5 12h4 M16 11h1 M18 14h1",
    yanchu: "M10 17V4l10-2v13 M10 4l10-2 M10 17c0 4-7 4-7 1s7-4 7-1 M20 15c0 4-7 4-7 1s7-4 7-1",
    lvxing: "m3 10 7 1 7-8 3 1-5 9 5 5-2 2-6-4-5 5-2-1 3-7Z",
    zhishi: "m2 9 10-6 10 6-10 6Z M6 12v6l6 3 6-3v-6",
  };
  return <svg className="lifeos-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.record} /></svg>;
}
