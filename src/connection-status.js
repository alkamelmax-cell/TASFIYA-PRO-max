// مكون حالة الاتصال
class ConnectionStatus {
    constructor() {
        this.initializeUI();
        this.initializeEventListeners();
    }

    initializeUI() {
        // إنشاء عنصر مؤشر حالة الاتصال
        const statusElement = document.createElement('div');
        statusElement.id = 'connection-status';
        statusElement.className = 'connection-status';
        document.body.appendChild(statusElement);

        // إضافة الأنماط
        const style = document.createElement('style');
        style.textContent = `
            .connection-status {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 14px;
                z-index: 1000;
                display: none;
            }
            .connection-status.online {
                background-color: #4CAF50;
                color: white;
            }
            .connection-status.offline {
                background-color: #f44336;
                color: white;
                display: block;
            }
        `;
        document.head.appendChild(style);
    }

    initializeEventListeners() {
        // مراقبة حالة الاتصال
        document.addEventListener('connectionChanged', (event) => {
            this.updateStatus(event.detail);
        });

        // تحديث الحالة الأولية
        this.updateStatus(navigator.onLine);
    }

    updateStatus(isOnline) {
        const statusElement = document.getElementById('connection-status');
        if (isOnline) {
            statusElement.textContent = 'متصل بالإنترنت';
            statusElement.className = 'connection-status online';
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 3000);
        } else {
            statusElement.textContent = 'غير متصل بالإنترنت - جاري العمل في الوضع المحلي';
            statusElement.className = 'connection-status offline';
            statusElement.style.display = 'block';
        }
    }
}

module.exports = ConnectionStatus;
