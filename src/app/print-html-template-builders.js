function buildTimeRangeLabel(reconciliation) {
  if (!reconciliation.time_range_start && !reconciliation.time_range_end) {
    return '';
  }

  if (reconciliation.time_range_start && reconciliation.time_range_end) {
    return `من ${reconciliation.time_range_start} إلى ${reconciliation.time_range_end}`;
  }

  if (reconciliation.time_range_start) {
    return `من ${reconciliation.time_range_start}`;
  }

  return `إلى ${reconciliation.time_range_end}`;
}

function buildPrintStyles(fontSize, colors) {
  return `
@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Cairo','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:${fontSize};line-height:1.1;color:#222;direction:rtl;text-align:right;background:white;padding:4px;margin:0;font-weight:400;}
@media print{
  @page{size:A4 portrait;margin:6mm 5mm 12mm 5mm;}
  body{padding:0;margin:0;margin-bottom:12mm;font-size:${fontSize} !important;line-height:1.05 !important;}
  .page-footer{position:fixed;bottom:0;left:0;right:0;height:20mm;background:white;display:flex;align-items:center;justify-content:center;font-size:10px;color:#666;border-top:1px solid #ddd;z-index:1000;}
  .no-print{display:none !important;}
  .page-break{page-break-inside:avoid;}
  .section{page-break-inside:avoid;margin-bottom:3px;}
  .header{margin-bottom:4px;}
  .footer{margin-top:5px;}
  h1,h2,h3{margin:1px 0 !important;padding:1px 0 !important;font-size:1em !important;}
  table{margin:2px 0 !important;}
  th,td{padding:1px 2px !important;font-size:0.9em !important;}
}
.header{text-align:center;margin-bottom:4px;padding:3px;border:1px solid #2c3e50;border-radius:2px;background:${colors ? 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)' : '#f8f9fa'};}
.header h1{color:#1a252f;font-size:1.4em;margin-bottom:2px;font-weight:800;text-shadow:0.5px 0.5px 1px rgba(0,0,0,0.1);}
.header h2{color:#2c3e50;font-size:1.2em;margin-bottom:6px;font-weight:700;}
.reconciliation-info{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin:8px 0;padding:6px;background:${colors ? '#e3f2fd' : '#f5f5f5'};border-radius:3px;border:1px solid #ddd;font-size:0.9em;}
.info-item{display:inline-block;text-align:right;padding:2px 5px;white-space:nowrap;}
.info-label{font-weight:700;color:#1a252f;font-size:0.9em;display:inline-block;margin-left:0;margin-right:3px;}
.info-value{font-weight:600;color:#2c3e50;font-size:0.9em;display:inline-block;}
.section{margin:6px 0;page-break-inside:avoid;}
.section-title{background:${colors ? 'linear-gradient(135deg, #3498db, #2980b9)' : '#f8f9fa'};color:${colors ? 'white' : '#000000'};padding:15px 20px;border-radius:8px;font-size:18px;font-weight:700;margin-bottom:15px;text-align:center;text-shadow:${colors ? '0.5px 0.5px 1px rgba(0,0,0,0.2)' : 'none'};border:${colors ? 'none' : '2px solid #000000'};}
.section-content{border:1px solid #ddd;border-top:none;border-radius:0 0 3px 3px;overflow:hidden;}
table{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:12px;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);}
th,td{padding:6px 5px;text-align:center;border:1px solid #bdc3c7;vertical-align:middle;line-height:1.2;font-weight:500;font-size:12px;}
th{background:${colors ? '#34495e' : 'transparent'};color:${colors ? 'white' : '#000000'};font-weight:700;font-size:13px;text-shadow:${colors ? '0.5px 0.5px 1px rgba(0,0,0,0.3)' : 'none'};border:${colors ? '1px solid #bdc3c7' : '2px solid #000000'};}
.total-row{background:${colors ? 'linear-gradient(135deg, #27ae60, #2ecc71)' : 'transparent'} !important;color:#000000 !important;font-weight:900 !important;font-size:14px !important;}
.total-row td{background:transparent !important;color:#000000 !important;font-weight:900 !important;font-size:14px !important;border:${colors ? '2px solid #27ae60' : '2px solid #000000'} !important;padding:8px 6px !important;}
tr:nth-child(even){background:${colors ? '#f8f9fa' : 'transparent'};}
.currency{font-family:'Courier New',monospace;font-weight:800;color:${colors ? '#1e8449' : '#000000'};font-size:1.05em;text-shadow:${colors ? '0.5px 0.5px 1px rgba(0,0,0,0.1)' : 'none'};}
.deficit{color:${colors ? '#c0392b' : '#000000'};font-weight:800;font-size:1.05em;}
.summary-section{background:${colors ? 'linear-gradient(135deg, #f39c12, #e67e22)' : 'transparent'};color:${colors ? 'white' : '#000000'};padding:8px;border-radius:4px;margin:8px 0;text-align:center;border:${colors ? 'none' : '2px solid #000000'};}
.summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:5px;}
.summary-item{background:${colors ? 'rgba(255, 255, 255, 0.1)' : 'transparent'};padding:4px;border-radius:3px;border:${colors ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid #000000'};}
.summary-label{font-size:0.75em;margin-bottom:3px;opacity:${colors ? '0.95' : '1'};font-weight:600;color:${colors ? 'inherit' : '#000000'};}
.summary-value{font-size:1em;font-weight:800;text-shadow:${colors ? '0.5px 0.5px 1px rgba(0,0,0,0.2)' : 'none'};color:${colors ? 'inherit' : '#000000'};}
.signatures-section{margin-top:20px;margin-bottom:15mm;padding:10px;page-break-inside:avoid;}
.signatures-title{font-size:14px;font-weight:700;color:#2c3e50;text-align:center;margin-bottom:15px;border-bottom:2px solid #3498db;padding-bottom:5px;}
.signature-row{display:flex;justify-content:space-between;margin-bottom:15px;align-items:center;}
.signature-item{flex:1;margin:0 8px;}
.signature-label{font-size:11px;font-weight:600;color:#34495e;margin-bottom:4px;}
.signature-line{border-bottom:2px solid #34495e;height:25px;position:relative;}
.footer{margin-top:8px;padding-top:5px;border-top:1px solid #ddd;text-align:center;color:#666;font-size:0.7em;margin-bottom:25mm;}
.page-footer{position:fixed;bottom:0;left:0;right:0;height:20mm;background:white;display:flex;align-items:center;justify-content:center;font-size:10px;color:#666;border-top:1px solid #ddd;z-index:1000;font-family:'Cairo',Arial,sans-serif;}
.print-controls{position:fixed;top:10px;left:10px;z-index:1000;background:white;padding:10px;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,0.1);border:1px solid #ddd;}
.print-btn,.close-btn{background:#3498db;color:white;border:none;padding:8px 15px;border-radius:5px;cursor:pointer;margin:0 5px;font-family:'Cairo',sans-serif;}
.close-btn{background:#e74c3c;}
.print-btn:hover{background:#2980b9;}
.close-btn:hover{background:#c0392b;}
.empty-section{padding:8px;text-align:center;color:#666;font-style:italic;background:#f8f9fa;font-size:0.8em;}
.print-checkbox{display:inline-block;width:12px;height:12px;border:1px solid #000;margin-left:8px;vertical-align:middle;}
tr:nth-child(even):not(.total-row){background:repeating-linear-gradient(45deg,#e9ecef,#e9ecef 10px,#ffffff 10px,#ffffff 20px);background-color:#e9ecef;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
table td{font-weight:700 !important;font-size:0.95em !important;}
@media print{
  tr:nth-child(even):not(.total-row){background:repeating-linear-gradient(45deg,#e0e0e0,#e0e0e0 10px,#ffffff 10px,#ffffff 20px) !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  table td{font-weight:700 !important;font-size:0.95em !important;}
}
`;
}

