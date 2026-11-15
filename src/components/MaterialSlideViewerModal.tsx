import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  Minus,
  PenTool,
  Plus,
  Search,
} from 'lucide-react';
import type { MaterialSlidePage, SessionMaterialItem } from '../types/portal';

interface MaterialSlideViewerModalProps {
  material: SessionMaterialItem;
  onClose: () => void;
  onAnnotateSlide?: (dataUrl: string, label: string) => void;
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(/\s+/);
  let line = '';
  let curY = y;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, curY);
      line = words[i];
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, curY);
    curY += lineHeight;
  }
  return curY;
}

export function renderMaterialPageToDataUrl(
  material: SessionMaterialItem,
  page: MaterialSlidePage
): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Clean slide background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 1280, 720);

  // Top decorative corner shapes matching academic slide deck aesthetic
  ctx.fillStyle = '#BAE6FD';
  ctx.beginPath();
  ctx.ellipse(90, 40, 210, 90, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(1190, 60, 170, 95, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Brand header
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 20px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RAMU SCHOOL · ACADEMIC DECK', 640, 56);

  ctx.fillStyle = '#0369A1';
  ctx.font = 'bold 28px Inter, system-ui, sans-serif';
  ctx.fillText(page.heading, 640, 108);

  ctx.fillStyle = '#475569';
  ctx.font = '18px Inter, system-ui, sans-serif';
  ctx.fillText(page.subheading || material.title, 640, 140);

  ctx.textAlign = 'left';
  let cursorY = 186;

  // Optional metadata table (Page 1 syllabus / lesson sheet)
  if (page.tableRows && page.tableRows.length > 0) {
    const row = page.tableRows[0];
    const tableX = 96;
    const tableW = 1088;
    const colWidths = [140, 140, 120, 250, 278, 160];
    const headers = [
      'Chapter Seq',
      'Lesson Seq',
      'Serial No.',
      'Chapter Name',
      'Lesson Name',
      'Lesson Type',
    ];
    const vals = [row.seq || '—', row.seq || '—', row.serial, row.chapter, row.lesson, row.type];

    // Header row
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(tableX, cursorY, tableW, 46);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    let colX = tableX;
    headers.forEach((h, idx) => {
      ctx.fillText(h, colX + 12, cursorY + 29);
      colX += colWidths[idx];
    });
    cursorY += 46;

    // Data row
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(tableX, cursorY, tableW, 70);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tableX, cursorY, tableW, 70);

    ctx.fillStyle = '#0F172A';
    ctx.font = '15px Inter, system-ui, sans-serif';
    colX = tableX;
    vals.forEach((v, idx) => {
      wrapCanvasText(ctx, String(v), colX + 12, cursorY + 26, colWidths[idx] - 20, 20);
      colX += colWidths[idx];
    });
    cursorY += 70;

    // Attachment row
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(tableX, cursorY, tableW, 44);
    ctx.strokeRect(tableX, cursorY, tableW, 44);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 14px Inter, system-ui, sans-serif';
    ctx.fillText('Content PPT', tableX + 16, cursorY + 28);
    ctx.fillStyle = '#0284C7';
    ctx.font = '14px Inter, system-ui, sans-serif';
    ctx.fillText(row.attachment, tableX + 260, cursorY + 28);
    cursorY += 76;
  }

  // Teaching points bullets
  if (page.bodyBullets && page.bodyBullets.length > 0) {
    ctx.fillStyle = '#0F172A';
    ctx.font = '20px Inter, system-ui, sans-serif';
    for (const bullet of page.bodyBullets.slice(0, 6)) {
      ctx.fillStyle = '#0284C7';
      ctx.beginPath();
      ctx.arc(114, cursorY - 6, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1E293B';
      cursorY = wrapCanvasText(ctx, bullet, 134, cursorY, 1020, 30);
      cursorY += 12;
    }
  }

  // Key Formula Box
  if (page.keyFormula) {
    const boxY = Math.min(cursorY + 12, 595);
    ctx.fillStyle = '#EFF6FF';
    ctx.fillRect(104, boxY, 1072, 68);
    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = 2;
    ctx.strokeRect(104, boxY, 1072, 68);
    ctx.fillStyle = '#1D4ED8';
    ctx.font = 'bold 14px Inter, system-ui, sans-serif';
    ctx.fillText('KEY FORMULA / PRINCIPLE', 128, boxY + 24);
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 20px monospace';
    ctx.fillText(page.keyFormula, 128, boxY + 52);
  }

  // Footer
  ctx.fillStyle = '#94A3B8';
  ctx.font = '13px Inter, system-ui, sans-serif';
  ctx.fillText(`Ramu School · ${material.title} · Page ${page.pageNo}`, 96, 694);

  return canvas.toDataURL('image/png');
}

export const MaterialSlideViewerModal: React.FC<MaterialSlideViewerModalProps> = ({
  material,
  onClose,
  onAnnotateSlide,
}) => {
  const pages = material.pages.length > 0 ? material.pages : [];
  const [pageIdx, setPageIdx] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [zoom, setZoom] = useState(1);

  const currentPage = pages[pageIdx] || {
    pageNo: 1,
    heading: material.title,
    subheading: 'Ramu School Teaching Resource',
    bodyBullets: ['Annotated classroom slide deck & revision notes.'],
  };

  useEffect(() => {
    setPageInput(String(pageIdx + 1));
  }, [pageIdx]);

  const handlePageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(pageInput);
    if (!Number.isNaN(num) && num >= 1 && num <= Math.max(1, pages.length)) {
      setPageIdx(num - 1);
    } else {
      setPageInput(String(pageIdx + 1));
    }
  };

  const handleExportSlidePng = () => {
    const dataUrl = renderMaterialPageToDataUrl(material, currentPage);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${material.title.replace(/[^a-z0-9_-]/gi, '_')}-p${currentPage.pageNo}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleAnnotateOnBoard = () => {
    if (!onAnnotateSlide) return;
    const dataUrl = renderMaterialPageToDataUrl(material, currentPage);
    if (!dataUrl) return;
    onAnnotateSlide(dataUrl, `${material.title} · Page ${currentPage.pageNo}`);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={material.title}
      className="fixed inset-0 z-[70] flex flex-col bg-[#16191e] text-white"
    >
      {/* Top Dark Viewer Header matching uploaded slide viewer screenshot */}
      <header className="h-14 px-4 sm:px-6 bg-[#101c2d] border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wider uppercase text-slate-100 hover:text-sky-300 cursor-pointer whitespace-nowrap"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>BACK</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold truncate">{material.title}</span>
          <span className="hidden sm:inline text-[11px] font-mono text-slate-400">
            ({material.fileType})
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onAnnotateSlide && (
            <button
              type="button"
              onClick={handleAnnotateOnBoard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Annotate on Board</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportSlidePng}
            aria-label="Download slide PNG"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Save PNG</span>
          </button>
        </div>
      </header>

      {/* Main Dark Slide Stage */}
      <div className="relative flex-1 overflow-auto p-4 sm:p-8 flex items-start justify-center">
        <button
          type="button"
          title="Download High-Res Slide"
          onClick={handleExportSlidePng}
          className="fixed right-6 top-20 z-10 w-9 h-9 rounded-lg bg-[#0d1117]/90 border border-slate-700 flex items-center justify-center text-slate-200 hover:bg-slate-800 cursor-pointer"
        >
          <ExternalLink className="w-4 h-4" />
        </button>

        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
          className="w-full max-w-4xl bg-white text-slate-900 rounded-md shadow-2xl overflow-hidden transition-transform duration-150 mb-20"
        >
          {/* Decorative corner waves matching the academic slide sheet */}
          <div className="relative px-6 sm:px-12 pt-10 pb-12 min-h-[540px] flex flex-col justify-between">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -left-12 w-64 h-36 rounded-full bg-sky-200/80 -rotate-12"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-10 -right-10 w-56 h-40 rounded-full bg-sky-200/75 rotate-12"
            />

            <div className="relative z-10 space-y-6">
              <div className="text-center space-y-1.5 pt-2">
                <p className="text-xs font-extrabold tracking-widest uppercase text-sky-700">
                  Ramu School · Academic Slide Deck
                </p>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 font-display">
                  {currentPage.heading}
                </h2>
                <p className="text-xs sm:text-sm text-slate-600">{currentPage.subheading}</p>
              </div>

              {/* Structured Table (Chapter Sequence / Lesson Sequence / Serial Number / Chapter Name / Lesson Name / Lesson Type) */}
              {currentPage.tableRows && currentPage.tableRows.length > 0 && (
                <div className="overflow-x-auto border border-slate-400">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead>
                      <tr className="bg-[#212529] text-white">
                        <th className="py-2.5 px-3 border border-slate-600 font-semibold">
                          Chapter Sequence
                        </th>
                        <th className="py-2.5 px-3 border border-slate-600 font-semibold">
                          Lesson Sequence
                        </th>
                        <th className="py-2.5 px-3 border border-slate-600 font-semibold">
                          Serial Number
                        </th>
                        <th className="py-2.5 px-3 border border-slate-600 font-semibold">
                          Chapter Name
                        </th>
                        <th className="py-2.5 px-3 border border-slate-600 font-semibold">
                          Lesson Name
                        </th>
                        <th className="py-2.5 px-3 border border-slate-600 font-semibold">
                          Lesson Type
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPage.tableRows.map((row, idx) => (
                        <React.Fragment key={idx}>
                          <tr className="bg-white text-slate-900">
                            <td className="py-4 px-3 border border-slate-400 font-mono">
                              {row.seq || '—'}
                            </td>
                            <td className="py-4 px-3 border border-slate-400 font-mono">
                              {row.seq || '—'}
                            </td>
                            <td className="py-4 px-3 border border-slate-400 font-mono font-semibold">
                              {row.serial}
                            </td>
                            <td className="py-4 px-3 border border-slate-400 font-medium">
                              {row.chapter}
                            </td>
                            <td className="py-4 px-3 border border-slate-400 font-medium">
                              {row.lesson}
                            </td>
                            <td className="py-4 px-3 border border-slate-400">{row.type}</td>
                          </tr>
                          <tr className="bg-[#212529] h-5">
                            <td colSpan={6} className="border border-slate-600" />
                          </tr>
                          <tr className="bg-white">
                            <td
                              colSpan={2}
                              className="py-2.5 px-3 border border-slate-400 font-semibold text-slate-800"
                            >
                              Content PPT
                            </td>
                            <td
                              colSpan={4}
                              className="py-2.5 px-3 border border-slate-400 text-sky-700 underline font-medium"
                            >
                              {row.attachment}
                            </td>
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Teaching Notes / Slide Bullets */}
              {currentPage.bodyBullets && currentPage.bodyBullets.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Key Concepts & Teaching Points
                  </p>
                  <ul className="space-y-2">
                    {currentPage.bodyBullets.map((bullet, bIdx) => (
                      <li
                        key={bIdx}
                        className="flex items-start gap-2.5 text-sm text-slate-800 leading-relaxed"
                      >
                        <span className="w-2 h-2 rounded-full bg-sky-600 mt-2 shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key Formula Highlight */}
              {currentPage.keyFormula && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3.5 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    Key Formula / Principle
                  </p>
                  <p className="font-mono text-base font-bold text-slate-900">
                    {currentPage.keyFormula}
                  </p>
                </div>
              )}
            </div>

            <div className="relative z-10 pt-8 mt-8 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>{material.title}</span>
              <span className="font-mono tabular-nums">
                Page {pageIdx + 1} of {Math.max(1, pages.length)}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Floating Control Pill matching screenshot */}
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 rounded-full bg-[#35383e]/95 border border-slate-700 shadow-2xl text-xs">
          <div className="flex items-center gap-1.5 pr-3 border-r border-slate-600">
            <span className="text-slate-300">Page</span>
            <form onSubmit={handlePageSubmit}>
              <input
                type="text"
                aria-label="Page number"
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={handlePageSubmit}
                className="w-9 px-1.5 py-0.5 text-center rounded bg-[#1e2126] border border-slate-600 text-white font-mono tabular-nums focus:outline-none focus:border-sky-400"
              />
            </form>
            <span className="text-slate-300 tabular-nums">/ {Math.max(1, pages.length)}</span>
            {pages.length > 1 && (
              <div className="flex items-center gap-1 ml-1">
                <button
                  type="button"
                  disabled={pageIdx <= 0}
                  onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
                  className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 cursor-pointer"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={pageIdx >= pages.length - 1}
                  onClick={() => setPageIdx((p) => Math.min(pages.length - 1, p + 1))}
                  className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))}
              className="p-1 rounded hover:bg-slate-700 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title="Reset zoom to 100%"
              onClick={() => setZoom(1)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-700 cursor-pointer tabular-nums"
            >
              <Search className="w-3.5 h-3.5" />
              <span>{Math.round(zoom * 100)}%</span>
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.15).toFixed(2))))}
              className="p-1 rounded hover:bg-slate-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
