class Analytics {
    static getTodayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    static addTime(type, ms) {
        try {
            const key = this.getTodayKey();
            let data = JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
            if (!data[key]) data[key] = { work: 0, rest: 0 };
            data[key][type] += ms;
            localStorage.setItem('trackerAnalytics', JSON.stringify(data));
        } catch(e) { console.error("Analytics Error", e); }
    }
    static getWeeklyData() {
        try {
            const data = JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
            const result = [];
            for(let i=6; i>=0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dayName = d.toLocaleDateString('tr-TR', {weekday:'short'});
                result.push({ day: dayName, work: data[key]?.work || 0, rest: data[key]?.rest || 0 });
            }
            return result;
        } catch(e) { return []; }
    }
}

class SessionTracker {
    constructor() {
        this.state = 'idle';
        this.targetMs = 0;
        this.totalWorkMs = 0;
        this.totalRestMs = 0;
        this.phaseStartTime = 0;
        this.targetReached = false;
        this.lastSaveTime = Date.now();
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
    }

    startSession(targetHours, targetMinutes, targetSeconds) {
        this.targetMs = (targetHours * 3600000) + (targetMinutes * 60000) + (targetSeconds * 1000);
        this.state = 'working';
        this.phaseStartTime = Date.now();
        this.targetReached = false;
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        this.save();
    }

    save() {
        try {
            const data = {
                state: this.state,
                targetMs: this.targetMs,
                totalWorkMs: this.totalWorkMs,
                totalRestMs: this.totalRestMs,
                phaseStartTime: this.phaseStartTime,
                targetReached: this.targetReached
            };
            localStorage.setItem('sessionData', JSON.stringify(data));
        } catch(e) { console.error("Save Error", e); }
    }

    load() {
        try {
            const data = localStorage.getItem('sessionData');
            if (data) {
                const parsed = JSON.parse(data);
                this.state = parsed.state;
                this.targetMs = parsed.targetMs;
                this.totalWorkMs = parsed.totalWorkMs;
                this.totalRestMs = parsed.totalRestMs;
                this.phaseStartTime = parsed.phaseStartTime;
                this.targetReached = parsed.targetReached;
                return true;
            }
        } catch (e) {
            console.error("Data load error", e);
        }
        return false;
    }

    reset() {
        this.state = 'idle';
        this.targetMs = 0;
        this.totalWorkMs = 0;
        this.totalRestMs = 0;
        this.phaseStartTime = 0;
        this.targetReached = false;
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        
        try {
            localStorage.removeItem('sessionData');
        } catch(e) {}
    }

    toggleState() {
        if (this.state === 'idle') return;

        const now = Date.now();
        const elapsed = now - this.phaseStartTime;

        if (this.state === 'working') {
            this.totalWorkMs += elapsed;
            this.state = 'resting';
        } else if (this.state === 'resting') {
            this.totalRestMs += elapsed;
            this.state = 'working';
        }

        this.phaseStartTime = now;
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        this.save();
    }

    getCurrentStats() {
        const now = Date.now();
        let currentWork = this.totalWorkMs;
        let currentRest = this.totalRestMs;
        let currentPhaseElapsed = 0;

        if (this.state !== 'idle') {
            currentPhaseElapsed = now - this.phaseStartTime;
            
            if (this.state === 'working') {
                currentWork += currentPhaseElapsed;
            } else if (this.state === 'resting') {
                currentRest += currentPhaseElapsed;
            }
        }

        const progressPercentage = this.targetMs > 0 ? (currentWork / this.targetMs) * 100 : 0;
        
        let justReachedTarget = false;
        let triggerWork60 = false;
        let triggerRest15 = false;
        let triggerRest30 = false;

        if (this.state === 'working' && currentPhaseElapsed >= 3600000 && !this.notifiedWork60) {
            this.notifiedWork60 = true;
            triggerWork60 = true;
        } else if (this.state === 'resting') {
            if (currentPhaseElapsed >= 1800000 && !this.notifiedRest30) {
                this.notifiedRest30 = true;
                triggerRest30 = true;
            } else if (currentPhaseElapsed >= 900000 && !this.notifiedRest15) {
                this.notifiedRest15 = true;
                triggerRest15 = true;
            }
        }

        if (progressPercentage >= 100 && !this.targetReached && this.targetMs > 0) {
            this.targetReached = true;
            justReachedTarget = true;
            this.save();
        }

        let colorHex = '#FF3B30'; // Varsayılan
        if (this.state === 'working') {
            colorHex = '#FF3B30'; // Odak Turuncusu/Kırmızısı
        } else if (this.state === 'resting') {
            colorHex = '#34C759'; // Huzur Yeşili/Mavisi
        }

        return {
            state: this.state,
            currentTimerMs: currentPhaseElapsed,
            totalWorkMs: currentWork,
            totalRestMs: currentRest,
            progressPercentage: progressPercentage,
            color: colorHex,
            justReachedTarget: justReachedTarget,
            triggerWork60: triggerWork60,
            triggerRest15: triggerRest15,
            triggerRest30: triggerRest30
        };
    }

