// --- FOCUS TRACKER ENGINE v13 ---
class Analytics {
    static getTodayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    // Backward compatibility and data sanitization
    static _getSanitizedData() {
        const data = JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
        for (const key in data) {
            if (!Array.isArray(data[key]) && typeof data[key] === 'object' && data[key] !== null && 'work' in data[key]) {
                data[key] = [{
                    id: new Date(key).getTime(),
                    workMs: data[key].work,
                    restMs: data[key].rest,
                    start: 'N/A',
                    end: 'N/A'
                }];
            }
        }
        return data;
    }

    static saveSession(dateKey, sessionObject) {
        const data = this._getSanitizedData();
        if (!data[dateKey]) {
            data[dateKey] = [];
        }
        data[dateKey].push(sessionObject);
        localStorage.setItem('trackerAnalytics', JSON.stringify(data));
    }

    static deleteSession(dateKey, sessionId) {
        const data = this._getSanitizedData();
        if (data[dateKey]) {
            data[dateKey] = data[dateKey].filter(session => session.id !== sessionId);
            if (data[dateKey].length === 0) {
                delete data[dateKey];
            }
        }
        localStorage.setItem('trackerAnalytics', JSON.stringify(data));
    }

    static getAllData() {
        return this._getSanitizedData();
    }

    static getWeeklyData(targetDate = new Date()) {
        const data = this.getAllData();
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(targetDate);
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const dayName = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][d.getDay()];
            
            const dayData = data[key] || [];
            const totals = dayData.reduce((acc, session) => {
                acc.work += session.workMs || 0;
                acc.rest += session.restMs || 0;
                return acc;
            }, { work: 0, rest: 0 });

            result.push({ day: dayName, work: totals.work, rest: totals.rest, key: key, dateObj: d });
        }
        return result;
    }
}

class SessionTracker {
    constructor() {
        this.reset();
        this.load();
    }
    reset() {
        this.state = 'idle';
        this.targetMs = 0;
        this.totalWorkMs = 0;
        this.totalRestMs = 0;
        this.phaseStartTime = 0;
        this.sessionStartTime = 0;
        this.sessionClockStart = '';
        this.segments = [];
        this.lastSavedTime = Date.now();
        this.notifiedTarget = false;
        this.notified60 = false;
        localStorage.removeItem('sessionData');
    }
    save() {
        const data = { state: this.state, targetMs: this.targetMs, totalWorkMs: this.totalWorkMs, totalRestMs: this.totalRestMs, phaseStartTime: this.phaseStartTime, sessionStartTime: this.sessionStartTime, sessionClockStart: this.sessionClockStart, segments: this.segments, lastSavedTime: Date.now(), notifiedTarget: this.notifiedTarget, notified60: this.notified60 };
        localStorage.setItem('sessionData', JSON.stringify(data));
    }
    load() {
        const saved = localStorage.getItem('sessionData');
        if (saved) {
            const data = JSON.parse(saved);
            Object.assign(this, data);
            // Hourglass Logic: If resting, ignore the gap
            if (this.state === 'resting') {
                const gap = Date.now() - this.lastSavedTime;
                this.phaseStartTime += gap;
            }
        }
    }
    start(h, m, s) {
        this.targetMs = (h * 3600 + m * 60 + s) * 1000;
        this.state = 'working';
        this.sessionStartTime = Date.now();
        this.sessionClockStart = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        this.phaseStartTime = Date.now();
        this.notifiedTarget = false;
        this.notified60 = false;
        this.save();
    }
    toggle() {
        const now = Date.now();
        const elapsed = now - this.phaseStartTime;
        this.segments.push({ type: this.state, duration: elapsed });
        if (this.state === 'working') {
            this.totalWorkMs += elapsed;
            this.state = 'resting';
        } else {
            this.totalRestMs += elapsed;
            this.state = 'working';
        }
        this.phaseStartTime = now;
        this.save();
    }
}

const tracker = new SessionTracker();
let uiInterval;
let currentCalDate = new Date();
let selectedProfileDate = Analytics.getTodayKey();
let currentChartMode = 'daily';

document.addEventListener('DOMContentLoaded', () => {
    initAppFlow();
});

function initAppFlow() {
    const savedName = localStorage.getItem('trackerUserName');
    if (savedName) {
        showApp(savedName);
    }

    document.getElementById('btn-login-action').onclick = async () => {
        const name = document.getElementById('username-input').value.trim();
        if (!name) return alert("Lütfen bir isim girin.");
        localStorage.setItem('trackerUserName', name);
        document.getElementById('loading-overlay').style.display = 'flex';
        
        if (typeof Notification !== 'undefined') {
            await Notification.requestPermission();
        }
        if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async (OS) => {
                await OS.login(name);
                await OS.User.PushSubscription.optIn();
            });
        }

        setTimeout(() => showApp(name), 1500);
    };
}

