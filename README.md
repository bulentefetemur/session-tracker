# Session Tracker PWA

iOS standartlarına ve SwiftUI estetiğine uygun, minimalist bir çalışma ve mola takip uygulaması. Web Push API, Service Worker ve AudioContext (Always-On Oscillator) kullanarak iOS'un zorlu arka plan kısıtlamalarını aşan, %100 Client-Side bir Progressive Web App (PWA) projesidir.

## 🚀 Tech Stack

- **Frontend:** HTML5, CSS3 (Glassmorphism & SwiftUI Aesthetics), Vanilla JavaScript (ES6+)
- **PWA Technologies:** Service Worker, Web Manifest
- **Browser APIs:** Web Push API, Web Audio API, Wake Lock API, LocalStorage

## ✨ Key Features

- 📱 **Native iOS Deneyimi:** Tam ekran Standalone PWA, çentik uyumlu tasarım (`viewport-fit=cover`), yüksek performanslı iOS tarzı Wheel Picker.
- 🔔 **Akıllı Bildirimler (Smart Intervals):** 60 dakika kesintisiz çalışma, 15 ve 60 dakikalık uzun mola sınırlarında Service Worker üzerinden tetiklenen otomatik hatırlatıcılar.
- 🔊 **Always-On Audio Hack:** Cihaz sessiz modda veya kilitli ekrandayken dahi bildirim seslerini duyurabilmek için özel olarak kurgulanmış arka plan Oscillator motoru.
- 🔋 **Wake Lock API:** Aktif oturumlar sırasında ekranın otomatik olarak uyku moduna geçmesini (Deep Sleep) engeller.
- 📶 **Offline First:** Network-First önbellek stratejisi ile internet bağlantısı olmadan tam kapasite çalışır.

## ⚙️ Installation & Local Development

Projeyi yerel ortamınızda çalıştırmak ve iOS cihazınızda test etmek için:

1. Repoyu klonlayın:

   ```bash
   git clone https://github.com/yourusername/session-tracker.git
   cd session-tracker
   ```

2. Tercih ettiğiniz bir statik sunucu üzerinden projeyi ayağa kaldırın (Örn: VS Code Live Server veya Node.js `serve`):

   ```bash
   npx serve .
   ```

3. iOS Cihaz Kurulumu:
   - iPhone'unuzdan Safari'yi açarak sunucu adresine (Yerel IP veya Localtunnel) gidin.
   - Alt menüdeki **Paylaş** ikonuna dokunun.
   - **"Ana Ekrana Ekle" (Add to Home Screen)** seçeneğini seçin.
   - Ana ekrana düşen ikon üzerinden uygulamayı başlatın.

## 📄 License

This project is licensed under the MIT License.
