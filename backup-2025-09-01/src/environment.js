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
    detectEnvironment() {
        try {
            // Check if we're in Electron renderer process
            const isElectronRenderer = typeof window !== 'undefined' && 
                                     window.process && 
                                     window.process.type === 'renderer';

            if (isElectronRenderer) {
                // In Electron renderer process
                try {
                    const { remote } = window.require('electron');
                    if (remote && remote.process) {
                        const process = remote.process;
                        
                        // Check command line arguments
                        if (process.argv && process.argv.includes('--dev')) {
                            return 'development';
                        }
                        
                        // Check NODE_ENV
                        if (process.env && process.env.NODE_ENV === 'development') {
                            return 'development';
                        }
                        
                        // Check if app is packaged
                        if (remote.app && remote.app.isPackaged) {
                            return 'production';
                        }
                        
                        return 'development';
                    }
                } catch (electronError) {
                    // Fallback for newer Electron versions without remote
                    console.warn('⚠️ Remote module not available, using fallback detection');
                    
                    // Check window.process if available
                    if (window.process && window.process.env) {
                        if (window.process.env.NODE_ENV === 'production') {
                            return 'production';
                        }
                        if (window.process.env.NODE_ENV === 'development') {
                            return 'development';
                        }
                    }
                    
                    // Default for renderer process
                    return 'production';
                }
            } else {
                // In Node.js main process or browser
                if (typeof process !== 'undefined') {
                    // Check command line arguments
                    if (process.argv && process.argv.includes('--dev')) {
                        return 'development';
                    }
                    
                    // Check NODE_ENV
                    if (process.env) {
                        if (process.env.NODE_ENV === 'production') {
                            return 'production';
                        }
                        
                        if (process.env.NODE_ENV === 'development') {
                            return 'development';
                        }
                    }
                    
                    // Check if app is packaged (Electron main process)
                    try {
                        const { app } = require('electron');
                        if (app && app.isPackaged) {
                            return 'production';
                        }
                    } catch (error) {
                        // Not in Electron context
                    }
                }
                
                // Default to production for safety in unknown environments
                return 'production';
            }
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
            // Check if explicitly disabled
            if (typeof process !== 'undefined' && 
                process.env && 
                process.env.ENABLE_TEST_SCRIPTS === 'false') {
                return false;
            }

            // Check if we're in a packaged app (extra safety)
            if (typeof window !== 'undefined' && window.require) {
                try {
                    const { remote } = window.require('electron');
                    if (remote && remote.app && remote.app.isPackaged) {
                        return false;
                    }
                } catch (electronError) {
                    // Remote module not available, skip this check
                }
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
