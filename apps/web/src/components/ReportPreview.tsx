type ReportPreviewProps = {
  reportId: string;
  markdown: string;
  exporting: boolean;
  onClose: () => void;
  onExport: () => void;
};

function renderReport(markdown: string) {
  return markdown.split("\n").map((line, index) => {
    const key = `${index}-${line}`;
    if (line.startsWith("# ")) return <h1 key={key}>{line.slice(2)}</h1>;
    if (line.startsWith("## ")) return <h2 key={key}>{line.slice(3)}</h2>;
    if (line.startsWith("### ")) return <h3 key={key}>{line.slice(4)}</h3>;
    if (line.startsWith("- ")) return <p className="report-list-item" key={key}>{line.slice(2)}</p>;
    if (!line.trim()) return <div className="report-spacer" key={key} aria-hidden="true" />;
    return <p key={key}>{line}</p>;
  });
}

export default function ReportPreview({ reportId, markdown, exporting, onClose, onExport }: ReportPreviewProps) {
  return <div className="report-preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="report-preview-title">
    <section className="report-preview-workspace">
      <header className="report-preview-header">
        <div>
          <span className="report-preview-kicker">분석보고서 미리보기</span>
          <h2 id="report-preview-title">보고서 내용을 확인하세요</h2>
        </div>
        <div className="report-preview-actions">
          <button type="button" className="report-back-button" onClick={onClose}>분석 화면으로 돌아가기</button>
          <button type="button" className="report-export-button" onClick={onExport} disabled={exporting}>
            {exporting ? "PDF를 준비하는 중..." : "PDF 내보내기"}
          </button>
        </div>
      </header>
      <main className="report-paper" data-report-id={reportId}>
        {renderReport(markdown)}
      </main>
    </section>
  </div>;
}