function showApp(name) {
    document.getElementById('loading-overlay').style.display = 'none';
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('active');
    document.getElementById('profile-display-name').innerText = name;
    
    setupEventListeners();
    populatePickers();
    
    if (tracker.state !== 'idle') {
        startUIUpdate();
    }
}

function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.nav-item').forEach(item => {
        item.onclick = () => {
            const tabId = item.dataset.tab;
            document.querySelectorAll('.tab-content, .nav-item').forEach(el => el.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            item.classList.add('active');
            if (tabId === 'profile-tab') renderCalendar();
            if (tabId === 'analytics-tab') renderChart('daily');
        };
    });

    // Analytics Date Picker
    const datePicker = document.getElementById('analytics-date-picker');
    if (datePicker) {
        datePicker.value = Analytics.getTodayKey();
        datePicker.max = Analytics.getTodayKey();
        datePicker.onchange = () => renderChart(currentChartMode);
    }

    // Session Control
    document.getElementById('btn-start-session').onclick = () => {
        const h = getPickerValue('picker-hours');
        const m = getPickerValue('picker-minutes');
        const s = getPickerValue('picker-seconds');
        if (h+m+s === 0) return alert("Süre seçiniz.");
        tracker.start(h, m, s);
        startUIUpdate();
    };

    document.getElementById('btn-toggle-state').onclick = () => {
        tracker.toggle();
        document.getElementById('btn-toggle-state').innerText = tracker.state === 'working' ? 'Mola Ver' : 'Çalışmaya Dön';
    };

    document.getElementById('btn-end-session').onclick = () => {
        if (!confirm("Oturumu bitirmek istiyor musunuz?")) return;
        saveToHistory();
        tracker.reset();
        location.reload();
    };

    // Analytics View
    document.getElementById('btn-daily-view').onclick = () => {
        document.getElementById('btn-daily-view').classList.add('active');
        document.getElementById('btn-weekly-view').classList.remove('active');
        renderChart('daily');
    };
    document.getElementById('btn-weekly-view').onclick = () => {
        document.getElementById('btn-weekly-view').classList.add('active');
        document.getElementById('btn-daily-view').classList.remove('active');
        renderChart('weekly');
    };

    // Calendar
    document.getElementById('cal-prev').onclick = () => { currentCalDate.setMonth(currentCalDate.getMonth()-1); renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { currentCalDate.setMonth(currentCalDate.getMonth()+1); renderCalendar(); };
}

function startUIUpdate() {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('active-screen').style.display = 'block';
    uiInterval = setInterval(updateUI, 100);
}

async function fireNotification(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    
    try {
        const reg = await navigator.serviceWorker.ready;
        if (reg) {
            reg.showNotification(title, {
                body: body,
                icon: "./session_tracker.png",
                badge: "./session_tracker.png",
                vibrate: [200, 100, 200]
            });
        }
    } catch (err) { console.error("Notification Error:", err); }
}

