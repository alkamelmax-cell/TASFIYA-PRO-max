/**
 * @file reports.js
 * @description وحدة التقارير - تحتوي على عمليات إنشاء وعرض التقارير المختلفة
 */

const { ipcRenderer } = require('electron');
const DialogUtils = require('./dialog-utils');
const { formatDate, formatCurrency } = require('./utils');

class ReportsManager {
    constructor() {
        this.currentReportData = null;
        this.currentReportPage = 1;
        this.ITEMS_PER_PAGE = 20;
    }

    /**
     * إنشاء تقرير التصفيات
     * @param {Object} filters - مرشحات التقرير
     */
    async generateReport(filters = {}) {
        console.log('📊 [REPORT] إنشاء تقرير التصفيات...');

        try {
            DialogUtils.showLoading('جاري إنشاء التقرير...', 'يرجى الانتظار');

            // بناء الاستعلام
            const { query, params } = this.buildReportQuery(filters);

            // تنفيذ الاستعلام
            const reconciliations = await ipcRenderer.invoke('db-all', query, params);

            // تخزين النتائج
            this.currentReportData = reconciliations;

            // عرض النتائج
            await this.displayReportResults(reconciliations, filters);

            console.log(`✅ [REPORT] تم إنشاء التقرير بنجاح (${reconciliations.length} تصفية)`);
            DialogUtils.showSuccessToast(`تم إنشاء التقرير بنجاح (${reconciliations.length} تصفية)`);

        } catch (error) {
            console.error('❌ [REPORT] خطأ في إنشاء التقرير:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * إنشاء تقرير التصفيات حسب الوقت
     * @param {string} reportType - نوع التقرير (daily, weekly, monthly)
     * @param {string} dateFrom - تاريخ البداية
     * @param {string} dateTo - تاريخ النهاية
     */
    async generateTimeReport(reportType, dateFrom, dateTo) {
        console.log('📈 [TIME-REPORT] إنشاء تقرير المقبوضات عبر الزمن...');

        try {
            if (!dateFrom || !dateTo) {
                throw new Error('يرجى تحديد نطاق التواريخ');
            }

            if (new Date(dateFrom) > new Date(dateTo)) {
                throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            }

            DialogUtils.showLoading('جاري إنشاء تقرير المقبوضات عبر الزمن...');

            // توليد بيانات التقرير الزمني
            const timeReportData = await this.generateTimeBasedReportData(reportType, dateFrom, dateTo);

            if (timeReportData.length === 0) {
                throw new Error('لا توجد بيانات في النطاق الزمني المحدد');
            }

            // تخزين النتائج
            this.currentReportData = timeReportData;

            // عرض النتائج
            await this.displayTimeReportResults(timeReportData, reportType);

            console.log('✅ [TIME-REPORT] تم إنشاء التقرير الزمني بنجاح');
            DialogUtils.showSuccessToast('تم إنشاء التقرير الزمني بنجاح');

        } catch (error) {
            console.error('❌ [TIME-REPORT] خطأ في إنشاء التقرير الزمني:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * إنشاء تقرير أجهزة الصراف
     * @param {string} atmFilter - معرف الجهاز (اختياري)
     * @param {string} dateFrom - تاريخ البداية
     * @param {string} dateTo - تاريخ النهاية
     */
    async generateAtmReport(atmFilter, dateFrom, dateTo) {
        console.log('🏧 [ATM-REPORT] إنشاء تقرير أجهزة الصراف...');

        try {
            if (!dateFrom || !dateTo) {
                throw new Error('يرجى تحديد نطاق التواريخ');
            }

            if (new Date(dateFrom) > new Date(dateTo)) {
                throw new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            }

            DialogUtils.showLoading('جاري إنشاء تقرير أجهزة الصراف...');

            // توليد بيانات تقرير الأجهزة
            const atmReportData = await this.generateAtmReportData(atmFilter, dateFrom, dateTo);

            if (atmReportData.length === 0) {
                throw new Error('لا توجد بيانات في النطاق الزمني المحدد');
            }

            // تخزين النتائج
            this.currentReportData = atmReportData;

            // عرض النتائج
            const atmName = atmFilter ? await this.getAtmName(atmFilter) : 'جميع الأجهزة';
            await this.displayAtmReportResults(atmReportData, atmName);

            console.log('✅ [ATM-REPORT] تم إنشاء تقرير الأجهزة بنجاح');
            DialogUtils.showSuccessToast('تم إنشاء تقرير الأجهزة بنجاح');

        } catch (error) {
            console.error('❌ [ATM-REPORT] خطأ في إنشاء تقرير الأجهزة:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * إنشاء تقرير الأداء
     * @param {Object} filters - مرشحات التقرير
     */
    async generatePerformanceReport(filters = {}) {
        console.log('📊 [PERFORMANCE] إنشاء تقرير الأداء...');

        try {
            DialogUtils.showLoading('جاري إنشاء تقرير الأداء...', 'يرجى الانتظار');

            // جلب بيانات الأداء
            const performanceData = await this.generatePerformanceData(filters);

            // عرض النتائج
            await this.displayPerformanceResults(performanceData);

            console.log('✅ [PERFORMANCE] تم إنشاء تقرير الأداء بنجاح');
            DialogUtils.showSuccessToast('تم إنشاء تقرير الأداء بنجاح');

        } catch (error) {
            console.error('❌ [PERFORMANCE] خطأ في إنشاء تقرير الأداء:', error);
            throw error;
        } finally {
            DialogUtils.close();
        }
    }

    /**
     * بناء استعلام التقرير
     * @private
     * @param {Object} filters - مرشحات التقرير
     */
    buildReportQuery(filters) {
        let query = `
            SELECT r.*,
                   c.name as cashier_name,
                   c.cashier_number,
                   a.name as accountant_name,
                   b.branch_name
            FROM reconciliations r
            JOIN cashiers c ON r.cashier_id = c.id
            JOIN accountants a ON r.accountant_id = a.id
            LEFT JOIN branches b ON c.branch_id = b.id
            WHERE 1=1
        `;

        const params = [];

        // إضافة المرشحات
        if (filters.dateFrom) {
            query += ' AND DATE(r.reconciliation_date) >= ?';
            params.push(filters.dateFrom);
        }

        if (filters.dateTo) {
            query += ' AND DATE(r.reconciliation_date) <= ?';
            params.push(filters.dateTo);
        }

        if (filters.branchId) {
            query += ' AND c.branch_id = ?';
            params.push(filters.branchId);
        }

        if (filters.cashierId) {
            query += ' AND r.cashier_id = ?';
            params.push(filters.cashierId);
        }

        if (filters.accountantId) {
            query += ' AND r.accountant_id = ?';
            params.push(filters.accountantId);
        }

        if (filters.status) {
            query += ' AND r.status = ?';
            params.push(filters.status);
        }

        // مرشحات المبلغ
        if (filters.minAmount !== null) {
            query += ' AND r.total_receipts >= ?';
            params.push(filters.minAmount);
        }

        if (filters.maxAmount !== null) {
            query += ' AND r.total_receipts <= ?';
            params.push(filters.maxAmount);
        }

        // البحث النصي
        if (filters.searchText) {
            query += ' AND (c.name LIKE ? OR a.name LIKE ? OR r.id LIKE ?)';
            const searchPattern = `%${filters.searchText}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        query += ' ORDER BY r.reconciliation_date DESC, r.id DESC';

        return { query, params };
    }

    /**
     * عرض نتائج التقرير
     * @private
     * @param {Array} data - بيانات التقرير
     * @param {Object} filters - مرشحات التقرير
     */
    async displayReportResults(data, filters) {
        console.log('📊 [DISPLAY] عرض نتائج التقرير...');

        // توليد ملخص الإحصائيات
        const summary = this.generateReportSummary(data);

        // عرض الملخص
        this.displayReportSummary(summary);

        // عرض الجدول مع الترقيم
        this.displayReportTable(data);

        // عرض الرسوم البيانية إذا كانت مفعلة
        if (document.getElementById('reportChartsSection').style.display !== 'none') {
            this.generateReportCharts(data);
        }

        // تمرير لقسم النتائج
        document.getElementById('reportResultsCard').scrollIntoView({ behavior: 'smooth' });
    }

    /**
     * توليد ملخص التقرير
     * @private
     * @param {Array} data - بيانات التقرير
     */
    generateReportSummary(data) {
        const totalReconciliations = data.length;
        const totalReceipts = data.reduce((sum, r) => sum + r.total_receipts, 0);
        const totalSystemSales = data.reduce((sum, r) => sum + r.system_sales, 0);
        const totalSurplusDeficit = data.reduce((sum, r) => sum + r.surplus_deficit, 0);

        const completedCount = data.filter(r => r.status === 'completed').length;
        const draftCount = data.filter(r => r.status === 'draft').length;

        const averageReceipts = totalReconciliations > 0 ? totalReceipts / totalReconciliations : 0;

        // توزيع الكاشير
        const cashierStats = {};
        data.forEach(r => {
            if (!cashierStats[r.cashier_name]) {
                cashierStats[r.cashier_name] = {
                    count: 0,
                    totalReceipts: 0,
                    totalSurplusDeficit: 0
                };
            }
            cashierStats[r.cashier_name].count++;
            cashierStats[r.cashier_name].totalReceipts += r.total_receipts;
            cashierStats[r.cashier_name].totalSurplusDeficit += r.surplus_deficit;
        });

        return {
            totalReconciliations,
            totalReceipts,
            totalSystemSales,
            totalSurplusDeficit,
            completedCount,
            draftCount,
            averageReceipts,
            cashierStats
        };
    }

    /**
     * عرض ملخص التقرير
     * @private
     * @param {Object} summary - ملخص التقرير
     */
    displayReportSummary(summary) {
        const container = document.getElementById('reportSummary');
        if (!container) return;

        container.innerHTML = `
            <div class="row">
                <div class="col-md-3">
                    <div class="card bg-primary text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${summary.totalReconciliations}</h4>
                            <p class="mb-0">إجمالي التصفيات</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-success text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${formatCurrency(summary.totalReceipts)}</h4>
                            <p class="mb-0">إجمالي المقبوضات</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card bg-info text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${formatCurrency(summary.totalSystemSales)}</h4>
                            <p class="mb-0">مبيعات النظام</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card ${summary.totalSurplusDeficit >= 0 ? 'bg-success' : 'bg-danger'} text-white">
                        <div class="card-body text-center">
                            <h4 class="mb-1">${formatCurrency(Math.abs(summary.totalSurplusDeficit))}</h4>
                            <p class="mb-0">${summary.totalSurplusDeficit >= 0 ? 'إجمالي الفائض' : 'إجمالي العجز'}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * عرض جدول التقرير
     * @private
     * @param {Array} data - بيانات التقرير
     */
    displayReportTable(data) {
        const tableBody = document.getElementById('reportResultsTableBody');
        if (!tableBody) return;

        const startIndex = (this.currentReportPage - 1) * this.ITEMS_PER_PAGE;
        const endIndex = startIndex + this.ITEMS_PER_PAGE;
        const pageData = data.slice(startIndex, endIndex);

        tableBody.innerHTML = '';

        pageData.forEach((item, index) => {
            const row = document.createElement('tr');
            const statusClass = item.status === 'completed' ? 'bg-success' : 'bg-warning';
            const surplusDeficitClass = item.surplus_deficit >= 0 ? 'text-success' : 'text-danger';

            row.innerHTML = `
                <td>${startIndex + index + 1}</td>
                <td>${item.status === 'completed' && item.reconciliation_number ? 
                     `#${item.reconciliation_number}` : 'مسودة'}</td>
                <td>${formatDate(item.reconciliation_date)}</td>
                <td>${item.cashier_name} (${item.cashier_number})</td>
                <td>${item.accountant_name}</td>
                <td class="text-currency">${formatCurrency(item.total_receipts)}</td>
                <td class="text-currency">${formatCurrency(item.system_sales)}</td>
                <td class="text-currency ${surplusDeficitClass}">
                    ${formatCurrency(item.surplus_deficit)}
                </td>
                <td><span class="badge ${statusClass}">
                    ${item.status === 'completed' ? 'مكتملة' : 'مسودة'}
                </span></td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-primary" onclick="viewReconciliation(${item.id})">
                            👁️
                        </button>
                        <button class="btn btn-sm btn-info" onclick="printReconciliation(${item.id})">
                            🖨️
                        </button>
                    </div>
                </td>
            `;

            tableBody.appendChild(row);
        });

        // تحديث الترقيم
        this.updatePagination(data.length);
    }

    /**
     * تحديث ترقيم الصفحات
     * @private
     * @param {number} totalItems - إجمالي العناصر
     */
    updatePagination(totalItems) {
        const totalPages = Math.ceil(totalItems / this.ITEMS_PER_PAGE);
        const paginationContainer = document.getElementById('reportPagination');
        const paginationInfo = document.getElementById('reportPaginationInfo');

        if (!paginationContainer || !paginationInfo) return;

        // تحديث معلومات الترقيم
        const startItem = (this.currentReportPage - 1) * this.ITEMS_PER_PAGE + 1;
        const endItem = Math.min(this.currentReportPage * this.ITEMS_PER_PAGE, totalItems);
        paginationInfo.textContent = `عرض ${startItem}-${endItem} من ${totalItems} نتيجة`;

        // إنشاء أزرار الترقيم
        paginationContainer.innerHTML = '';

        if (totalPages <= 1) return;

        // زر السابق
        this.createPaginationButton(paginationContainer, this.currentReportPage - 1, 'السابق', 
            this.currentReportPage === 1);

        // أرقام الصفحات
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || 
                (i >= this.currentReportPage - 2 && i <= this.currentReportPage + 2)) {
                this.createPaginationButton(paginationContainer, i, i.toString(), false, 
                    i === this.currentReportPage);
            } else if (i === this.currentReportPage - 3 || i === this.currentReportPage + 3) {
                this.createPaginationSeparator(paginationContainer);
            }
        }

        // زر التالي
        this.createPaginationButton(paginationContainer, this.currentReportPage + 1, 'التالي',
            this.currentReportPage === totalPages);
    }

    /**
     * إنشاء زر ترقيم
     * @private
     */
    createPaginationButton(container, page, text, disabled = false, active = false) {
        const li = document.createElement('li');
        li.className = `page-item ${disabled ? 'disabled' : ''} ${active ? 'active' : ''}`;
        
        const a = document.createElement('a');
        a.className = 'page-link';
        a.href = '#';
        a.textContent = text;
        
        if (!disabled) {
            a.onclick = (e) => {
                e.preventDefault();
                this.changePage(page);
            };
        }

        li.appendChild(a);
        container.appendChild(li);
    }

    /**
     * إنشاء فاصل ترقيم
     * @private
     */
    createPaginationSeparator(container) {
        const li = document.createElement('li');
        li.className = 'page-item disabled';
        li.innerHTML = '<span class="page-link">...</span>';
        container.appendChild(li);
    }

    /**
     * تغيير الصفحة الحالية
     * @param {number} page - رقم الصفحة
     */
    changePage(page) {
        if (!this.currentReportData) return;

        const totalPages = Math.ceil(this.currentReportData.length / this.ITEMS_PER_PAGE);
        if (page < 1 || page > totalPages) return;

        this.currentReportPage = page;
        this.displayReportTable(this.currentReportData);
    }
}

module.exports = new ReportsManager();