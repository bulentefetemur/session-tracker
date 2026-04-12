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
        this.notifiedRest60 = false;
    }

    startSession(targetHours, targetMinutes, targetSeconds) {
        this.targetMs = (targetHours * 3600000) + (targetMinutes * 60000) + (targetSeconds * 1000);
        this.state = 'working';
        this.phaseStartTime = Date.now();
        this.targetReached = false;
        this.notifiedWork60 = false;
        this.notifiedRest15 = false;
        this.notifiedRest60 = false;
        this.save();
    }

    save() {
        const data = {
            state: this.state,
            targetMs: this.targetMs,
            totalWorkMs: this.totalWorkMs,
            totalRestMs: this.totalRestMs,
            phaseStartTime: this.phaseStartTime,
            targetReached: this.targetReached
        };
        localStorage.setItem('sessionData', JSON.stringify(data));
    }

    load() {
        const data = localStorage.getItem('sessionData');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                this.state = parsed.state;
                this.targetMs = parsed.targetMs;
                this.totalWorkMs = parsed.totalWorkMs;
                this.totalRestMs = parsed.totalRestMs;
                this.phaseStartTime = parsed.phaseStartTime;
                this.targetReached = parsed.targetReached;
                return true;
            } catch (e) {
                console.error("Data parse error", e);
                return false;
            }
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
        this.notifiedRest60 = false;
        localStorage.removeItem('sessionData');
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
        this.notifiedRest60 = false;
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
        let triggerRest60 = false;

        if (this.state === 'working' && currentPhaseElapsed >= 3600000 && !this.notifiedWork60) {
            this.notifiedWork60 = true;
            triggerWork60 = true;
        } else if (this.state === 'resting') {
            if (currentPhaseElapsed >= 3600000 && !this.notifiedRest60) {
                this.notifiedRest60 = true;
                triggerRest60 = true;
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

        let colorHex = '#FF3B30'; // Kırmızı
        if (progressPercentage > 70) {
            colorHex = '#34C759'; // Yeşil
        } else if (progressPercentage > 30) {
            colorHex = '#FFCC00'; // Sarı
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
            triggerRest60: triggerRest60
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

    btnStart.addEventListener('click', () => {
        try {
                // 1. HİBRİT BİLDİRİM İZNİ (Güvenli Zincir - Service Worker Readiness)
                if ('serviceWorker' in navigator && 'Notification' in window) {
                    navigator.serviceWorker.ready.then(() => {
                        Notification.requestPermission().then((permission) => {
                            if (permission === 'granted') {
                                window.OneSignalDeferred = window.OneSignalDeferred || [];
                                window.OneSignalDeferred.push(async (instance) => {
                                    try {
                                        // İzin zaten varsa bile tekrar tetikle (Handshake tazeleme)
                                        await instance.Notifications.requestPermission();
                                        await instance.User.PushSubscription.optIn();
                                        const pushId = instance.User.PushSubscription.id;
                                        
                                        const debugDiv = document.getElementById('debug-status');
                                        if (debugDiv) {
                                            if (pushId) {
                                                debugDiv.innerText = 'Status: Registered! ID: ' + pushId.substring(0, 8) + '...';
                                                debugDiv.style.color = '#4CAF50'; // Yeşil
                                                console.log("OneSignal ID Success:", pushId);
                                            } else {
                                                debugDiv.innerText = 'Status: Ready (No ID yet)';
                                                debugDiv.style.color = '#FFA500'; // Turuncu
                                            }
                                        }
                                    } catch (err) {
                                        console.error("OneSignal Sync Error:", err);
                                    }
                                });
                            }
                        });
                    });
                }

                // --- AUDIO UNLOCK HACK (Sessiz Modu Delme) ---
                let silentAudio = document.getElementById('silent-unlock');
                if (!silentAudio) {
                    silentAudio = document.createElement('audio');
                    silentAudio.id = 'silent-unlock';
                    silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
                    document.body.appendChild(silentAudio);
                }
                silentAudio.play().then(() => {
                    silentAudio.pause();
                    silentAudio.currentTime = 0;
                }).catch(e => console.warn("Sessiz ses çalınamadı:", e));

            const hours = getSelectedValue(hoursColumn);
            const minutes = getSelectedValue(minutesColumn);
            const seconds = getSelectedValue(secondsColumn);

            if (hours === 0 && minutes === 0 && seconds === 0) {
                alert('Lütfen geçerli bir hedef süre belirleyin.');
                return;
            }

            // AudioContext başlatma (iOS kısıtlamasını aşmak için etkileşim anında başlatıyoruz)
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }

            // --- AUDIO UNLOCK HACK (Always On Strategy) ---
            if (!unlockedOsc && audioCtx) {
                unlockedGain = audioCtx.createGain();
                unlockedGain.gain.value = 0; // Başlangıçta tamamen sessiz
                unlockedOsc = audioCtx.createOscillator();
                unlockedOsc.type = 'sine';
                unlockedOsc.connect(unlockedGain);
                unlockedGain.connect(audioCtx.destination);
                unlockedOsc.start();
            }

            tracker.startSession(hours, minutes, seconds);

            lblTargetTime.textContent = `${hours > 0 ? hours + 'sa ' : ''}${minutes}dk ${seconds}sn`;
            switchToActiveScreen();
            requestWakeLock();
            renderInterval = setInterval(updateUI, 100);
        } catch (e) {
            alert("Start Error: " + e.message);
        }
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
            clearInterval(renderInterval);
            releaseWakeLock();
            activeScreen.classList.remove('active');
            activeScreen.classList.add('hidden');
            setupScreen.classList.remove('hidden');
            setupScreen.classList.add('active');
        }
    }

    btnEnd.addEventListener('click', handleSessionReset);

    async function fireNotification(title, body) {
        try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, {
                body: body,
                    icon: "./session_tracker.png",
                    badge: "./session_tracker.png",
                vibrate: [200, 100, 200]
            });
            
            // OneSignal API üzerinden Serverless push gönderim hazırlığı:
            // if (window.OneSignal) {
            //     // API Call proxy'ye yönlendirilecek
            // }
        } catch (e) {
            console.error("Bildirim hatası:", e);
        }
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
            }
            if (stats.triggerWork60) {
                fireNotification("Ara Uyarı ☕", "Yaklaşık 1 saattir çalışıyorsun. Mola vermeye ne dersin?");
            }
            if (stats.triggerRest15) {
                fireNotification("Mola Bitti 💪", "Yeter bu kadar mola. Hadi işinin başına!");
            }
            if (stats.triggerRest60) {
                fireNotification("Uzun Mola 🍱", "Sanırım yemek molası verdin. Ama artık işe dönme zamanı!");
            }

            // Her 1 saniyede bir veriyi localStorage'a yedekle (Çökme / Kapanma Koruması)
            const currentTime = Date.now();
            if (currentTime - tracker.lastSaveTime >= 1000) {
                tracker.save();
                tracker.lastSaveTime = currentTime;
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
