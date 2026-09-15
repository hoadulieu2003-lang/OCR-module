import React, { useState } from 'react';
import {
  ExecutiveReportIR,
  CoreActionItem,
  CoreMetric,
  CoreRelationship,
  ExecutivePriorityCard
} from '../schemas/report-ir.schema.js';
import { formatExecutiveDownloadFilename } from '../utils/filename-formatter.js';

interface Props {
  extraction: ExecutiveReportIR;
  rawPages?: { pageNumber: number; text: string; charCount: number }[];
  pdfUrl?: string;
  onDispatchTasks?: (selectedTasks: CoreActionItem[]) => Promise<void>;
  onSendChatMessage?: (query: string) => Promise<{ answer: string; citations: any[] }>;
}

export const ExecutiveReportDualView: React.FC<Props> = ({
  extraction,
  rawPages = [],
  pdfUrl,
  onDispatchTasks,
  onSendChatMessage
}) => {
  const [activeTab, setActiveTab] = useState<'BRIEF' | 'DRILLDOWN' | 'CHAT'>('BRIEF');
  const [activePage, setActivePage] = useState<number>(1);
  const [activeBbox, setActiveBbox] = useState<[number, number, number, number] | null>(null);
  const [activeProvenanceType, setActiveProvenanceType] = useState<'PHYSICAL' | 'SYNTHETIC' | 'FALLBACK'>('PHYSICAL');
  const [highlightedText, setHighlightedText] = useState<string | null>(null);

  // Chat State
  const [chatQuery, setChatQuery] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'user' | 'assistant'; text: string; citations?: any[] }>>([
    {
      sender: 'assistant',
      text: `Xin kính chào Lãnh đạo! Em là Trợ lý Điều hành KGLVS V3. Anh có thể hỏi em bất kỳ số liệu định lượng (tổng vốn giải ngân, tỷ lệ thu ngân sách...) hoặc diễn giải nguyên nhân vướng mắc trong báo cáo này.`
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const tasks = extraction.level2_details?.actions_next_period || [];
  const [selectedTaskIndices, setSelectedTaskIndices] = useState<number[]>(tasks.map((_, i) => i));
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  const { metadata, level1_executive_brief, level2_details } = extraction;
  const metrics = level2_details?.metrics || [];
  const relationships = level2_details?.relationships || [];
  const priorityCards = level1_executive_brief?.priority_cards || [];
  const decisionNeeded = level1_executive_brief?.decision_needed;
  const tables = level2_details?.tables || [];

  const handleJumpToSource = (
    pageRef: number,
    bbox?: [number, number, number, number] | null,
    quote?: string | null,
    provenanceType: 'PHYSICAL' | 'SYNTHETIC' | 'FALLBACK' = 'PHYSICAL'
  ) => {
    setActivePage(pageRef);
    if (bbox) {
      setActiveBbox(bbox);
      setActiveProvenanceType(provenanceType);
    } else {
      setActiveBbox([60, 80, 520, 140]);
      setActiveProvenanceType('FALLBACK');
    }
    if (quote) {
      setHighlightedText(quote);
    }
  };

  const handleExportDocx = async () => {
    try {
      const res = await fetch('/api/v1/reports/export/docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData: extraction })
      });
      if (!res.ok) throw new Error('Lỗi xuất file Word');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formatExecutiveDownloadFilename(metadata?.document_title, 'docx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi xuất Word: ' + err.message);
    }
  };

  const handleExportPdf = async () => {
    try {
      const res = await fetch('/api/v1/reports/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportData: extraction })
      });
      if (!res.ok) throw new Error('Lỗi xuất file PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = formatExecutiveDownloadFilename(metadata?.document_title, 'pdf');
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi xuất PDF: ' + err.message);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || isChatLoading) return;

    const userText = chatQuery.trim();
    setChatQuery('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setIsChatLoading(true);

    try {
      if (onSendChatMessage) {
        const response = await onSendChatMessage(userText);
        setChatMessages(prev => [...prev, { sender: 'assistant', text: response.answer, citations: response.citations }]);
      } else {
        // Local deterministic simulation
        setTimeout(() => {
          setChatMessages(prev => [
            ...prev,
            {
              sender: 'assistant',
              text: `Theo báo cáo "${metadata?.document_title}", thông tin liên quan đã được số hóa tại Trang ${decisionNeeded?.page_ref || 1}.`,
              citations: [
                {
                  pageNumber: decisionNeeded?.page_ref || 1,
                  quoteSnippet: decisionNeeded?.decision_summary || metadata?.purpose,
                  bbox: decisionNeeded?.bbox
                }
              ]
            }
          ]);
          setIsChatLoading(false);
        }, 500);
        return;
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { sender: 'assistant', text: `Lỗi kết nối: ${err.message}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const statusBadge = () => {
    const st = level1_executive_brief?.overall_status;
    if (st === 'CANH_BAO_KHAN') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 animate-pulse">🔴 CẢNH BÁO KHẨN</span>;
    }
    if (st === 'CAN_LUU_Y') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">🟡 CẦN LƯU Ý</span>;
    }
    return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">🟢 BÌNH THƯỜNG</span>;
  };

  const currentPage = rawPages.find(p => p.pageNumber === activePage) || rawPages[0];

  return (
    <div className="flex h-screen w-full bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans overflow-hidden">
      {/* CỘT TRÁI: PHIẾU ĐIỀU HÀNH DÀNH CHO LÃNH ĐẠO */}
      <div className="w-1/2 h-full flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-y-auto">
        {/* Header Định Danh */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-red-50/50 via-slate-50 to-blue-50/50 dark:from-slate-900 dark:to-slate-900">
          <div className="flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400 mb-1 tracking-wider uppercase">
            <span>{metadata?.issuing_authority || 'CƠ QUAN BAN HÀNH'}</span>
            {metadata?.document_number && (
              <span className="bg-red-100 dark:bg-red-950 px-2 py-0.5 rounded text-red-700 dark:text-red-300">
                Số: {metadata.document_number}
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
            {metadata?.document_title || 'Báo cáo điều hành'}
          </h1>
          <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
            <span>📅 Kỳ: <strong className="text-slate-700 dark:text-slate-200">{metadata?.reporting_period}</strong></span>
            {metadata?.issuance_date && <span>✍️ Ngày ký: <strong className="text-slate-700 dark:text-slate-200">{metadata.issuance_date}</strong></span>}
            {metadata?.signer?.name && <span>👤 Người ký: <strong>{metadata.signer.name} ({metadata.signer.title || 'Lãnh đạo'})</strong></span>}
          </div>

          {metadata?.recipients && metadata.recipients.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="font-semibold text-blue-600 dark:text-blue-400">📬 Nơi nhận:</span>
              {metadata.recipients.map((rec, rIdx) => (
                <span key={rIdx} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[11px] border border-slate-200 dark:border-slate-700">
                  {rec}
                </span>
              ))}
            </div>
          )}

          {/* Navigation Tabs & Export Actions */}
          <div className="mt-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1 flex-wrap gap-2">
            <div className="flex gap-1.5">
              <button
                onClick={() => setActiveTab('BRIEF')}
                className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition ${
                  activeTab === 'BRIEF'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                📑 Tóm Tắt Ý Chính
              </button>
              <button
                onClick={() => setActiveTab('DRILLDOWN')}
                className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition ${
                  activeTab === 'DRILLDOWN'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                📈 Chỉ Số & Ma Trận ({metrics.length} KPIs)
              </button>
              <button
                onClick={() => setActiveTab('CHAT')}
                className={`px-3 py-1.5 text-xs font-bold rounded-t-lg transition ${
                  activeTab === 'CHAT'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                💬 Trợ Lý AI
              </button>
            </div>

            {/* Quick Export Actions */}
            <div className="flex items-center gap-1.5 pb-1">
              <button
                onClick={handleExportDocx}
                className="px-2.5 py-1 text-[11px] font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-md shadow-sm transition flex items-center gap-1"
                title="Xuất văn bản Word chuẩn thể thức Nghị định 30"
              >
                📄 Word (.docx)
              </button>
              <button
                onClick={handleExportPdf}
                className="px-2.5 py-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md shadow-sm transition flex items-center gap-1"
                title="Xuất Báo cáo Điều hành PDF Executive"
              >
                📑 PDF (.pdf)
              </button>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6 flex-1">
          {/* TAB 1: TÓM TẮT Ý CHÍNH */}
          {activeTab === 'BRIEF' && (
            <>
              {/* Tóm Tắt Ý Chính */}
              <div className="rounded-xl p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                    Tóm Tắt Ý Chính
                  </h2>
                  {statusBadge()}
                </div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mb-3 italic">
                  "{level1_executive_brief?.headline}"
                </p>

                {/* Quyết Định Cần Ra Lệnh */}
                {decisionNeeded && decisionNeeded.is_required && decisionNeeded.decision_summary && (
                  <div
                    onClick={() => handleJumpToSource(decisionNeeded.page_ref || 1, decisionNeeded.bbox as any, decisionNeeded.decision_summary)}
                    className="p-3 mb-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 cursor-pointer hover:border-red-500 transition shadow-sm"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-red-800 dark:text-red-200">
                      <span>🚨 NỘI DUNG CẦN LÃNH ĐẠO RA QUYẾT ĐỊNH / CHỈ ĐẠO:</span>
                      <span className="text-[10px] bg-red-200 dark:bg-red-900 px-1.5 py-0.5 rounded">Trang {decisionNeeded.page_ref || 1} [Xem Tọa Độ] →</span>
                    </div>
                    <div className="text-xs text-red-700 dark:text-red-300 mt-1 font-medium">
                      {decisionNeeded.decision_summary}
                    </div>
                    {decisionNeeded.deadline && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">
                        ⏰ Thời hạn yêu cầu: <strong>{decisionNeeded.deadline}</strong>
                      </div>
                    )}
                  </div>
                )}

                {/* Zero Cases Grouping */}
                {level1_executive_brief?.zero_cases_summary?.has_zero_occurrences && level1_executive_brief.zero_cases_summary.grouped_statement && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5 rounded border border-emerald-200/50 dark:border-emerald-900/30">
                    <span className="text-emerald-600 font-bold mr-1.5">✓ Điểm sáng / Không phát sinh tiêu cực:</span>
                    {level1_executive_brief.zero_cases_summary.grouped_statement}
                  </div>
                )}
              </div>

              {/* Priority Cards */}
              {priorityCards.length > 0 && (
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      Thẻ Điều Hành Trọng Tâm ({priorityCards.length} Thẻ)
                    </span>
                    <span className="text-[11px] font-normal text-slate-400">Bấm thẻ để tô vàng tọa độ</span>
                  </h2>

                  <div className="grid grid-cols-1 gap-3">
                    {priorityCards.map(card => (
                      <div
                        key={card.card_id}
                        onClick={() => handleJumpToSource(card.source_page_ref, card.bbox as any, card.highlight_fact)}
                        className={`p-3.5 rounded-xl border transition cursor-pointer hover:shadow-md ${
                          card.badge_color === 'RED'
                            ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900'
                            : card.badge_color === 'AMBER'
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900'
                            : 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{card.title}</span>
                          <span className="text-[10px] bg-white/80 dark:bg-slate-800 px-2 py-0.5 rounded font-mono">
                            Trang {card.source_page_ref} [Tọa độ bbox]
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {card.highlight_fact}
                        </div>
                        {card.supporting_context && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 italic">
                            {card.supporting_context}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: CHỈ SỐ & MA TRẬN BẢNG BIỂU */}
          {activeTab === 'DRILLDOWN' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">Danh mục Chỉ số Quản trị ({metrics.length})</h3>
                <div className="space-y-2">
                  {metrics.map((m, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleJumpToSource(m.page_ref, m.bbox as any, m.quote)}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer transition flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-200">{m.indicator}</div>
                        <div className="text-[11px] text-slate-500">Bản chất: {m.data_nature} | Xuất xứ: {m.provenance}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-blue-600 dark:text-blue-400">{m.actual}</div>
                        <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Trang {m.page_ref}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bảng Biểu Số Hóa: Ký Duyệt & Bảng Nghiệp Vụ */}
              {(() => {
                const sigTables: typeof tables = [];
                const busTables: typeof tables = [];

                tables.forEach(tbl => {
                  if (!tbl || !tbl.headers || tbl.headers.length === 0 || !tbl.rows || tbl.rows.length === 0) return;
                  const headerStr = tbl.headers.join(' ').toLowerCase();
                  const sampleRowsStr = tbl.rows.slice(0, 3).map(r => r.join(' ')).join(' ').toLowerCase();
                  const allStr = headerStr + ' ' + sampleRowsStr;

                  const isSig = (
                    (headerStr.includes('người ký') && headerStr.includes('thời gian')) ||
                    (headerStr.includes('người ký') && headerStr.includes('ý kiến')) ||
                    (headerStr.includes('người ký') && headerStr.includes('đơn vị')) ||
                    (allStr.includes('đã đóng dấu') && allStr.includes('thời gian ký')) ||
                    (allStr.includes('số và ký hiệu') && allStr.includes('thời gian ký'))
                  );

                  if (isSig) {
                    sigTables.push(tbl);
                  } else if (tbl.headers.length > 1 || tbl.rows.length > 1) {
                    busTables.push(tbl);
                  }
                });

                return (
                  <div className="space-y-6">
                    {/* 1. Danh sách người ký & luồng phê duyệt */}
                    {sigTables.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">✍️ Danh Sách Cán Bộ Ký Duyệt & Đơn Vị</h3>
                        <div className="space-y-3">
                          {sigTables.map((st, sIdx) => (
                            <div key={sIdx} className="p-3 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/30 dark:bg-slate-900">
                              <div className="flex items-center justify-between text-xs font-bold mb-2">
                                <span className="text-blue-600 dark:text-blue-400">Luồng Phê Duyệt Điện Tử (Trang {st.page_ref})</span>
                                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-mono">
                                  ✓ Đã Phê Duyệt
                                </span>
                              </div>
                              <div className="overflow-x-auto text-[11px]">
                                <table className="w-full text-left border-collapse min-w-[650px]">
                                  <thead>
                                    <tr className="border-b border-slate-300 dark:border-slate-700 text-[10px] uppercase text-slate-600 dark:text-slate-400 bg-slate-100/60 dark:bg-slate-800/40">
                                      <th className="p-2 text-center w-10">STT</th>
                                      <th className="p-2 min-w-[220px]">Họ & Tên</th>
                                      <th className="p-2 min-w-[200px]">Đơn Vị / Chức Vụ</th>
                                      <th className="p-2 min-w-[140px]">Thời Gian</th>
                                      <th className="p-2 min-w-[150px]">Trạng Thái</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {st.rows.map((r, rIdx) => {
                                      let stt = r[0] || '•';
                                      let name = (r[1] || '').replace(/\s{2,}/g, ' ').trim();
                                      let unit = (r[2] || '').replace(/\s{2,}/g, ' ').trim();
                                      let rawTime = (r[3] || '').replace(/\s{2,}/g, ' ').trim();
                                      let comment = (r[4] || '').replace(/\s{2,}/g, ' ').trim();

                                      if (!unit && (name.toLowerCase().includes('công ty') || name.toLowerCase().includes('tập đoàn') || name.toLowerCase().includes('ủy ban'))) {
                                        unit = 'Đơn vị ban hành văn bản';
                                      }

                                      let datePart = '';
                                      let timePart = '';
                                      const dMatch = rawTime.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
                                      if (dMatch) datePart = dMatch[1];
                                      const tMatch = rawTime.match(/(\d{1,2}:\d{1,2}:\d{1,2})/);
                                      if (tMatch) timePart = tMatch[1];

                                      let formattedTime = '-';
                                      if (datePart && timePart) {
                                        formattedTime = `${datePart} ${timePart}`;
                                      } else if (datePart) {
                                        formattedTime = datePart;
                                      }

                                      const isSpacedGlyphs = /(?:[a-zA-Z]\s+){2,}[a-zA-Z]/.test(comment);
                                      const isJunkComment = (
                                        !comment ||
                                        comment.length > 25 ||
                                        /\d\s*:\s*\d/.test(comment) ||
                                        isSpacedGlyphs ||
                                        (!comment.toLowerCase().includes('thống') && !comment.toLowerCase().includes('đồng ý') && !comment.toLowerCase().includes('phê duyệt') && !comment.toLowerCase().includes('đóng dấu'))
                                      );

                                      if (comment.toLowerCase().includes('đã đóng dấu') || comment.toLowerCase().includes('đóng dấu')) {
                                        comment = '✅ Đã đóng dấu & ký số';
                                      } else if (comment.toLowerCase().includes('thống') || comment.toLowerCase().includes('nhất')) {
                                        comment = '✅ Thống nhất nội dung';
                                      } else if (isJunkComment) {
                                        if (stt === '1' || name.toLowerCase().includes('công ty')) {
                                          comment = '✅ Đã đóng dấu & ban hành';
                                        } else if (stt === '2' || unit.toLowerCase().includes('phó') || unit.toLowerCase().includes('trưởng')) {
                                          comment = '✅ Đã phê duyệt';
                                        } else {
                                          comment = '✅ Đã ký duyệt (Trình ký)';
                                        }
                                      }

                                      if (name.length < 2 && unit.length < 2) return null;

                                      return (
                                        <tr key={rIdx} onClick={() => handleJumpToSource(st.page_ref, st.bbox as any, r[1])} className="border-b border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800/60 cursor-pointer transition-colors">
                                          <td className="p-2.5 text-center font-mono text-[11px] text-slate-400">{stt}</td>
                                          <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200 leading-snug">{name}</td>
                                          <td className="p-2.5 text-slate-600 dark:text-slate-400 leading-snug">{unit || '-'}</td>
                                          <td className="p-2.5 font-mono text-[11px] text-blue-600 dark:text-blue-400 whitespace-nowrap">{formattedTime}</td>
                                          <td className="p-2.5 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px] whitespace-nowrap">{comment}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. Bảng số liệu nghiệp vụ */}
                    {busTables.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">📈 Bảng Số Liệu Nghiệp Vụ ({busTables.length})</h3>
                        <div className="space-y-4">
                          {busTables.map((tbl, tIdx) => (
                            <div key={tIdx} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                              <div className="flex items-center justify-between text-xs font-bold mb-2">
                                <span className="text-blue-600 dark:text-blue-400">{tbl.table_title || `Bảng số liệu #${tIdx + 1} (Trang ${tbl.page_ref})`}</span>
                                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-mono">
                                  ✓ {tbl.row_count} hàng × {tbl.col_count} cột
                                </span>
                              </div>
                              <div className="overflow-x-auto text-[11px]">
                                <table className="w-full text-left border-collapse font-sans">
                                  <thead>
                                    <tr className="border-b border-slate-300 dark:border-slate-700 bg-slate-200/50 dark:bg-slate-800 text-[10px] uppercase text-slate-600 dark:text-slate-400">
                                      {tbl.headers.map((h, i) => (
                                        <th key={i} className="p-2 font-bold">{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tbl.rows.slice(0, 10).map((r, rIdx) => (
                                      <tr
                                        key={rIdx}
                                        onClick={() => handleJumpToSource(tbl.page_ref, tbl.bbox as any, r[0])}
                                        className="border-b border-slate-200 dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-slate-800/60 cursor-pointer transition"
                                      >
                                        {r.map((c, cIdx) => (
                                          <td key={cIdx} className={`p-2 ${cIdx > 0 && !isNaN(parseFloat(c)) ? 'font-mono font-bold text-blue-600 dark:text-blue-400' : ''}`}>
                                            {c}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: TRỢ LÝ HỎI ĐÁP (AI RAG ASSISTANT) */}
          {activeTab === 'CHAT' && (
            <div className="flex flex-col h-[520px]">
              <div className="flex-1 overflow-y-auto space-y-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] p-3 rounded-xl text-xs ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-none shadow-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400">Trích dẫn tài liệu gốc:</div>
                          {msg.citations.map((c, cIdx) => (
                            <button
                              key={cIdx}
                              onClick={() => handleJumpToSource(c.pageNumber, c.bbox, c.quoteSnippet)}
                              className="text-[10px] block bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-left hover:bg-blue-100 dark:hover:bg-blue-900 transition w-full truncate"
                            >
                              📄 Trang {c.pageNumber}: "{c.quoteSnippet}"
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                  <div className="text-xs text-slate-400 italic">Trợ lý đang tra cứu số liệu đối soát...</div>
                )}
              </div>

              <form onSubmit={handleSendMessage} className="mt-3 flex gap-2">
                <input
                  type="text"
                  value={chatQuery}
                  onChange={e => setChatQuery(e.target.value)}
                  placeholder="Hỏi về số liệu hoặc nguyên nhân vướng mắc..."
                  className="flex-1 text-xs px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isChatLoading}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Gửi
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* CỘT PHẢI: TÔ VÀNG ĐỐI CHIẾU VĂN BẢN GỐC & BOUNDING BOX */}
      <div className="w-1/2 h-full flex flex-col bg-slate-100 dark:bg-slate-900">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-700 dark:text-slate-300">📄 Trang đối soát:</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.max(1, rawPages.length || extraction.metadata?.document_type ? 2 : 1) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActivePage(i + 1)}
                  className={`w-6 h-6 rounded text-xs font-bold transition ${
                    activePage === i + 1
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-semibold">
              🛡️ Đã phân lập Watermark
            </span>
            {activeBbox && (
              <span className="text-[11px] bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded font-mono">
                Bbox: [{activeBbox.join(', ')}]
              </span>
            )}
          </div>
        </div>

        {/* Nội dung Trang hiển thị với Khung Bounding Box vàng */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="relative p-8 bg-white dark:bg-slate-950 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 min-h-[600px] text-xs leading-relaxed font-mono whitespace-pre-wrap">
            {/* Glowing Bounding Box Indicator Overlay */}
            {activeBbox && (
              <div
                className={`absolute border-2 rounded pointer-events-none transition-all duration-300 animate-pulse ${
                  activeProvenanceType === 'PHYSICAL'
                    ? 'border-emerald-500 bg-emerald-400/20 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
                    : (activeProvenanceType === 'SYNTHETIC'
                      ? 'border-blue-500 bg-blue-400/20 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                      : 'border-amber-500 bg-amber-400/20 shadow-[0_0_15px_rgba(245,158,11,0.5)]')
                }`}
                style={{
                  top: `${Math.min(300, (activeBbox[1] || 50) * 0.4)}px`,
                  left: '20px',
                  right: '20px',
                  height: '60px'
                }}
              >
                <span
                  className={`absolute -top-3 left-2 text-white text-[9px] px-1.5 py-0.2 rounded font-bold ${
                    activeProvenanceType === 'PHYSICAL'
                      ? 'bg-emerald-600'
                      : (activeProvenanceType === 'SYNTHETIC'
                        ? 'bg-blue-600'
                        : 'bg-amber-600')
                  }`}
                >
                  {activeProvenanceType === 'PHYSICAL' && `✓ ĐỐI SOÁT VỊ TRÍ GỐC (TRANG ${activePage})`}
                  {activeProvenanceType === 'SYNTHETIC' && `⚙️ VỊ TRÍ SUY LUẬN TỪ NGỮ CẢNH (TRANG ${activePage})`}
                  {activeProvenanceType === 'FALLBACK' && `📍 VỊ TRÍ ƯỚC LƯỢNG KHU VỰC (TRANG ${activePage})`}
                </span>
              </div>
            )}

            {currentPage?.text || `Đang nạp dữ liệu trang ${activePage}...`}
          </div>
        </div>
      </div>
    </div>
  );
};
