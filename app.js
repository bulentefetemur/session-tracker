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
    static getAllData() {
        return JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
    }
    static getWeeklyData() {
        try {
            const data = this.getAllData();
            const result = [];
            for(let i=6; i>=0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const dayName = d.toLocaleDateString('tr-TR', {weekday:'short'});
                result.push({ day: dayName, work: data[key]?.work || 0, rest: data[key]?.rest || 0, key: key, dateObj: d });
            }
            return result;
        } catch(e) { return []; }
    }
    static deleteSession(dateKey, sessionId) {
        let data = this.getAllData();
        if (data[dateKey] && data[dateKey].sessions) {
            data[dateKey].sessions = data[dateKey].sessions.filter(s => s.id !== sessionId);
            localStorage.setItem('trackerAnalytics', JSON.stringify(data));
        }
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
        this.segments = [];
        this.lastSavedTime = Date.now();
        this.save();
    }
    save() {
        this.lastSavedTime = Date.now();
        const data = { state: this.state, targetMs: this.targetMs, totalWorkMs: this.totalWorkMs, totalRestMs: this.totalRestMs, phaseStartTime: this.phaseStartTime, lastSavedTime: this.lastSavedTime, segments: this.segments };
        localStorage.setItem('sessionData', JSON.stringify(data));
    }
    load() {
        const data = localStorage.getItem('sessionData');
        if (data) {
            const p = JSON.parse(data);
            Object.assign(this, p);
            if (!this.segments) this.segments = [];
            if (this.state === 'resting' && this.lastSavedTime) {
                const offlineMs = Date.now() - this.lastSavedTime;
                this.phaseStartTime += offlineMs;
            }
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
        this.segments = [];
        this.lastSavedTime = Date.now();
        localStorage.removeItem('sessionData');
    }
    toggleState() {
        if (this.state === 'idle') return;
        const elapsed = Date.now() - this.phaseStartTime;
        this.segments.push({ type: this.state, duration: elapsed });
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
                renderChart('daily');
            });
            btnWeekly.addEventListener('click', () => {
                btnWeekly.classList.add('active');
                btnDaily.classList.remove('active');
                renderChart('weekly');
            });
        }

        // --- PROFILE DATA DELETION ---
        const historyList = document.getElementById('profile-history-list');
        if (historyList) {
            historyList.addEventListener('click', (e) => {
                const btn = e.target.closest('.delete-btn');
                if (btn) {
                    const key = btn.dataset.key;
                    if (confirm(`Bu tarihe ait veriyi silmek istediğinizden emin misiniz?`)) {
                        let data = JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
                        delete data[key];
                        localStorage.setItem('trackerAnalytics', JSON.stringify(data));
                        updateProfileStats(); // Refresh UI
                    }
                }
            });
        }

        // --- CALENDAR NAVIGATION ---
        document.getElementById('cal-prev')?.addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() - 1);
            updateProfileStats();
        });
        document.getElementById('cal-next')?.addEventListener('click', () => {
            currentCalDate.setMonth(currentCalDate.getMonth() + 1);
            updateProfileStats();
        });
    }

         document.addEventListener('visibilitychange', () => {
            if (tracker && tracker.state !== 'idle') {
                if (document.visibilityState === 'hidden') {
                    tracker.save();
                } else if (document.visibilityState === 'visible') {
                    if (tracker.state === 'resting') {
                        const offlineMs = Date.now() - tracker.lastSavedTime;
                        tracker.phaseStartTime += offlineMs;
                        tracker.save();
                    }
                }
            }
        });
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
        document.documentElement.style.setProperty('--dynamic-color', s.state === 'resting' ? '#34C759' : '#FF9500');
        document.getElementById('lbl-current-timer').innerText = formatTime(s.phaseElapsed, true);
        const percentageEl = document.getElementById('lbl-percentage');
        percentageEl.innerText = `%${Math.floor(s.progress || 0)}`;
        
        let progressClass = 'progress-low';
        if (s.progress >= 70) progressClass = 'progress-high';
        else if (s.progress >= 30) progressClass = 'progress-mid';
        percentageEl.className = 'progress-pill ' + progressClass;

        document.getElementById('lbl-current-state').innerText = s.state === 'working' ? 'Çalışıyor' : 'Mola Veriliyor';
        document.getElementById('lbl-target-time').innerText = formatTime(tracker.targetMs, true);

        // --- SEGMENT LIST & SUMMARY ---
        const summaryEl = document.getElementById('segment-summary');
        const listEl = document.getElementById('segment-list');
        if (summaryEl && listEl) {
            const totalMs = (s.curWork + s.curRest) || 1;
            const workPerc = Math.round((s.curWork / totalMs) * 100);
            const restPerc = Math.round((s.curRest / totalMs) * 100);
            summaryEl.innerHTML = `Toplam İş: <span style="color:var(--dynamic-color);">${formatTime(s.curWork, true)}</span> (%${workPerc}) | Toplam Mola: <span style="color:#34C759;">${formatTime(s.curRest, true)}</span> (%${restPerc})`;
            
            const allSegments = [...tracker.segments, { type: s.state, duration: s.phaseElapsed }];
            let workCount = 0;
            let restCount = 0;
            
            listEl.innerHTML = allSegments.map(seg => {
                let name = "";
                let color = "";
                if (seg.type === 'working') {
                    workCount++;
                    name = `${workCount}. Oturum`;
                    color = 'var(--dynamic-color)';
                } else {
                    restCount++;
                    name = `${restCount}. Mola`;
                    color = '#34C759';
                }
                return `
                    <div style="background: #1C1C1E; padding: 12px 16px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; border-left: 4px solid ${color};">
                        <span style="font-weight: 500; font-size: 15px; color: #FFF;">${name}</span>
                        <span style="font-variant-numeric: tabular-nums; color: var(--text-secondary);">${formatTime(seg.duration, true)}</span>
                    </div>
                `;
            }).reverse().join('');
        }

        Analytics.addTime(s.state === 'working' ? 'work' : 'rest', 100);
        if (document.getElementById('profile-tab').classList.contains('active')) updateProfileStats();

        if (s.justReachedTarget) {
            const userName = localStorage.getItem('trackerUserName') || "Şampiyon";
            const h = Math.floor(tracker.targetMs / 3600000);
            const m = Math.floor((tracker.targetMs % 3600000) / 60000);
            let targetText = "";
            if (h > 0) targetText += `${h} saat `;
            if (m > 0) targetText += `${m} dakika`;
            targetText = targetText.trim() || "Belirlenen";
            fireNotification("Hedefe Ulaşıldı! 🎉", `Harika bir iş çıkardın, ${userName}! ${targetText} hedefini tamamladın. Şimdi dinlenme vakti! 🎉`);
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
        if (tabId === 'analytics-tab') {
            const isWeekly = document.getElementById('btn-weekly-view').classList.contains('active');
            renderChart(isWeekly ? 'weekly' : 'daily');
        }
        if (tabId === 'profile-tab') updateProfileStats();
    }

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    function renderChart(mode = 'daily') {
        const chart = document.getElementById('analytics-chart');
        const title = document.getElementById('chart-title');
        const data = Analytics.getWeeklyData();
        
        if (mode === 'daily') {
            const today = data[data.length - 1];
            const total = (today.work + today.rest) || 1;
            const workPerc = (today.work / total) * 100;
            if (title) title.innerText = "Bugünkü Odaklanma Oranı";
            chart.innerHTML = `
                <div style="display:flex; flex-direction:column; align-items:center; gap:24px; width:100%; padding-top: 10px;">
                    <div style="width:140px; height:140px; border-radius:50%; background: conic-gradient(var(--dynamic-color) 0% ${workPerc}%, #34C759 ${workPerc}% 100%); display:flex; align-items:center; justify-content:center;">
                        <div style="width:120px; height:120px; background:#1C1C1E; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                            <span style="font-size:26px; font-weight:700; color:#FFF;">%${Math.round(workPerc)}</span>
                            <span style="font-size:12px; color:var(--text-secondary);">Odak</span>
                        </div>
                    </div>
                    <div class="daily-stats-container" style="display:flex; justify-content:space-around; width:100%;">
                        <div class="stat-box" style="text-align:center;">
                            <span class="stat-title" style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Çalışma</span>
                            <div class="stat-value" style="color:var(--dynamic-color); font-size:20px; font-weight:600; margin-top:4px;">${formatTime(today.work)}</div>
                        </div>
                        <div class="stat-box" style="text-align:center;">
                            <span class="stat-title" style="font-size:11px; color:var(--text-secondary); text-transform:uppercase;">Mola</span>
                            <div class="stat-value" style="color:#34C759; font-size:20px; font-weight:600; margin-top:4px;">${formatTime(today.rest)}</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            if (title) title.innerText = "Haftalık Analiz";
            const max = Math.max(...data.map(d => d.work + d.rest), 1);
            chart.innerHTML = '<div class="weekly-chart" style="display:flex; justify-content:space-around; align-items:flex-end; height:140px; gap:8px; margin-top:20px;">' + data.map(d => `
                <div class="chart-col" data-day="${d.day}" data-work="${d.work}" data-rest="${d.rest}" style="display:flex; flex-direction:column; align-items:center; flex:1; gap:8px;">
                    <div class="stacked-bar-container" style="width:100%; display:flex; flex-direction:column-reverse; border-radius:4px; overflow:hidden; min-height:4px; background:#2c2c2e; transition:transform 0.2s ease; height: ${((d.work + d.rest) / max) * 100}%; cursor:pointer;">
                        <div class="stacked-bar-work" style="width:100%; background:var(--dynamic-color); transition:height 0.5s; height: ${((d.work) / (d.work + d.rest || 1)) * 100}%"></div>
                        <div class="stacked-bar-rest" style="width:100%; background:#34C759; transition:height 0.5s; height: ${((d.rest) / (d.work + d.rest || 1)) * 100}%"></div>
                    </div>
                    <div class="chart-label" style="font-size:10px; color:var(--text-secondary);">${d.day}</div>
                </div>
            `).join('') + '</div>';

            document.querySelectorAll('.chart-col').forEach(col => {
                col.addEventListener('click', () => {
                    const day = col.dataset.day;
                    const work = parseInt(col.dataset.work);
                    const rest = parseInt(col.dataset.rest);
                    title.innerText = `${day} günü: ${formatTime(work)} çalışma, ${formatTime(rest)} mola`;
                });
            });
        }
    }

    let currentCalDate = new Date();
    let selectedProfileDate = Analytics.getTodayKey();

    function updateProfileStats() {
        const data = Analytics.getAllData();
        const weeklyData = Analytics.getWeeklyData();
        const listEl = document.getElementById('profile-history-list');
        const calEl = document.getElementById('profile-calendar');
        const monthYearEl = document.getElementById('cal-month-year');

        document.getElementById('profile-name').innerText = localStorage.getItem('trackerUserName') || "Kullanıcı";
        document.getElementById('profile-week-work').innerText = formatTime(weeklyData.reduce((a,b)=>a+b.work, 0));

        if (calEl && monthYearEl) {
            const year = currentCalDate.getFullYear();
            const month = currentCalDate.getMonth();
            monthYearEl.innerText = currentCalDate.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
            
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            
            let html = '';
            const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
            dayNames.forEach(d => html += `<div class="cal-day-header">${d}</div>`);
            
            const startOffset = firstDay === 0 ? 6 : firstDay - 1;
            
            for (let i = 0; i < startOffset; i++) {
                html += `<div class="cal-day-cell empty"></div>`;
            }
            
            for (let i = 1; i <= daysInMonth; i++) {
                const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
                const isSelected = dateKey === selectedProfileDate;
                const hasData = data[dateKey] && (data[dateKey].work > 0 || data[dateKey].rest > 0);
                
                html += `
                    <div class="cal-day-cell ${isSelected ? 'active' : ''}" data-key="${dateKey}">
                        ${i}
                        ${hasData ? '<div class="cal-dot"></div>' : ''}
                    </div>
                `;
            }
            calEl.innerHTML = html;
            
            document.querySelectorAll('.cal-day-cell:not(.empty)').forEach(el => {
                el.addEventListener('click', () => {
                    selectedProfileDate = el.dataset.key;
                    updateProfileStats();
                });
            });
        }

        if(listEl) {
            const selectedDayData = data[selectedProfileDate];
            if (!selectedDayData || (selectedDayData.work === 0 && selectedDayData.rest === 0)) {
                listEl.innerHTML = '<div style="text-align:center; color: var(--text-secondary); margin-top: 32px; font-size: 14px;">Bu tarihte kayıt bulunmuyor.</div>';
            } else {
                listEl.innerHTML = `
                    <div style="background: #1C1C1E; padding: 16px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display:flex; flex-direction:column; gap:6px;">
                            <span style="font-weight: 600; font-size: 16px; color: #fff;">Odaklanma Seansı</span>
                            <span style="font-size: 13px; color: var(--text-secondary);">Çalışma: <span style="color:var(--dynamic-color);">${formatTime(selectedDayData.work)}</span> &nbsp;|&nbsp; Mola: <span style="color:#34C759;">${formatTime(selectedDayData.rest)}</span></span>
                        </div>
                        <button class="delete-btn" data-key="${selectedProfileDate}" style="background: rgba(255, 59, 48, 0.1); border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.2s;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    </div>
                `;
            }
        }
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

    function formatTime(ms, showHoursEvenIfZero = true) {
        const s = Math.floor(ms / 1000);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (showHoursEvenIfZero || h > 0) return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
        return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    }
});