function getDetailedAtmReportPrintStyles() {
  return `
                @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&display=swap');

                body {
                    font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    direction: rtl;
                    text-align: right;
                    font-size: 12px;
                    line-height: 1.4;
                    color: #333;
                    margin: 0;
                    padding: 20px;
                    margin-bottom: 25mm;
                }

                .company-header {
                    text-align: center;
                    margin-bottom: 25px;
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border-radius: 10px;
                    page-break-inside: avoid;
                }

                .company-name {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 8px;
                    text-shadow: 1px 1px 2px rgba(0,0,0,0.3);
                }

                .report-title {
                    font-size: 18px;
                    font-weight: 400;
                    opacity: 0.95;
                    margin-bottom: 5px;
                }

                .report-subtitle {
                    font-size: 14px;
                    opacity: 0.8;
                }

                .report-info {
                    background: #f8f9fa;
                    padding: 15px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border-right: 4px solid #3498db;
                }

                .info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 8px;
                }

                .info-label {
                    font-weight: 600;
                    color: #2c3e50;
                }

                .info-value {
                    color: #34495e;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 20px;
                    font-size: 11px;
                }

                .data-table th {
                    background: linear-gradient(135deg, #3498db, #2980b9);
                    color: white;
                    border: 1px solid #2980b9;
                    padding: 10px 8px;
                    text-align: center;
                    font-weight: 600;
                }

                .data-table td {
                    border: 1px solid #ddd;
                    padding: 8px 6px;
                    text-align: center;
                }

                .data-table tr:nth-child(even) {
                    background-color: #f8f9fa;
                }

                .data-table tr:hover {
                    background-color: #e3f2fd;
                }

                .operation-mada {
                    background: #007bff;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }

                .operation-visa {
                    background: #28a745;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }

                .operation-mastercard {
                    background: #ffc107;
                    color: #212529;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                }

                .print-controls {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    z-index: 1000;
                    background: white;
                    padding: 10px;
                    border-radius: 5px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                    border: 1px solid #ddd;
                }

                .print-controls button {
                    margin: 0 5px;
                    padding: 8px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-family: 'Cairo', Arial, sans-serif;
                    font-size: 12px;
                }

                .print-btn {
                    background: #007bff;
                    color: white;
                }

                .print-btn:hover {
                    background: #0056b3;
                }

                .close-btn {
                    background: #6c757d;
                    color: white;
                }

                .close-btn:hover {
                    background: #545b62;
                }

                .page-footer {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 20mm;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 10px;
                    color: #666;
                    border-top: 1px solid #ddd;
                    z-index: 1000;
                }

                @page {
                    margin: 20mm;
                    margin-bottom: 25mm;
                }

                @media print {
                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    .print-controls {
                        display: none !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `;
}

module.exports = {
  getDetailedAtmReportPrintStyles
};
