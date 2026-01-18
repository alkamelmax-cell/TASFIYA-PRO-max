/**
 * PDF Fix Helper - مساعد إصلاح مشاكل PDF
 * يساعد في تشخيص وإصلاح مشاكل تصدير PDF
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class PDFFixHelper {
    constructor() {
        this.chromiumPaths = [
            // Chrome paths
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            
            // Chromium paths
            'C:\\Program Files\\Chromium\\Application\\chromium.exe',
            'C:\\Program Files (x86)\\Chromium\\Application\\chromium.exe',
            
            // Edge paths
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            
            // Brave paths
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ];
    }

    /**
     * فحص شامل لحالة PDF
     */
    async diagnose() {
        console.log('🔍 [PDF-FIX] بدء فحص مشاكل PDF...');
        
        const results = {
            puppeteerInstalled: false,
            chromiumAvailable: false,
            chromiumPath: null,
            nodeModulesExists: false,
            recommendations: []
        };

        // فحص تثبيت Puppeteer
        results.puppeteerInstalled = this.checkPuppeteerInstallation();
        
        // فحص وجود Chromium
        const chromiumCheck = this.findAvailableChromium();
        results.chromiumAvailable = chromiumCheck.found;
        results.chromiumPath = chromiumCheck.path;
        
        // فحص node_modules
        results.nodeModulesExists = this.checkNodeModules();
        
        // إنشاء التوصيات
        results.recommendations = this.generateRecommendations(results);
        
        this.displayResults(results);
        return results;
    }

    /**
     * فحص تثبيت Puppeteer
     */
    checkPuppeteerInstallation() {
        try {
            const packageJsonPath = path.join(process.cwd(), 'package.json');
            if (!fs.existsSync(packageJsonPath)) {
                console.log('❌ [PDF-FIX] ملف package.json غير موجود');
                return false;
            }

            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            const hasPuppeteer = packageJson.dependencies && packageJson.dependencies.puppeteer;
            
            if (hasPuppeteer) {
                console.log('✅ [PDF-FIX] Puppeteer مثبت في package.json');
                
                // فحص وجود ملفات Puppeteer
                const puppeteerPath = path.join(process.cwd(), 'node_modules', 'puppeteer');
                if (fs.existsSync(puppeteerPath)) {
                    console.log('✅ [PDF-FIX] ملفات Puppeteer موجودة');
                    return true;
                } else {
                    console.log('⚠️ [PDF-FIX] Puppeteer مدرج في package.json لكن الملفات غير موجودة');
                    return false;
                }
            } else {
                console.log('❌ [PDF-FIX] Puppeteer غير مثبت');
                return false;
            }
        } catch (error) {
            console.log('❌ [PDF-FIX] خطأ في فحص Puppeteer:', error.message);
            return false;
        }
    }

    /**
     * البحث عن متصفح متاح
     */
    findAvailableChromium() {
        console.log('🔍 [PDF-FIX] البحث عن متصفح متاح...');
        
        for (const browserPath of this.chromiumPaths) {
            if (fs.existsSync(browserPath)) {
                console.log(`✅ [PDF-FIX] تم العثور على متصفح: ${browserPath}`);
                return { found: true, path: browserPath };
            }
        }
        
        console.log('❌ [PDF-FIX] لم يتم العثور على أي متصفح مثبت');
        return { found: false, path: null };
    }

    /**
     * فحص مجلد node_modules
     */
    checkNodeModules() {
        const nodeModulesPath = path.join(process.cwd(), 'node_modules');
        const exists = fs.existsSync(nodeModulesPath);
        
        if (exists) {
            console.log('✅ [PDF-FIX] مجلد node_modules موجود');
        } else {
            console.log('❌ [PDF-FIX] مجلد node_modules غير موجود');
        }
        
        return exists;
    }

    /**
     * إنشاء التوصيات
     */
    generateRecommendations(results) {
        const recommendations = [];

        if (!results.nodeModulesExists) {
            recommendations.push({
                priority: 'high',
                action: 'تشغيل npm install',
                description: 'مجلد node_modules غير موجود، يجب تثبيت التبعيات'
            });
        }

        if (!results.puppeteerInstalled) {
            recommendations.push({
                priority: 'high',
                action: 'تثبيت Puppeteer',
                description: 'Puppeteer غير مثبت، مطلوب لتصدير PDF'
            });
        }

        if (!results.chromiumAvailable) {
            recommendations.push({
                priority: 'medium',
                action: 'تثبيت متصفح',
                description: 'لا يوجد متصفح مثبت، ثبّت Google Chrome أو Chromium'
            });
        }

        if (results.puppeteerInstalled && !results.chromiumAvailable) {
            recommendations.push({
                priority: 'low',
                action: 'تحميل Chromium عبر Puppeteer',
                description: 'يمكن لـ Puppeteer تحميل Chromium تلقائياً'
            });
        }

        return recommendations;
    }

    /**
     * عرض النتائج
     */
    displayResults(results) {
        console.log('\n📊 [PDF-FIX] نتائج الفحص:');
        console.log('='.repeat(50));
        
        console.log(`Puppeteer مثبت: ${results.puppeteerInstalled ? '✅' : '❌'}`);
        console.log(`متصفح متاح: ${results.chromiumAvailable ? '✅' : '❌'}`);
        if (results.chromiumPath) {
            console.log(`مسار المتصفح: ${results.chromiumPath}`);
        }
        console.log(`node_modules موجود: ${results.nodeModulesExists ? '✅' : '❌'}`);
        
        if (results.recommendations.length > 0) {
            console.log('\n💡 [PDF-FIX] التوصيات:');
            results.recommendations.forEach((rec, index) => {
                const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
                console.log(`${index + 1}. ${priority} ${rec.action}`);
                console.log(`   ${rec.description}`);
            });
        } else {
            console.log('\n🎉 [PDF-FIX] جميع المتطلبات متوفرة!');
        }
    }

    /**
     * إصلاح تلقائي للمشاكل
     */
    async autoFix() {
        console.log('🔧 [PDF-FIX] بدء الإصلاح التلقائي...');
        
        const results = await this.diagnose();
        
        if (!results.nodeModulesExists || !results.puppeteerInstalled) {
            console.log('📦 [PDF-FIX] تثبيت التبعيات...');
            await this.runNpmInstall();
        }

        if (!results.chromiumAvailable) {
            console.log('🌐 [PDF-FIX] تحميل Chromium...');
            await this.downloadChromium();
        }

        console.log('✅ [PDF-FIX] تم الإصلاح التلقائي');
    }

    /**
     * تشغيل npm install
     */
    runNpmInstall() {
        return new Promise((resolve, reject) => {
            console.log('⏳ [PDF-FIX] تشغيل npm install...');
            
            exec('npm install', (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ [PDF-FIX] خطأ في npm install:', error.message);
                    reject(error);
                } else {
                    console.log('✅ [PDF-FIX] تم تثبيت التبعيات بنجاح');
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * تحميل Chromium
     */
    downloadChromium() {
        return new Promise((resolve, reject) => {
            console.log('⏳ [PDF-FIX] تحميل Chromium...');
            
            exec('npx puppeteer browsers install chrome', (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ [PDF-FIX] خطأ في تحميل Chromium:', error.message);
                    reject(error);
                } else {
                    console.log('✅ [PDF-FIX] تم تحميل Chromium بنجاح');
                    resolve(stdout);
                }
            });
        });
    }

    /**
     * اختبار تصدير PDF
     */
    async testPDFExport() {
        console.log('🧪 [PDF-FIX] اختبار تصدير PDF...');
        
        try {
            const puppeteer = require('puppeteer');
            
            const browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            
            const page = await browser.newPage();
            await page.setContent('<h1>اختبار PDF</h1><p>هذا اختبار لتصدير PDF</p>');
            
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true
            });
            
            await browser.close();
            
            console.log('✅ [PDF-FIX] اختبار PDF نجح!');
            return true;
            
        } catch (error) {
            console.error('❌ [PDF-FIX] فشل اختبار PDF:', error.message);
            return false;
        }
    }
}

// تصدير الكلاس
module.exports = PDFFixHelper;

// تشغيل مباشر إذا تم استدعاء الملف
if (require.main === module) {
    const fixer = new PDFFixHelper();
    
    // فحص الوسائط المرسلة
    const args = process.argv.slice(2);
    
    if (args.includes('--diagnose')) {
        fixer.diagnose();
    } else if (args.includes('--fix')) {
        fixer.autoFix();
    } else if (args.includes('--test')) {
        fixer.testPDFExport();
    } else {
        console.log('🛠️ مساعد إصلاح PDF');
        console.log('الاستخدام:');
        console.log('  node pdf-fix-helper.js --diagnose  # فحص المشاكل');
        console.log('  node pdf-fix-helper.js --fix       # إصلاح تلقائي');
        console.log('  node pdf-fix-helper.js --test      # اختبار PDF');
    }
}
