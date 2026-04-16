/**
 * Apply non-colored print styles to HTML content
 * @param {boolean} isColorPrint - Whether colored printing is enabled
 * @returns {string} CSS styles for non-colored printing
 */
function generateNonColoredPrintStyles(isColorPrint) {
  if (isColorPrint) {
    return '';
  }

  return `
        <style id="non-colored-print-styles">
            /* Non-colored print styles - Apply black color to all elements */
            @media print {
                * {
                    color: #000000 !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    border-color: #000000 !important;
                    text-shadow: none !important;
                    box-shadow: none !important;
                }

                /* Headers and titles */
                h1, h2, h3, h4, h5, h6,
                .header, .title, .company-name, .report-title,
                .section-title, .table-header, .info-group h4 {
                    color: #000000 !important;
                    background: transparent !important;
                }

                /* Table elements */
                table, th, td, tr, thead, tbody, tfoot {
                    color: #000000 !important;
                    background: transparent !important;
                    border-color: #000000 !important;
                }

                /* Status indicators and badges */
                .badge, .status-balanced, .status-surplus, .status-deficit,
                .badge-excellent, .badge-very-good, .badge-good,
                .badge-acceptable, .badge-needs-improvement,
                .bg-success, .bg-warning, .bg-danger, .bg-info, .bg-primary,
                .text-success, .text-warning, .text-danger, .text-info, .text-primary {
                    color: #000000 !important;
                    background: transparent !important;
                    border: 1px solid #000000 !important;
                }

                /* Currency and monetary values */
                .currency, .money, .amount, .price, .value, .cost,
                .text-currency, .summary-value, .total-amount, .balance-amount,
                .info-value, .financial-value, .monetary-display {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                }

                /* Summary and totals */
                .summary-item, .total-amount, .balance-info,
                .reconciliation-summary, .section-summary, .summary,
                .summary-row, .total-display, .balance-display {
                    color: #000000 !important;
                    background: transparent !important;
                }

                /* Dates and references */
                .date, .datetime, .timestamp, .reference, .reference-number,
                .id, .number, .code, .serial, .transaction-id {
                    color: #000000 !important;
                    background: transparent !important;
                }

                /* Status and balance indicators */
                .balance, .deficit, .surplus, .status, .state,
                .positive, .negative, .neutral, .balanced,
                .text-deficit, .text-surplus {
                    color: #000000 !important;
                    background: transparent !important;
                    border: 1px solid #000000 !important;
                }

                /* Special elements */
                .star-rating, .rating-stars, .performance-badge {
                    color: #000000 !important;
                    text-shadow: none !important;
                    background: transparent !important;
                }

                /* Footer and page info */
                .footer, .page-footer, .print-date, .page-number,
                .copyright, .watermark {
                    color: #000000 !important;
                    background: transparent !important;
                }

                /* Borders and lines */
                hr, .divider, .separator, .line {
                    border-color: #000000 !important;
                    background-color: #000000 !important;
                }

                /* Form elements in print */
                input, select, textarea, .form-control, .form-select {
                    color: #000000 !important;
                    background: transparent !important;
                    border-color: #000000 !important;
                }

                /* Ensure all text is black */
                p, span, div, label, strong, em, i, b, small, code,
                .text, .content, .description, .note, .comment {
                    color: #000000 !important;
                }

                /* Override any gradient backgrounds */
                .gradient, .bg-gradient, [style*="gradient"] {
                    background: transparent !important;
                    background-image: none !important;
                }

                /* SPECIFIC SELECTORS FOR IDENTIFIED PROBLEMATIC ELEMENTS */

                /* Section headers and titles - المبيعات الآجلة، الموردين، عناوين الجداول */
                .section-title, .report-section-title, .table-section-title,
                .section h3, .section h4, .section h5,
                .info-group h4, .summary h3, .section-header {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    font-weight: bold !important;
                }

                /* Specific table section titles for reconciliation reports */
                .section-title:contains("المقبوضات البنكية"),
                .section-title:contains("المقبوضات النقدية"),
                .section-title:contains("الموردين"),
                .section-title:contains("المبيعات الآجلة"),
                .section-title:contains("مقبوضات العملاء"),
                .section-title:contains("فواتير المرتجعات") {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    font-weight: bold !important;
                }

                /* Summary section styling for non-colored print */
                .summary-section {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 2px solid #000000 !important;
                }

                /* Total amounts and financial summaries - إجمالي المقبوضات، إجمالي المبيعات */
                .summary-row, .summary-row span, .summary-label,
                .total-label, .grand-total, .summary-value,
                .info-value, .financial-summary, .amount-summary,
                .total-receipts, .system-sales, .surplus-deficit {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                }

                /* Status indicators and reconciliation status - حالة التصفية، مؤشرات الحالة */
                .status-text, .reconciliation-status, .status-indicator,
                .text-success, .text-danger, .text-warning, .text-info,
                .text-muted, .status-badge, .completion-status,
                .reconciliation-state, .process-status {
                    color: #000000 !important;
                    background: transparent !important;
                    border: 1px solid #000000 !important;
                }

                /* Table headers and column headers - رؤوس الأعمدة */
                th, thead th, .table-header, .column-header,
                table thead tr th, .data-table th, .report-table th {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                    border: 1px solid #000000 !important;
                }

                /* Info labels and values */
                .info-label, .info-item span, .label-text,
                .field-label, .data-label, .report-label {
                    color: #000000 !important;
                    background: transparent !important;
                }

                /* Override any colored text classes */
                [class*="text-"], [class*="bg-"], [style*="color"] {
                    color: #000000 !important;
                    background: transparent !important;
                }

                /* Remove all gradient backgrounds and colored backgrounds */
                [style*="background"], [style*="linear-gradient"], [style*="radial-gradient"] {
                    background: transparent !important;
                    background-image: none !important;
                    background-color: transparent !important;
                }

                /* Ensure total rows are properly styled for non-colored print */
                .total-row, .total-row td, .total-row th {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 2px solid #000000 !important;
                    font-weight: bold !important;
                }

                /* Header section styling for non-colored print */
                .header {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 2px solid #000000 !important;
                }

                /* Reconciliation info section styling */
                .reconciliation-info {
                    color: #000000 !important;
                    background: transparent !important;
                    background-image: none !important;
                    border: 1px solid #000000 !important;
                }

                /* Currency values styling for non-colored print */
                .currency {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                }

                /* Deficit values styling for non-colored print */
                .deficit {
                    color: #000000 !important;
                    background: transparent !important;
                    font-weight: bold !important;
                }
            }
        </style>
    `;
}

module.exports = {
  generateNonColoredPrintStyles
};
