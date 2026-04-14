const MAINTENANCE_MODE = false; // Bunu true yaparsak "Yakında" ekranı gelir.
if (MAINTENANCE_MODE) document.body.classList.add('maintenance-on');

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
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        this.targetReached = false;
        this.reset();
    }
    startSession(h, m, s) {
        this.targetMs = (h * 3600000) + (m * 60000) + (s * 1000);
        this.state = 'working';
        this.phaseStartTime = Date.now();
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        this.targetReached = false;
        this.save();
    }
    save() {
        const data = { state: this.state, targetMs: this.targetMs, totalWorkMs: this.totalWorkMs, totalRestMs: this.totalRestMs, phaseStartTime: this.phaseStartTime };
        localStorage.setItem('sessionData', JSON.stringify(data));
    }
    load() {
        const data = localStorage.getItem('sessionData');
        if (data) {
            const p = JSON.parse(data);
            Object.assign(this, p);
            return true;
        }
        return false;
    }
    reset() {
        this.state = 'idle'; this.targetMs = 0; this.totalWorkMs = 0; this.totalRestMs = 0; this.phaseStartTime = 0;
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        this.targetReached = false;
        localStorage.removeItem('sessionData');
    }
    toggleState() {
        if (this.state === 'idle') return;
        const elapsed = Date.now() - this.phaseStartTime;
        if (this.state === 'working') { this.totalWorkMs += elapsed; this.state = 'resting'; }
        else { this.totalRestMs += elapsed; this.state = 'working'; }
        this.phaseStartTime = Date.now();
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest30 = false;
        this.save();
    }
    getCurrentStats() {
        const now = Date.now();
        let curWork = this.totalWorkMs;
        let curRest = this.totalRestMs;
        let phaseElapsed = now - this.phaseStartTime;
        if (this.state === 'working') curWork += phaseElapsed;
        else if (this.state === 'resting') curRest += phaseElapsed;
        
        let progress = this.targetMs > 0 ? (curWork / this.targetMs) * 100 : 0;
        let justReachedTarget = false, triggerWork60 = false, triggerRest15 = false, triggerRest30 = false;

        if (this.state === 'working' && phaseElapsed >= 3600000 && !this.notifiedWork60) {
            this.notifiedWork60 = true; triggerWork60 = true;
        } else if (this.state === 'resting') {
            if (phaseElapsed >= 1800000 && !this.notifiedRest30) {
                this.notifiedRest30 = true; triggerRest30 = true;
            } else if (phaseElapsed >= 900000 && !this.notifiedRest15) {
                this.notifiedRest15 = true; triggerRest15 = true;
            }
        }
        
        if (progress >= 100 && !this.targetReached && this.targetMs > 0) {
            this.targetReached = true; justReachedTarget = true; this.save();
        }

        return { state: this.state, phaseElapsed, curWork, curRest, progress, justReachedTarget, triggerWork60, triggerRest15, triggerRest30 };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tracker = new SessionTracker();
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app');
    const loadingOverlay = document.getElementById('loading-overlay');
    let renderInterval;

    // --- INITIAL LOGIN CHECK ---
    const savedName = localStorage.getItem('trackerUserName');
    if (savedName) {
        loginScreen.style.display = 'none';
        appContainer.classList.add('active');
        initApp();
    }

    // --- LOGIN LOGIC ---
    document.getElementById('btn-login-action').addEventListener('click', async () => {
        const name = document.getElementById('username-input').value.trim();
        if (!name) return alert("İsim giriniz.");
        
        loadingOverlay.style.display = 'flex';
        localStorage.setItem('trackerUserName', name);

        if (window.OneSignal) {
            window.OneSignalDeferred.push(async (OS) => {
                await OS.login(name);
                await Notification.requestPermission();
                await OS.User.PushSubscription.optIn();
            });
        }

        setTimeout(() => {
            loadingOverlay.style.display = 'none';
            loginScreen.style.display = 'none';
            appContainer.classList.add('active');
            initApp();
        }, 2500);
    });

    function initApp() {
        const setup = document.getElementById('setup-screen');
        const active = document.getElementById('active-screen');
        
        if (tracker.load() && tracker.state !== 'idle') {
            setup.classList.add('hidden');
            active.classList.remove('hidden');
            renderInterval = setInterval(updateUI, 100);
        }

        populatePickers();
        
        document.getElementById('btn-start-session').addEventListener('click', () => {
            const h = getPickerValue('picker-hours');
            const m = getPickerValue('picker-minutes');
            const s = getPickerValue('picker-seconds');
            if (h+m+s === 0) return alert("Süre seçin.");
            
            tracker.startSession(h, m, s);
            setup.classList.add('hidden');
            active.classList.remove('hidden');
            renderInterval = setInterval(updateUI, 100);
        });

        document.getElementById('btn-toggle-state').addEventListener('click', () => {
            tracker.toggleState();
            document.getElementById('btn-toggle-state').innerText = tracker.state === 'working' ? 'Mola Ver' : 'Çalışmaya Dön';
        });

        document.getElementById('btn-end-session').addEventListener('click', () => {
            if (confirm("Bitirilsin mi?")) {
                tracker.reset();
                clearInterval(renderInterval);
                active.classList.add('hidden');
                setup.classList.remove('hidden');
            }
        });

        // --- ANALYTICS VIEW TOGGLES ---
        const btnDaily = document.getElementById('btn-daily-view');
        const btnWeekly = document.getElementById('btn-weekly-view');
        if (btnDaily && btnWeekly) {
            btnDaily.addEventListener('click', () => {
                btnDaily.classList.add('active');
                btnWeekly.classList.remove('active');
                renderChart();
            });
            btnWeekly.addEventListener('click', () => {
                btnWeekly.classList.add('active');
                btnDaily.classList.remove('active');
                renderChart();
            });
        }
    }

    // --- UI HELPERS ---
    async function fireNotification(title, body) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        
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
        const s = tracker.getCurrentStats();
        document.documentElement.style.setProperty('--dynamic-color', s.state === 'resting' ? '#34C759' : '#FF3B30');
        document.getElementById('lbl-current-timer').innerText = formatTime(s.phaseElapsed);
        document.getElementById('lbl-percentage').innerText = `%${Math.floor(s.progress || 0)}`;
        document.getElementById('stat-work-time').innerText = formatTime(s.curWork);
        document.getElementById('stat-rest-time').innerText = formatTime(s.curRest);
        document.getElementById('lbl-current-state').innerText = s.state === 'working' ? 'Çalışıyor' : 'Mola Veriliyor';
        
        Analytics.addTime(s.state === 'working' ? 'work' : 'rest', 100);
        if (document.getElementById('profile-tab').classList.contains('active')) updateProfileStats();

        if (s.justReachedTarget) {
            fireNotification("Hedefe Ulaşıldı! 🎉", "Belirlediğiniz çalışma süresini tamamladınız. Harika iş çıkardınız!");
        }
        if (s.triggerWork60) {
            fireNotification("Harika gidiyorsun! ☕", "Bir saati devirdin. Kısa bir mola zihni tazeler, hadi bir kahve al!");
        }
        if (s.triggerRest15) {
            fireNotification("Mola Bitti 💪", "15 dakikalık mola süren doldu. Odaklanmaya dönmeye ne dersin?");
        }
        if (s.triggerRest30) {
            fireNotification("Yarım Saat Oldu 🍱", "Yarım saati geride bıraktın. Kalan vaktini iyi değerlendir, sonra işe dönme zamanı!");
        }
    }

    function switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.getElementById(tabId).classList.add('active');
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        if (tabId === 'analytics-tab') renderChart();
        if (tabId === 'profile-tab') updateProfileStats();
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    function renderChart() {
        const chart = document.getElementById('analytics-chart');
        const data = Analytics.getWeeklyData();
        const max = Math.max(...data.map(d => d.work), 1);
        chart.innerHTML = data.map(d => `
            <div class="chart-col">
                <div class="chart-bar" style="height: ${(d.work / max) * 100}px"></div>
                <div class="chart-label">${d.day}</div>
            </div>
        `).join('');
    }

    function updateProfileStats() {
        const data = Analytics.getWeeklyData();
        const today = data[data.length - 1];
        document.getElementById('profile-name').innerText = localStorage.getItem('trackerUserName') || "Kullanıcı";
        document.getElementById('profile-today-work').innerText = formatTime(today.work);
        document.getElementById('profile-week-work').innerText = formatTime(data.reduce((a,b)=>a+b.work, 0));
    }

    function populatePickers() {
        const fill = (id, max) => {
            const el = document.getElementById(id);
            if (!el || el.children.length > 0) return;
            for(let i=0; i<=max; i++) el.innerHTML += `<div class="picker-item">${String(i).padStart(2,'0')}</div>`;
        };
        fill('picker-hours', 23); fill('picker-minutes', 59); fill('picker-seconds', 59);
    }

    function getPickerValue(id) {
        const el = document.getElementById(id);
        return Math.round(el.scrollTop / 50);
    }

    function formatTime(ms) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }
});