    static formatTime(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    const tracker = new SessionTracker();
    let renderInterval;

    const setupScreen = document.getElementById('setup-screen');
    const activeScreen = document.getElementById('active-screen');
    
    const btnStart = document.getElementById('btn-start-session');
    const btnToggle = document.getElementById('btn-toggle-state');
    const btnEnd = document.getElementById('btn-end-session');
    
    const lblTargetTime = document.getElementById('lbl-target-time');
    const lblPercentage = document.getElementById('lbl-percentage');
    const lblCurrentTimer = document.getElementById('lbl-current-timer');
    const lblCurrentState = document.getElementById('lbl-current-state');
    
    const statWorkTime = document.getElementById('stat-work-time');
    const statRestTime = document.getElementById('stat-rest-time');

    const root = document.documentElement;

    let audioCtx = null; // iOS Ses İzni İçin
    let wakeLock = null;
    let unlockedOsc = null; // Always On Oscillator
    let unlockedGain = null; // Always On Gain Node

    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.warn(`Wake Lock API Hatası: ${err.message}`);
        }
    };

    // Sekme arka plandan gelirse Wake Lock'u tekrar iste
    document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
            requestWakeLock();
        }
    });

    const releaseWakeLock = async () => {
        if (wakeLock !== null) {
            await wakeLock.release();
            wakeLock = null;
        }
    };

    // --- YARDIMCI METOTLAR ---
    function switchToActiveScreen() {
        setupScreen.classList.remove('active');
        setupScreen.classList.add('hidden');
        activeScreen.classList.remove('hidden');
        activeScreen.classList.add('active');
    }

    // --- WHEEL PICKER MANTIĞI ---
    const hoursColumn = document.getElementById('picker-hours');
    const minutesColumn = document.getElementById('picker-minutes');
    const secondsColumn = document.getElementById('picker-seconds');
    const itemHeight = 50; // CSS'teki .picker-item yüksekliği ile aynı olmalı

    function populateColumn(column, max) {
        if (!column) return;
        column.innerHTML = '';
        for (let i = 0; i <= max; i++) {
            const div = document.createElement('div');
            div.className = 'picker-item';
            div.textContent = i.toString().padStart(2, '0');
            column.appendChild(div);
        }
    }

    setTimeout(() => {
        populateColumn(hoursColumn, 23);
        populateColumn(minutesColumn, 59);
        populateColumn(secondsColumn, 59);
    }, 100);

    function getSelectedValue(column) {
        return Math.round(column.scrollTop / itemHeight);
    }

    function savePickerState() {
        const hrs = getSelectedValue(hoursColumn);
        const mins = getSelectedValue(minutesColumn);
        const secs = getSelectedValue(secondsColumn);
        // localStorage iptal
    }

    let scrollTimeout;
    function handleScroll() {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(savePickerState, 150); // Kaydırma bittiğinde kaydet
    }

    hoursColumn.addEventListener('scroll', handleScroll);
    minutesColumn.addEventListener('scroll', handleScroll);
    secondsColumn.addEventListener('scroll', handleScroll);

    // --- ONESIGNAL TAG YÖNETİMİ ---
    function updateOneSignalTags(state) {
        try {
            if (window.OneSignal) {
                window.OneSignalDeferred.push(async (OneSignal) => {
                    await OneSignal.User.addTags({
                        session_type: state,
                        last_action_time: new Date().toISOString()
                    });
                });
            }
        } catch(e) { console.error("OS Tag Error", e); }
    }

    // --- HAFTALIK GRAFİK ÇİZİMİ ---
    function renderChart() {
        const chartEl = document.getElementById('weekly-chart');
        if (!chartEl) return;
        const data = Analytics.getWeeklyData();
        let maxWork = Math.max(...data.map(d => d.work), 1); 
        
        chartEl.innerHTML = '';
        data.forEach(day => {
            const height = Math.max((day.work / maxWork) * 40, 2); // Max 40px height
            const col = document.createElement('div');
            col.className = 'chart-col';
            col.innerHTML = `<div class="chart-bar" style="height: ${height}px;"></div><div class="chart-label">${day.day}</div>`;
            chartEl.appendChild(col);
        });
    }

    // --- INIT (BAŞLANGIÇ YÜKLEMESİ VE HAFIZA RESTORASYONU) ---
    if (tracker.load() && tracker.state !== 'idle') {
        switchToActiveScreen();
        
        if (tracker.state === 'working') {
            btnToggle.textContent = 'Mola Ver';
            lblCurrentState.textContent = 'Çalışıyor';
            lblCurrentState.style.color = 'var(--dynamic-color)';
        } else if (tracker.state === 'resting') {
            btnToggle.textContent = 'Çalışmaya Dön';
            lblCurrentState.textContent = 'Mola Veriliyor';
            lblCurrentState.style.color = '#0A84FF';
        }

        const totalSeconds = Math.floor(tracker.targetMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        lblTargetTime.textContent = `${hours > 0 ? hours + 'sa ' : ''}${minutes}dk ${seconds}sn`;

        renderInterval = setInterval(updateUI, 100);
    }

    btnStart.addEventListener('click', function() {
        console.log("Butona basıldı!");
        
        // 1. OTURUM BAŞLATMA
        const hours = getSelectedValue(hoursColumn);
        const minutes = getSelectedValue(minutesColumn);
        const seconds = getSelectedValue(secondsColumn);

        if (hours === 0 && minutes === 0 && seconds === 0) {
            alert('Lütfen geçerli bir hedef süre belirleyin.');
            return;
        }

        // 2. SES VE WAKE LOCK (Hızlı Tetikleme)
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        requestWakeLock();

        // 3. ONESIGNAL HANDSHAKE (iOS User Gesture)
        if (window.OneSignal) {
            // Native izni fırlat ki OS pencereyi hemen açsın
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    window.OneSignalDeferred.push(async (OneSignal) => {
                        await OneSignal.User.PushSubscription.optIn();
                        console.log("OneSignal optIn tetiklendi.");
                    });
                }
            });
        }

        tracker.startSession(hours, minutes, seconds);
        updateOneSignalTags('working');
        
        lblTargetTime.textContent = `${hours > 0 ? hours + 'sa ' : ''}${minutes}dk ${seconds}sn`;
        switchToActiveScreen();
        renderInterval = setInterval(updateUI, 100);
        renderChart();
    });

    btnToggle.addEventListener('click', () => {
        try {
            tracker.toggleState();
            
            if (tracker.state === 'working') {
                btnToggle.textContent = 'Mola Ver';
                lblCurrentState.textContent = 'Çalışıyor';
                lblCurrentState.style.color = 'var(--dynamic-color)';
            } else if (tracker.state === 'resting') {
                btnToggle.textContent = 'Çalışmaya Dön';
                lblCurrentState.textContent = 'Mola Veriliyor';
                lblCurrentState.style.color = '#0A84FF';
            }
        } catch(e) {
            alert("Toggle Error: " + e.message);
        }
    });

    function handleSessionReset() {
        if(confirm("Mevcut oturumu bitirmek istediğinize emin misiniz?")) {
            tracker.reset();
        updateOneSignalTags('idle');
        renderChart();
            clearInterval(renderInterval);
            releaseWakeLock();
            activeScreen.classList.remove('active');
            activeScreen.classList.add('hidden');
            setupScreen.classList.remove('hidden');
            setupScreen.classList.add('active');
        }
    }

    btnEnd.addEventListener('click', handleSessionReset);

    function showToast(message) {
        const toast = document.getElementById('toast-container');
        if (toast) {
            toast.innerText = message;
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
    }

    async function fireNotification(title, body) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        
        // iOS PWA için en güvenli Service Worker bildirim yolu
        navigator.serviceWorker.getRegistration().then(reg => {
            if (reg) {
                reg.showNotification(title, {
                    body: body,
                    icon: "./session_tracker.png",
                    badge: "./session_tracker.png",
                    vibrate: [200, 100, 200]
                });
            }
        });
    }

    function updateUI() {
        try {
            const stats = tracker.getCurrentStats();

            root.style.setProperty('--dynamic-color', stats.color);
            lblCurrentTimer.textContent = SessionTracker.formatTime(stats.currentTimerMs);
            lblPercentage.textContent = `%${Math.floor(stats.progressPercentage)}`;
            statWorkTime.textContent = SessionTracker.formatTime(stats.totalWorkMs);
            statRestTime.textContent = SessionTracker.formatTime(stats.totalRestMs);

            if (stats.justReachedTarget) {
                fireNotification("Hedefe Ulaşıldı! 🎉", "Belirlediğiniz çalışma süresini tamamladınız. Harika iş çıkardınız!");
                showToast("Hedefe Ulaşıldı! 🎉");
            }
            if (stats.triggerWork60) {
                fireNotification("Harika gidiyorsun! ☕", "Bir saati devirdin. Kısa bir mola zihni tazeler, hadi bir kahve al!");
                showToast("1 Saat Devrildi! ☕");
            }
            if (stats.triggerRest15) {
                fireNotification("Mola Bitti 💪", "15 dakikalık mola süren doldu. Odaklanmaya dönmeye ne dersin?");
                showToast("Mola Bitti 💪");
            }
            if (stats.triggerRest30) {
                fireNotification("Yarım Saat Oldu 🍱", "Yarım saati geride bıraktın. Kalan vaktini iyi değerlendir, sonra işe dönme zamanı!");
                showToast("Uzun Mola Bitiyor 🍱");
            }

            // Her 1 saniyede bir veriyi localStorage'a yedekle (Çökme / Kapanma Koruması)
            const currentTime = Date.now();
            const delta = currentTime - tracker.lastSaveTime;
            if (delta >= 1000) {
                tracker.save();
                if (tracker.state === 'working') Analytics.addTime('work', delta);
                else if (tracker.state === 'resting') Analytics.addTime('rest', delta);
                tracker.lastSaveTime = currentTime;
                renderChart();
            }
        } catch(e) {
            console.error("UI Update Error:", e);
        }
    }

    // --- INIT (BAŞLANGIÇ YÜKLEMESİ) ---
  } catch (e) {
      alert("Kritik Hata: " + e.message);
      console.error(e);
  }
});
