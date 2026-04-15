// --- FOCUS TRACKER ENGINE v23 - STABLE ---
console.log("v23-CRITICAL-FIX-ACTIVE");

class Analytics {
    static getTodayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }

    static _getSanitizedData() {
        const data = JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
        for (const key in data) {
            if (!Array.isArray(data[key])) {
                if (typeof data[key] === 'object' && 'work' in data[key]) {
                    data[key] = [{ id: Date.now(), workMs: data[key].work, restMs: data[key].rest, start: 'N/A', end: 'N/A' }];
                } else { data[key] = []; }
            }
        }
        return data;
    }

    static saveSession(dateKey, sessionObject) {
        const data = this._getSanitizedData();
        if (!data[dateKey]) data[dateKey] = [];
        data[dateKey].push(sessionObject);
        localStorage.setItem('trackerAnalytics', JSON.stringify(data));
    }

    static deleteSession(dateKey, sessionId) {
        const data = this._getSanitizedData();
        if (data[dateKey]) {
            data[dateKey] = data[dateKey].filter(s => s.id !== sessionId);
            if (data[dateKey].length === 0) delete data[dateKey];
        }
        localStorage.setItem('trackerAnalytics', JSON.stringify(data));
    }

    static getAllData() { return this._getSanitizedData(); }

    static getWeeklyData(targetDate = new Date()) {
        const data = this.getAllData();
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(targetDate);
            d.setDate(d.getDate() - i);
            const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
            const dayName = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'][d.getDay()];
            const daySessions = data[key] || [];
            const totals = daySessions.reduce((acc, s) => { acc.work += s.workMs || 0; acc.rest += s.restMs || 0; return acc; }, { work: 0, rest: 0 });
            result.push({ day: dayName, work: totals.work, rest: totals.rest, key: key, dateObj: d });
        }
        return result;
    }
}

class SessionTracker {
    constructor() { this.reset(); this.load(); }
    reset() {
        this.state = 'idle'; this.targetMs = 0; this.totalWorkMs = 0; this.totalRestMs = 0;
        this.phaseStartTime = 0; this.sessionStartTime = 0; this.sessionClockStart = '';
        this.segments = []; this.lastSavedTime = Date.now();
        this.notifiedTarget = false; this.notified60 = false;
        localStorage.removeItem('sessionData');
    }
    save() {
        const data = { ...this, lastSavedTime: Date.now() };
        localStorage.setItem('sessionData', JSON.stringify(data));
    }
    load() {
        const saved = localStorage.getItem('sessionData');
        if (saved) {
            Object.assign(this, JSON.parse(saved));
            if (this.state === 'resting') this.phaseStartTime += (Date.now() - this.lastSavedTime);
        }
    }
    start(h, m, s) {
        this.targetMs = (h * 3600 + m * 60 + s) * 1000;
        this.state = 'working';
        this.sessionStartTime = Date.now();
        this.sessionClockStart = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        this.phaseStartTime = Date.now();
        this.save();
    }
    toggle() {
        const elapsed = Date.now() - this.phaseStartTime;
        this.segments.push({ type: this.state, duration: elapsed });
        if (this.state === 'working') { this.totalWorkMs += elapsed; this.state = 'resting'; }
        else { this.totalRestMs += elapsed; this.state = 'working'; }
        this.phaseStartTime = Date.now();
        this.save();
    }
}

const tracker = new SessionTracker();
let uiInterval;
let currentCalDate = new Date();
let selectedProfileDate = Analytics.getTodayKey();

document.addEventListener('DOMContentLoaded', () => initAppFlow());

