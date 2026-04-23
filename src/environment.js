// ===================================================
// 🧾 تطبيق: تصفية برو
// 🛠️ المطور: محمد أمين الكامل
// 🗓️ سنة: 2025
// 📌 جميع الحقوق محفوظة
// يمنع الاستخدام أو التعديل دون إذن كتابي
// ===================================================

/**
 * Environment Configuration Module
 * وحدة تكوين البيئة
 *
 * This module provides reliable environment detection for the application
 * هذه الوحدة توفر كشف موثوق لبيئة التطبيق
 */

class EnvironmentManager {
    constructor() {
        this.environment = this.detectEnvironment();
        this.isDevelopment = this.environment === 'development';
        this.isProduction = this.environment === 'production';
        
        // Log environment information
        this.logEnvironmentInfo();
    }

    /**
     * Detect the current environment
     * كشف البيئة الحالية
     */
    getElectronRuntime() {
        if (typeof window !== 'undefined' && window.electronRuntime && window.electronRuntime.isElectron) {
            return window.electronRuntime;
        }

        const nodeProcess = typeof process !== 'undefined'
            ? process
            : (typeof window !== 'undefined' ? window.process : null);

        if (!nodeProcess || nodeProcess.type !== 'renderer') {
            return null;
        }

        const argv = Array.isArray(nodeProcess.argv) ? [...nodeProcess.argv] : [];
        const env = nodeProcess.env || {};

        return {
            isElectron: true,
            processType: nodeProcess.type,
            defaultApp: Boolean(nodeProcess.defaultApp),
            argv,
            env,
            isPackagedGuess: !nodeProcess.defaultApp
                && env.NODE_ENV !== 'development'
                && !argv.includes('--dev')
        };
    }

    detectEnvironment() {
        try {
            const electronRuntime = this.getElectronRuntime();
            if (electronRuntime) {
                if (electronRuntime.argv && electronRuntime.argv.includes('--dev')) {
                    return 'development';
                }

                if (electronRuntime.env && electronRuntime.env.NODE_ENV === 'development') {
                    return 'development';
                }

                if (electronRuntime.env && electronRuntime.env.NODE_ENV === 'production') {
                    return 'production';
                }

                if (electronRuntime.isPackaged === true || electronRuntime.isPackagedGuess) {
                    return 'production';
                }

                return 'development';
            }

            if (typeof process !== 'undefined') {
                if (Array.isArray(process.argv) && process.argv.includes('--dev')) {
                    return 'development';
                }

                if (process.env) {
                    if (process.env.NODE_ENV === 'production') {
                        return 'production';
                    }

                    if (process.env.NODE_ENV === 'development') {
                        return 'development';
                    }
                }
            }

            // Default to production for safety in unknown environments
            return 'production';
        } catch (error) {
            console.warn('⚠️ Error detecting environment, defaulting to production for safety:', error.message);
            return 'production';
        }
    }

    /**
     * Check if test scripts should be loaded
     * فحص ما إذا كان يجب تحميل سكريبتات الاختبار
     */
    shouldLoadTestScripts() {
        // Only load test scripts in development mode
        if (!this.isDevelopment) {
            return false;
        }

        // Additional safety checks
        try {
            const electronRuntime = this.getElectronRuntime();
            const runtimeEnv = electronRuntime && electronRuntime.env ? electronRuntime.env : process?.env;

            // Check if explicitly disabled
            if (runtimeEnv &&
                runtimeEnv.ENABLE_TEST_SCRIPTS === 'false') {
                return false;
            }

            if (electronRuntime && (electronRuntime.isPackaged === true || electronRuntime.isPackagedGuess)) {
                return false;
            }

            return true;
        } catch (error) {
            console.warn('⚠️ Error checking test script loading conditions:', error.message);
            return false;
        }
    }

    /**
     * Get environment configuration
     * الحصول على تكوين البيئة
     */
    getConfig() {
        return {
            environment: this.environment,
            isDevelopment: this.isDevelopment,
            isProduction: this.isProduction,
            shouldLoadTestScripts: this.shouldLoadTestScripts(),
            features: {
                devTools: this.isDevelopment,
                debugging: this.isDevelopment,
                performanceMonitoring: this.isProduction,
                errorReporting: this.isProduction
            }
        };
    }

    /**
     * Log environment information
     * تسجيل معلومات البيئة
     */
    logEnvironmentInfo() {
        const config = this.getConfig();
        
        console.log('🌍 Environment Configuration:');
        console.log(`   Environment: ${config.environment}`);
        console.log(`   Development Mode: ${config.isDevelopment}`);
        console.log(`   Production Mode: ${config.isProduction}`);
        console.log(`   Load Test Scripts: ${config.shouldLoadTestScripts}`);
        
        if (config.isDevelopment) {
            console.log('🔧 Development features enabled');
        } else {
            console.log('🚀 Production optimizations enabled');
        }
    }

    /**
     * Get performance metrics
     * الحصول على مقاييس الأداء
     */
    getPerformanceMetrics() {
        if (!this.isDevelopment) {
            return null; // Don't expose metrics in production
        }

        try {
            const metrics = {
                memoryUsage: typeof process !== 'undefined' ? process.memoryUsage() : null,
                uptime: typeof process !== 'undefined' ? process.uptime() : null,
                platform: typeof process !== 'undefined' ? process.platform : null,
                nodeVersion: typeof process !== 'undefined' ? process.version : null
            };

            return metrics;
        } catch (error) {
            console.warn('⚠️ Error getting performance metrics:', error.message);
            return null;
        }
    }
}

// Create singleton instance
const environmentManager = new EnvironmentManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = environmentManager;
}

// Make available globally in browser context
if (typeof window !== 'undefined') {
    window.EnvironmentManager = environmentManager;
}