function updateUI() {
    const now = Date.now();
    const phaseElapsed = now - tracker.phaseStartTime;
    let currentWork = tracker.totalWorkMs + (tracker.state === 'working' ? phaseElapsed : 0);
    let currentRest = tracker.totalRestMs + (tracker.state === 'resting' ? phaseElapsed : 0);

    // Target Sync
    document.getElementById('lbl-target-time').innerText = formatTime(tracker.targetMs);
    document.getElementById('lbl-current-timer').innerText = formatTime(phaseElapsed);
    document.getElementById('lbl-current-state').innerText = tracker.state === 'working' ? 'Çalışıyor' : 'Mola Veriliyor';
    document.documentElement.style.setProperty('--dynamic-color', tracker.state === 'resting' ? '#34C759' : '#FF9500');

    // Progress
    const progress = Math.min((currentWork / tracker.targetMs) * 100, 100);
    const pill = document.getElementById('lbl-percentage');
    pill.innerText = `%${Math.round(progress)}`;
    pill.className = `progress-pill ${progress < 30 ? 'progress-low' : progress < 70 ? 'progress-mid' : 'progress-high'}`;

    // Summary & Segments
    const total = (currentWork + currentRest) || 1;
    document.getElementById('segment-summary').innerHTML = `İş: ${formatTime(currentWork)} (%${Math.round(currentWork/total*100)}) | Mola: ${formatTime(currentRest)} (%${Math.round(currentRest/total*100)})`;

    const list = document.getElementById('segment-list');
    const allSegs = [...tracker.segments, {type: tracker.state, duration: phaseElapsed}];
    list.innerHTML = allSegs.reverse().map((seg, i) => `
        <div style="display:flex; justify-content:space-between; padding:10px; background:#2C2C2E; border-radius:10px; border-left:4px solid ${seg.type==='working'?'#FF9500':'#34C759'}">
            <span>${seg.type==='working'?'Oturum':'Mola'}</span>
            <span>${formatTime(seg.duration)}</span>
        </div>
    `).join('');

    // Notification Triggers
    if (progress >= 100 && !tracker.notifiedTarget && tracker.targetMs > 0) {
        tracker.notifiedTarget = true;
        tracker.save();
        fireNotification("Hedefe Ulaşıldı! 🎉", "Belirlenen çalışma hedefini tamamladın!");
    }
    
    if (tracker.state === 'working' && phaseElapsed >= 3600000 && !tracker.notified60) {
        tracker.notified60 = true;
        tracker.save();
        fireNotification("Harika gidiyorsun! ☕", "60 dakikadır kesintisiz çalışıyorsun. Kısa bir mola vermeye ne dersin?");
    }

}

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    return `${String(h).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

function populatePickers() {
    const fill = (id, max) => {
        const el = document.getElementById(id);
        if (el.children.length > 0) return;
        for(let i=0; i<=max; i++) el.innerHTML += `<div class="picker-item">${String(i).padStart(2,'0')}</div>`;
    };
    fill('picker-hours', 23); fill('picker-minutes', 59); fill('picker-seconds', 59);
}

function getPickerValue(id) {
    const el = document.getElementById(id);
    return Math.round(el.scrollTop / 50);
}

function saveToHistory() {
    if (tracker.totalWorkMs < 1000) return; // Don't save trivial sessions

    const sessionData = {
        id: Date.now(),
        workMs: tracker.totalWorkMs,
        restMs: tracker.totalRestMs,
        start: tracker.sessionClockStart || new Date(tracker.sessionStartTime).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        end: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    };
    Analytics.saveSession(Analytics.getTodayKey(), sessionData);
}

function renderChart(mode) {
    currentChartMode = mode;
    const chart = document.getElementById('analytics-chart');
    const title = document.getElementById('chart-title');
    const picker = document.getElementById('analytics-date-picker');
    const selectedDate = picker ? picker.value : Analytics.getTodayKey();
    const allData = Analytics.getAllData();
    const sessionBox = document.getElementById('analytics-session-box');
    const sessionList = document.getElementById('analytics-session-list');
    
    if (mode === 'daily') {
        title.innerText = "Günlük Analiz";
        sessionBox.style.display = 'block';
        const daySessions = allData[selectedDate] || [];

        const dayTotals = daySessions.reduce((acc, s) => {
            acc.work += s.workMs;
            acc.rest += s.restMs;
            return acc;
        }, { work: 0, rest: 0 });

        const total = (dayTotals.work + dayTotals.rest) || 1;
        const workPerc = (dayTotals.work / total) * 100;
        
        if (daySessions.length === 0) {
            chart.innerHTML = `<div style="text-align:center; padding:40px 0; color:var(--text-secondary);">Bu tarihte veri bulunamadı.</div>`;
            sessionList.innerHTML = '';
            return;
        }
        
        chart.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; width:100%; padding: 10px 0;">
                <div style="width:140px; height:140px; border-radius:50%; background: conic-gradient(var(--dynamic-color) 0% ${workPerc}%, #34C759 ${workPerc}% 100%); display:flex; align-items:center; justify-content:center;">
                    <div style="width:120px; height:120px; background:#1C1C1E; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                        <span style="font-size:26px; font-weight:700; color:#FFF;">%${Math.round(workPerc)}</span>
                        <span style="font-size:12px; color:var(--text-secondary);">İş Oranı</span>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-around; width:100%; margin-top:24px;">
                    <div style="text-align:center;">
                        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">ÇALIŞMA</div>
                        <div style="color:var(--dynamic-color); font-weight:600; font-size:18px;">${formatTime(dayTotals.work)}</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">MOLA</div>
                        <div style="color:#34C759; font-weight:600; font-size:18px;">${formatTime(dayTotals.rest)}</div>
                    </div>
                </div>
            </div>
        `;

        sessionList.innerHTML = daySessions.map(s => createSessionHtml(s, false)).join('');
    } else {
        const weekData = Analytics.getWeeklyData(new Date(selectedDate));
        const startDay = weekData[0].dateObj;
        const endDay = weekData[6].dateObj;
        title.innerText = `${startDay.toLocaleDateString('tr-TR', {day:'numeric', month:'long'})} - ${endDay.toLocaleDateString('tr-TR', {day:'numeric', month:'long', year:'numeric'})}`;

        const max = Math.max(...weekData.map(d => d.work + d.rest), 1);
        chart.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:flex-end; width:100%; height:160px; gap:8px; margin-top: 10px;">' + weekData.map(d => `
            <div style="display:flex; flex-direction:column; align-items:center; flex:1; gap:8px;">
                <div style="width:100%; display:flex; flex-direction:column-reverse; border-radius:4px; overflow:hidden; min-height:4px; background:#2c2c2e; height: ${((d.work + d.rest) / max) * 100}%;">
                    <div style="width:100%; background:var(--dynamic-color); height: ${((d.work) / (d.work + d.rest || 1)) * 100}%"></div>
                    <div style="width:100%; background:#34C759; height: ${((d.rest) / (d.work + d.rest || 1)) * 100}%"></div>
                </div>
                <div style="font-size:10px; color:var(--text-secondary);">${d.day}</div>
            </div>
        `).join('') + '</div>';
        sessionBox.style.display = 'none';
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const data = Analytics.getAllData();
    
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    document.getElementById('cal-month-year').innerText = currentCalDate.toLocaleDateString('tr', {month:'long', year:'numeric'});
    
    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    dayNames.forEach(d => grid.innerHTML += `<div style="font-size:11px; color:var(--text-secondary); text-align:center; margin-bottom:8px;">${d}</div>`);

    const firstDay = new Date(year, month, 1).getDay();
    const startOffset = (firstDay + 6) % 7; // Pazartesi başlangıcı hesaplaması
    const days = new Date(year, month + 1, 0).getDate();
    
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayKey = Analytics.getTodayKey();

    for(let i=0; i<startOffset; i++) grid.innerHTML += `<div></div>`; // Boşluklar
    
    for(let i=1; i<=days; i++) {
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const isToday = dateKey === todayKey;
        const isSelected = dateKey === selectedProfileDate;
        const hasData = data[dateKey] && (data[dateKey].work > 0 || data[dateKey].rest > 0);
        
        grid.innerHTML += `<div class="cal-day ${isToday ? 'today' : ''} ${isSelected ? 'active' : ''}" data-key="${dateKey}" style="cursor:pointer; user-select:none;">
            ${i}
            ${hasData ? '<div class="cal-dot"></div>' : ''}
        </div>`;
    }
    
    document.querySelectorAll('.cal-day[data-key]').forEach(el => {
        el.onclick = () => {
            selectedProfileDate = el.dataset.key;
            renderCalendar();
            renderProfileHistory();
        };
    });
    renderProfileHistory();
}

function renderProfileHistory() {
    const list = document.getElementById('profile-history-list');
    const daySessions = Analytics.getAllData()[selectedProfileDate] || [];

    if (daySessions.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding: 20px;">Bu tarihte kayıtlı veri yok.</div>`;
        return;
    }

    list.innerHTML = daySessions.map(s => createSessionHtml(s, true)).join('');

    document.querySelectorAll('.btn-delete-session').forEach(btn => {
        btn.onclick = () => {
            const sessionId = parseInt(btn.dataset.sessionId);
            if (confirm("Bu oturum kaydı kalıcı olarak silinecek. Emin misiniz?")) {
                Analytics.deleteSession(selectedProfileDate, sessionId);
                renderCalendar(); // Re-render calendar to update dot
            }
        };
    });
}

function createSessionHtml(s, showDelete = false) {
    const totalMs = (s.workMs || 0) + (s.restMs || 0);
    const eff = totalMs > 0 ? Math.round(((s.workMs || 0) / totalMs) * 100) : 0;
    const effColor = eff < 30 ? '#FF3B30' : (eff <= 70 ? '#FFCC00' : 'var(--dynamic-color)');
    const effTextColor = eff < 30 ? '#FFF' : '#000';

    return `
        <div style="background:#2C2C2E; padding:15px; border-radius:15px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:14px; color:var(--text-secondary); margin-bottom:6px;">Oturum: ${s.start || 'N/A'} - ${s.end || 'N/A'}</div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="color:var(--dynamic-color); font-weight:600;">İş: ${formatTime(s.workMs)}</span>
                    <span style="color:#34C759; font-weight:600;">Mola: ${formatTime(s.restMs)}</span>
                    <span style="background:${effColor}; color:${effTextColor}; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:700;">%${eff} Verim</span>
                </div>
            </div>
            ${showDelete ? `<button class="btn-delete-session" data-session-id="${s.id}" style="background:rgba(255,59,48,0.2); color:#FF3B30; border:none; width:44px; height:44px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>` : ''}
        </div>
    `;
}