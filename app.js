// --- FOCUS TRACKER ENGINE v9 ---
class Analytics {
    static getTodayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    static addTime(type, ms) {
        const key = this.getTodayKey();
        let data = JSON.parse(localStorage.getItem('trackerAnalytics') || '{}');
        if (!data[key]) data[key] = { work: 0, rest: 0 };
        data[key][type] += ms;
        localStorage.setItem('trackerAnalytics', JSON.stringify(data));
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
        this.segments = [];
        this.lastSavedTime = Date.now();
        localStorage.removeItem('sessionData');
    }
    save() {
        const data = { state: this.state, targetMs: this.targetMs, totalWorkMs: this.totalWorkMs, totalRestMs: this.totalRestMs, phaseStartTime: this.phaseStartTime, segments: this.segments, lastSavedTime: Date.now() };
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
        this.phaseStartTime = Date.now();
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

document.addEventListener('DOMContentLoaded', () => {
    initAppFlow();
});

function initAppFlow() {
    const savedName = localStorage.getItem('trackerUserName');
    if (savedName) {
        showApp(savedName);
    }

    document.getElementById('btn-login-action').onclick = () => {
        const name = document.getElementById('username-input').value.trim();
        if (!name) return alert("Lütfen bir isim girin.");
        localStorage.setItem('trackerUserName', name);
        document.getElementById('loading-overlay').style.display = 'flex';
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

    Analytics.addTime(tracker.state === 'working' ? 'work' : 'rest', 100);
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
    // Logic to finalize today's data if needed
}

function renderChart(mode) {
    const chart = document.getElementById('analytics-chart');
    chart.innerHTML = `<p style="color:var(--text-secondary)">${mode === 'daily' ? 'Günlük Veriler Hazırlanıyor' : 'Haftalık Veriler Hazırlanıyor'}</p>`;
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    document.getElementById('cal-month-year').innerText = currentCalDate.toLocaleDateString('tr', {month:'long', year:'numeric'});
    
    const days = new Date(year, month + 1, 0).getDate();
    for(let i=1; i<=days; i++) {
        grid.innerHTML += `<div class="cal-day">${i}</div>`;
    }
}