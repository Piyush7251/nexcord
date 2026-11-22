# 🎮 Nexcord — Discord-Style Cross-Platform Gaming & Live Streaming Hub

[![Nexconn Build Challenge 2026](https://img.shields.io/badge/Nexconn%20Challenge-Gaming%20%26%20Live%20Streams-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://github.com/Piyush7251/nexcord)
[![Live Web Demo](https://img.shields.io/badge/Live%20Demo-Render-57F287?style=for-the-badge&logo=render&logoColor=white)](https://nexcord-a85i.onrender.com)
[![Android APK Download](https://img.shields.io/badge/Download-Android%20APK%20v1.0.0-FEE75C?style=for-the-badge&logo=android&logoColor=black)](https://github.com/Piyush7251/nexcord/releases/download/v1.0.0/Nexcord-Flutter.apk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

> Built by **Team Techie Devs** for the **Nexconn Build Challenge 2026 (Gaming & Live Streams Track)**.  
> Powered by the **Nexconn Chat SDK**, **Nexconn Chat UI SDK**, and **Nexconn Call SDK**.

---

## ⚡ Quick Links & Live Deployments

| Resource | Link | Description |
| :--- | :--- | :--- |
| 🌐 **Live Web Application** | **[nexcord-a85i.onrender.com](https://nexcord-a85i.onrender.com)** | Deployed cloud instance with instant 1-click guest entry & SMS login |
| 📊 **Public Telemetry Dashboard** | **[nexcord-a85i.onrender.com/stats](https://nexcord-a85i.onrender.com/stats)** | Real-time active squad members, server channels, & Nexconn SDK health |
| 🤖 **Android Mobile App (APK)** | **[Download Nexcord-Flutter.apk](https://github.com/Piyush7251/nexcord/releases/download/v1.0.0/Nexcord-Flutter.apk)** | Official Android APK (v1.0.0) hosted on GitHub Release CDN |
| 📄 **Official Challenge Write-up** | **[Nexcord_Nexconn_Challenge_Writeup.pdf](Nexcord_Nexconn_Challenge_Writeup.pdf)** | Official 3-page submission PDF covering architecture, SDK proof & track features |
| 📦 **GitHub Release v1.0.0** | **[Release Page](https://github.com/Piyush7251/nexcord/releases/tag/v1.0.0)** | Release tag and compiled assets |
| 🔑 **Nexconn App Key** | `n19jmcy5nw3q9` | Active App Key (Singapore Light Cluster, Area Code: `2`) |

---

## 📖 Overview: Why Nexcord?

Competitive gaming is fragmented. Squads coordinate matches across disjointed third-party voice apps, recruit teammates on external forums, manage callouts on static pinboards, and watch esports broadcasts on passive livestreaming platforms. Switching between full-screen games, chat applications, and video tabs introduces significant alt-tab friction, misaligned callouts, and communication latency.

**Nexcord** bridges this divide into a single, cohesive, gamer-first communication hub. With deep native integration of the **Nexconn Real-Time Engine**, Nexcord unites:
1. **Discord-Style Community Guilds & DMs** across Web, Android, and iOS.
2. **Tactical 4-Player Squad Lobbies** with real-time "Ready Up" statuses and interactive mini-map radar pings.
3. **In-Match Quick Chat Radial Wheels** with sub-200ms keyboard shortcuts (`Alt+1..5`).
4. **60 FPS Esports Live Broadcast Arena** with floating **Danmaku (bullet chat)** and real-time hype reactions.
5. **1-Click Squad Voice Huddles & 1:1 Video Calls** built right into channels.

---

## 🎯 Nexconn SDK Integration Matrix

Judges first check for real Chat SDK and Call SDK usage. Nexcord integrates the complete suite of Nexconn SDKs:

| Nexconn Component | APIs & Classes Utilized | Usage in Nexcord |
| :--- | :--- | :--- |
| **Core Engine Lifecycle** | `NCEngine.initialize`<br/>`EngineProvider.connect`<br/>`addConnectionStatusHandler` | Initializes with App Key `n19jmcy5nw3q9`, validates HMAC/SHA-1 token signatures issued by backend, handles auto-reconnection and connection telemetry. |
| **Community Subchannels** | `CommunitySubChannel`<br/>`ChannelHandler`<br/>`createSubChannel` | Powers server channels (`#general`, `#tactics`, `#squad-chat-room`, `#valorant-lfg`) with real-time message streams, message pagination history, and unread badges. |
| **Open Broadcast Channels** | `OpenChannel.enterChannel`<br/>`OpenChannel.exitChannel` | Powers the `#valorant-finals-live` stadium, supporting high-throughput spectator chatter, bullet chat, and live emoji bursts. |
| **Direct Messaging (DMs)** | `DirectChannel`<br/>`getDirectChannels` | Private 1:1 direct conversations between squadmates, online presence indicators, and private squad invites. |
| **Rich Messaging & Typing** | `MessageHandler`<br/>`SendTextMessageParams`<br/>`SendReferenceMessageParams` | Real-time message listeners (receive, edit, delete), quoted replies, typing indicator broadcasts, and media attachments. |
| **Ready-Made Chat UI** | `ai_nexconn_chatui_plugin`<br/>`ChannelPage` / `ChatPage` | Pre-built Discord-style mobile chat screens in Flutter with out-of-the-box message bubble rendering, avatars, and gesture handlers. |
| **Call SDK Engine** | `NCCallEngine.install`<br/>`startCall` / `acceptCall`<br/>`joinCall` / `setLocalVideoView` | 1-Click Squad Voice Huddles and 1:1 video calls with microphone/camera hardware control, active speaker detection, and remote video canvas rendering. |

---

## 🚀 Key Innovations for the Gaming & Live Streams Track

### 1. 🗺️ Tactical Mini-Map Radar Ping (`#squad-chat-room`)
- Inside the squad channel, players can view the tactical map.
- Clicking any map zone immediately drops a visual radar ping beacon (e.g., *"Site A - Bomb Plant"*, *"Mid - Enemy Flank"*).
- Synchronizes across all squad members instantly with visual radar ripples and audio cues.

### 2. ⚡ In-Match Quick-Chat Radial Wheel (`Alt+1..5`)
- In high-pressure clutch situations where typing is impossible, gamers can open a 4-category radial quick-chat wheel (*Tactical*, *Squad Comms*, *Hype*, *Status*).
- Supports instant broadcast in under 200ms using mouse gestures or `Alt+1` through `Alt+5` desktop hotkeys.

### 3. 📺 60 FPS Esports Live Stream & Floating Danmaku (`#valorant-finals-live`)
- Integrates an interactive 60 FPS esports broadcast canvas (supporting simulated feeds, WebRTC screenshare/camera, and video streams).
- Real-time **Danmaku / Bullet Chat** displays spectator messages flying across the screen horizontally.
- Floating **Hype Emoji Bursts** (🎉, 🔥, 🏆) generate celebratory visual particle effects for exciting clutch moments.

### 4. 🎙️ 1-Click Squad Voice Huddles
- Team members can jump into low-latency squad voice channels directly from the squad lobby.
- Features active speaker halos, instant mute/deafen controls, and video calling toggles.

### 5. 📱 Seamless Cross-Platform Parity
- Full feature parity between the **React Web client** and the native **Flutter Android & iOS client**.
- Direct APK download button embedded on the web login screen for instant mobile onboarding.

---

## 📂 Project Architecture

```
nexcord/
├── server/                     # Node.js + Express Real-Time Backend
│   ├── src/
│   │   ├── index.js            # Express server, SSE sync, /stats telemetry & /api/download/apk
│   │   ├── nexconn.js          # Nexconn Chat API v4 HMAC/SHA-1 token signing service
│   │   ├── config.js           # Server environment & configuration manager
│   │   └── data/               # Persistent JSON database (users, channels, messages)
│   └── .env                    # Active Nexconn App Key & backend secrets
│
├── flutter_app/                # Native Flutter Mobile Client (Android & iOS)
│   ├── lib/
│   │   ├── main.dart           # Discord UI, squad rooms, quick chat, live stream & responsive auth
│   │   ├── services/           # ai_nexconn_chat_plugin & WebRTC service integration
│   │   ├── screens/            # ai_nexconn_chatui_plugin ChannelPage & ChatPage
│   │   └── widgets/            # Tactical radar map, danmaku overlay, voice huddle & media picker
│   └── android/                # Android native project configuration & Google Services
│
├── web/                        # React 18 + TypeScript + Vite Client
│   ├── src/
│   │   ├── App.tsx             # Main client shell & channel routing
│   │   ├── components/         # Discord sidebar, chat arena, modals & AdminPanel
│   │   └── services/           # @nexconn/chat & @nexconn/call integration
│   └── dist/                   # Production-optimized web bundle
│
├── Nexcord-Flutter.apk         # Pre-compiled Android Debug/Release APK
├── Nexcord_Nexconn_Challenge_Writeup.pdf  # Official 3-Page Challenge Submission PDF
└── render.yaml                 # 1-Click Render Cloud Deployment specification
```

---

## 🛠️ Running Locally

### 1. Start the Backend Server
```bash
cd server
npm install
npm run dev
```
The server will start at `http://localhost:3001`.

### 2. Start the Web Application
```bash
cd web
npm install --legacy-peer-deps
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. Run the Flutter Mobile App (Android / iOS)
> Requires Flutter SDK `>=3.29.2` (Dart `^3.7.2`) and Android Studio.
```bash
cd flutter_app
flutter pub get
flutter run
```
*Note: The Android emulator connects automatically to `http://10.0.2.2:3001`; physical devices can enter your LAN server IP on the login screen.*

---

## 🌐 1-Click Cloud Deployment (Render.com)

Nexcord is configured for continuous automated deployment on Render using the included `render.yaml`:

1. Fork or push this repository to GitHub.
2. Sign in to [Render.com](https://render.com) and click **New +** $\rightarrow$ **Web Service**.
3. Select the `Piyush7251/nexcord` repository.
4. Set Build Command: `npm run build` and Start Command: `npm start`.
5. Add Environment Variables:
   - `NEXCONN_APP_KEY` = `n19jmcy5nw3q9`
   - `NEXCONN_APP_SECRET` = *(Your Nexconn secret)*
   - `NEXCONN_API_HOST` = `api.sg-light-api.com`
   - `NEXCONN_AREA_CODE` = `2`
6. Click **Deploy Web Service** — Render automatically builds both the web client and backend!

---

## 👥 Team & Submission Info

- **Project Name:** Nexcord (Gaming, Squad Chat & Live Streams)
- **Team Name:** Techie Devs
- **Challenge:** Nexconn Build Challenge 2026
- **Track:** Gaming & Live Streams Track
- **License:** MIT License