function initAppFlow() {
    const savedName = localStorage.getItem('trackerUserName');
    if (savedName) showApp(savedName);

    document.getElementById('btn-login-action').onclick = async () => {
        const name = document.getElementById('username-input').value.trim();
        if (!name) return alert("Lütfen bir isim girin.");
    
        localStorage.setItem('trackerUserName', name);
        document.getElementById('loading-overlay').style.display = 'flex';
    
        // iOS için çifte izin isteme
        if (typeof Notification !== 'undefined') {
            await Notification.requestPermission();
        }

        if (window.OneSignalDeferred) {
            window.OneSignalDeferred.push(async function(OneSignal) {
                await OneSignal.login(name);
                await OneSignal.Notifications.requestPermission(); // OneSignal üzerinden izin iste
                await OneSignal.User.PushSubscription.optIn();
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
    if (tracker.state !== 'idle') startUIUpdate();
}

function setupEventListeners() {
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

    document.getElementById('analytics-date-picker').onchange = () => renderChart(document.getElementById('btn-weekly-view').classList.contains('active') ? 'weekly' : 'daily');
    document.getElementById('btn-start-session').onclick = () => {
        const h = getPickerValue('picker-hours'), m = getPickerValue('picker-minutes'), s = getPickerValue('picker-seconds');
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
    document.getElementById('btn-daily-view').onclick = () => { document.getElementById('btn-daily-view').classList.add('active'); document.getElementById('btn-weekly-view').classList.remove('active'); renderChart('daily'); };
    document.getElementById('btn-weekly-view').onclick = () => { document.getElementById('btn-weekly-view').classList.add('active'); document.getElementById('btn-daily-view').classList.remove('active'); renderChart('weekly'); };
    document.getElementById('cal-prev').onclick = () => { currentCalDate.setMonth(currentCalDate.getMonth()-1); renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { currentCalDate.setMonth(currentCalDate.getMonth()+1); renderCalendar(); };
}

function startUIUpdate() {
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('active-screen').style.display = 'block';
    uiInterval = setInterval(updateUI, 30);
}

async function fireNotification(title, body) {
    console.log(`[Notification Triggered] ${title}: ${body}`);
    
    // 1. Yol: OneSignal üzerinden (Sunucu taraflı tetikleme için tag gönderir)
    if (window.OneSignal) {
        OneSignal.push(function() {
            OneSignal.User.addTag("last_notif_title", title);
            OneSignal.User.addTag("last_notif_time", String(Date.now()));
        });
    }

    // 2. Yol: iOS PWA Yerel Bildirim (En garantici yol)
    if (!("Notification" in window)) return;
    
    if (Notification.permission === "granted") {
        try {
            const reg = await navigator.serviceWorker.ready;
            if (reg && reg.showNotification) {
                await reg.showNotification(title, {
                    body: body,
                    icon: "./session_tracker.png",
                    badge: "./session_tracker.png",
                    vibrate: [200, 100, 200],
                    tag: 'session-alert', // Üst üste binmeyi engeller
                    renotify: true
                });
            } else {
                new Notification(title, { body: body, icon: "./session_tracker.png" });
            }
        } catch (err) {
            console.error("Local Notif Error:", err);
            new Notification(title, { body: body, icon: "./session_tracker.png" });
        }
    } else if (Notification.permission !== "denied") {
        // İzin yoksa tekrar iste (Kritik: iOS bazen ilk izni unutur)
        Notification.requestPermission();
    }
}

function updateUI() {
    const now = Date.now();
    const phaseElapsed = now - tracker.phaseStartTime;
    let currentWork = tracker.totalWorkMs + (tracker.state === 'working' ? phaseElapsed : 0);
    let currentRest = tracker.totalRestMs + (tracker.state === 'resting' ? phaseElapsed : 0);

    // IPHONE PRECISION UI
    const timerEl = document.getElementById('lbl-current-timer');
    const formatted = formatTimeParts(phaseElapsed);
    timerEl.innerHTML = `${formatted.h}:${formatted.m}:${formatted.s}<span>.${formatted.cs}</span>`;

    document.getElementById('lbl-target-time').innerText = formatTimeParts(tracker.targetMs).full;
    document.getElementById('lbl-current-state').innerText = tracker.state === 'working' ? 'Çalışıyor' : 'Mola Veriliyor';
    document.documentElement.style.setProperty('--dynamic-color', tracker.state === 'resting' ? '#34C759' : '#FF9500');

    const progress = Math.min((currentWork / tracker.targetMs) * 100, 100);
    const pill = document.getElementById('lbl-percentage');
    pill.innerText = `%${Math.round(progress)}`;
    pill.className = `progress-pill ${progress < 30 ? 'progress-low' : progress < 70 ? 'progress-mid' : 'progress-high'}`;

    const total = (currentWork + currentRest) || 1;
    document.getElementById('segment-summary').innerHTML = `İş: ${formatTimeParts(currentWork).full} (%${Math.round(currentWork/total*100)}) | Mola: ${formatTimeParts(currentRest).full} (%${Math.round(currentRest/total*100)})`;

    const allSegs = [...tracker.segments, {type: tracker.state, duration: phaseElapsed}];
    document.getElementById('segment-list').innerHTML = allSegs.reverse().map(seg => `
        <div style="display:flex; justify-content:space-between; padding:10px; background:#2C2C2E; border-radius:10px; border-left:4px solid ${seg.type==='working'?'#FF9500':'#34C759'}">
            <span>${seg.type==='working'?'Oturum':'Mola'}</span>
            <span>${formatTimeParts(seg.duration).full}</span>
        </div>`).join('');

    if (progress >= 100 && !tracker.notifiedTarget && tracker.targetMs > 0) {
        tracker.notifiedTarget = true; tracker.save();
        fireNotification("Hedefe Ulaşıldı! 🎉", "Tebrikler, bugünkü hedefini tamamladın!");
    }
}

function formatTimeParts(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(totalSeconds % 60).padStart(2, '0');
    const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');
    return { h, m, s, cs, full: `${h}:${m}:${s}` };
}

function saveToHistory() {
    const liveElapsed = Date.now() - tracker.phaseStartTime;
    let finalWork = tracker.totalWorkMs + (tracker.state === 'working' ? liveElapsed : 0);
    let finalRest = tracker.totalRestMs + (tracker.state === 'resting' ? liveElapsed : 0);
    if (finalWork < 1000) return;

    Analytics.saveSession(Analytics.getTodayKey(), {
        id: Date.now(), workMs: finalWork, restMs: finalRest,
        start: tracker.sessionClockStart,
        end: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    });
}

function renderChart(mode) {
    const chart = document.getElementById('analytics-chart'), picker = document.getElementById('analytics-date-picker');
    const selectedDate = picker.value || Analytics.getTodayKey(), allData = Analytics.getAllData();
    const sessionBox = document.getElementById('analytics-session-box'), sessionList = document.getElementById('analytics-session-list');
    
    if (mode === 'daily') {
        sessionBox.style.display = 'block';
        const daySessions = allData[selectedDate] || [];
        const totals = daySessions.reduce((acc, s) => { acc.work += s.workMs; acc.rest += s.restMs; return acc; }, { work: 0, rest: 0 });
        const total = (totals.work + totals.rest) || 1, workPerc = (totals.work / total) * 100;
        
        if (daySessions.length === 0) { chart.innerHTML = `<p style="color:var(--text-secondary)">Veri yok.</p>`; sessionList.innerHTML = ''; return; }
        
        chart.innerHTML = `<div style="width:140px; height:140px; border-radius:50%; background: conic-gradient(var(--dynamic-color) 0% ${workPerc}%, #34C759 ${workPerc}% 100%); display:flex; align-items:center; justify-content:center;">
            <div style="width:120px; height:120px; background:#1C1C1E; border-radius:50%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <span style="font-size:26px; font-weight:700;">%${Math.round(workPerc)}</span>
            </div></div>`;
        sessionList.innerHTML = daySessions.map(s => createSessionHtml(s)).join('');
    } else {
        const weekData = Analytics.getWeeklyData(new Date(selectedDate));
        const max = Math.max(...weekData.map(d => d.work + d.rest), 1);
        chart.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:flex-end; width:100%; height:160px; gap:8px;">${weekData.map(d => {
            const total = d.work + d.rest, isZero = total === 0;
            const h = isZero ? 0 : Math.max((total / max) * 100, 15);
            return `<div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:8px;">
                <div class="stacked-bar-container" style="height:150px;">
                    ${!isZero ? `<div style="background:var(--dynamic-color); height:${(d.work/total)*100}%; display:flex; align-items:center; justify-content:center; font-size:9px; color:#000; font-weight:700;">${Math.round(d.work/total*100)}%</div>
                    <div style="background:#34C759; height:${(d.rest/total)*100}%; display:flex; align-items:center; justify-content:center; font-size:9px; color:#000; font-weight:700;">${Math.round(d.rest/total*100)}%</div>` : ''}
                </div><span style="font-size:10px;">${d.day}</span></div>`;
        }).join('')}</div>`;
        sessionBox.style.display = 'none';
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid'); grid.innerHTML = '';
    const data = Analytics.getAllData(), year = currentCalDate.getFullYear(), month = currentCalDate.getMonth();
    document.getElementById('cal-month-year').innerText = currentCalDate.toLocaleDateString('tr', {month:'long', year:'numeric'});
    ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'].forEach(d => grid.innerHTML += `<div style="font-size:11px; color:var(--text-secondary); text-align:center;">${d}</div>`);
    const startOffset = (new Date(year, month, 1).getDay() + 6) % 7, days = new Date(year, month + 1, 0).getDate();
    for(let i=0; i<startOffset; i++) grid.innerHTML += `<div></div>`;
    for(let i=1; i<=days; i++) {
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        const hasData = data[dateKey] && data[dateKey].length > 0;
        grid.innerHTML += `<div class="cal-day ${dateKey===Analytics.getTodayKey()?'today':''} ${dateKey===selectedProfileDate?'active':''}" onclick="selectDate('${dateKey}')">
            ${i}${hasData?'<div class="cal-dot"></div>':''}</div>`;
    }
    renderProfileHistory();
}

function selectDate(key) { selectedProfileDate = key; renderCalendar(); }

function renderProfileHistory() {
    const sessions = Analytics.getAllData()[selectedProfileDate] || [];
    document.getElementById('profile-history-list').innerHTML = sessions.length ? sessions.map(s => createSessionHtml(s, true)).join('') : '<p style="text-align:center; padding:20px; color:var(--text-secondary)">Kayıt yok.</p>';
}

function createSessionHtml(s, del = false) {
    const total = s.workMs + s.restMs, eff = Math.round((s.workMs/total)*100);
    return `<div style="background:#2C2C2E; padding:15px; border-radius:15px; display:flex; justify-content:space-between; align-items:center;">
        <div><div style="font-size:13px; color:var(--text-secondary)">Oturum: ${s.start} - ${s.end}</div>
        <div style="font-weight:600; margin-top:4px;">İş: ${formatTimeParts(s.workMs).full} | Mola: ${formatTimeParts(s.restMs).full}</div></div>
        <div style="display:flex; align-items:center; gap:8px;"><span style="background:${eff<70?'#FFCC00':'#FF9500'}; color:#000; padding:4px 8px; border-radius:8px; font-size:11px; font-weight:700;">%${eff}</span>
        ${del ? `<button onclick="deleteSession('${s.id}')" style="background:rgba(255,59,48,0.2); border:none; padding:8px; border-radius:50%; color:#FF3B30">X</button>` : ''}</div></div>`;
}

function deleteSession(id) { if(confirm("Silinsin mi?")) { Analytics.deleteSession(selectedProfileDate, parseInt(id)); renderCalendar(); } }
function populatePickers() {
    const fill = (id, max) => { const el = document.getElementById(id); if (el.children.length > 0) return; for(let i=0; i<=max; i++) el.innerHTML += `<div class="picker-item">${String(i).padStart(2,'0')}</div>`; };
    fill('picker-hours', 23); fill('picker-minutes', 59); fill('picker-seconds', 59);
}
function getPickerValue(id) { return Math.round(document.getElementById(id).scrollTop / 50); }