function buildPrintDocumentStart(reconciliation, fontSize, colors) {
  return `
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>تقرير التصفية #${reconciliation.id} - ${reconciliation.cashier_name}</title>
      <style>${buildPrintStyles(fontSize, colors)}</style>
    </head>
    <body>`;
}

function buildPrintPreviewControls() {
  return `
        <div class="print-controls no-print">
          <button class="print-btn" onclick="window.print()">🖨️ طباعة</button>
          <button class="close-btn" onclick="window.close()">✖️ إغلاق</button>
        </div>`;
}

function buildPrintHeader(reconciliation, currentDate, currentTime, formatDate) {
  const timeRangeLabel = buildTimeRangeLabel(reconciliation);
  return `
        <div class="header">
          <h1>نظام تصفية الكاشير</h1>
          <h2>تقرير التصفية النهائية</h2>
          <div class="reconciliation-info">
            <div class="info-item">
              <span class="info-label">رقم التصفية:</span>
              <span class="info-value">${reconciliation.reconciliation_number ? `#${reconciliation.reconciliation_number}` : 'مسودة'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">الكاشير:</span>
              <span class="info-value">${reconciliation.cashier_name} (${reconciliation.cashier_number})</span>
            </div>
            <div class="info-item">
              <span class="info-label">المحاسب:</span>
              <span class="info-value">${reconciliation.accountant_name}</span>
            </div>
            <div class="info-item">
              <span class="info-label">تاريخ التصفية:</span>
              <span class="info-value">${formatDate(reconciliation.reconciliation_date)}</span>
            </div>
            ${timeRangeLabel ? `
            <div class="info-item">
              <span class="info-label">النطاق الزمني:</span>
              <span class="info-value">${timeRangeLabel}</span>
            </div>` : ''}
            <div class="info-item">
              <span class="info-label">تاريخ الطباعة:</span>
              <span class="info-value">${currentDate}</span>
            </div>
            <div class="info-item">
              <span class="info-label">وقت الطباعة:</span>
              <span class="info-value">${currentTime}</span>
            </div>
          </div>
          ${reconciliation.filter_notes ? `
          <div style="margin-top: 8px; padding: 6px; background: #f8f9fa; border-left: 3px solid #3498db; border-radius: 4px;">
            <div class="info-item" style="margin-bottom: 3px;">
              <span class="info-label" style="font-weight: 600; color: #2c3e50;">ملاحظات التصفية:</span>
            </div>
            <div style="font-style: italic; color: #2c3e50; font-size: 13px; line-height: 1.3; word-wrap: break-word;">
              ${reconciliation.filter_notes}
            </div>
          </div>` : ''}
        </div>`;
}

function buildPrintFooter(currentDate, currentTime, nonColoredPrintStyles) {
  return `
        <div class="footer">
          <p>تم إنشاء هذا التقرير بواسطة نظام تصفية برو</p>
          <p>تاريخ الإنشاء: ${currentDate} - ${currentTime}</p>
          <p style="margin-top: 10px; font-weight: 600; color: #2c3e50;">
            جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
          </p>
        </div>

        <div class="page-footer">
          جميع الحقوق محفوظة © 2025 - تطوير محمد أمين الكامل - نظام تصفية برو
        </div>

        ${nonColoredPrintStyles}
      </body>
    </html>`;
}

module.exports = {
  buildPrintDocumentStart,
  buildPrintPreviewControls,
  buildPrintHeader,
  buildPrintFooter
};
