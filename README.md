# Nexcord — Discord-Style Cross-Platform App (Web, Android, iOS & Flutter)

Built for the **Nexconn Build Challenge 2026 (Gaming & Live Streams Track)** using **Nexconn Chat SDK**, **Nexconn Chat UI SDK**, and **Nexconn Call SDK**.

## Project Structure

- **`server/`** — Node.js + Express backend handling authentication, Nexconn Platform Chat API v4 signing (`App-Key` + SHA-1 `Signature` token issuance, community channels, subchannels, open channels), real-time SSE sync, voice channel state, and Hybrid Demo Mode.
- **`flutter_app/`** — Native **Flutter** mobile app targeting **Android** & **iOS** using the official **`ai_nexconn_chat_plugin`** and **`ai_nexconn_chatui_plugin`** (`ChannelPage`, `ChatPage`, `EngineProvider`, `NCEngine`, `DirectChannel`, `CommunitySubChannel`, `OpenChannel`), paired with Discord-style UI, Squad Chat Room + Tactical Mini-Map Ping, In-Match Quick Chat, Live Stream Spectator Overlay + Danmaku, Voice Huddles, and Friends/DMs.
- **`web/`** — React + TypeScript + Vite web application (also packaged as native **Android** `web/android/` and **iOS** `web/ios/` via **Capacitor 8**) using **`@nexconn/chat`**, **`@nexconn/engine`**, and **`@nexconn/call`**.

## Features Implemented

### Nexconn SDK Integration
- **Flutter (`flutter_app/lib/services/nexconn_sdk_service.dart` & `flutter_app/lib/screens/nexconn_chatui_screen.dart`)**:
  - `NCEngine.initialize`, `EngineProvider.initialize`, `EngineProvider.connect`, `NCEngine.addConnectionStatusHandler`, `NCEngine.addMessageHandler`, `DirectChannel`, `CommunitySubChannel`, `OpenChannel.enterChannel`, plus `ChannelPage` & `ChatPage` from `ai_nexconn_chatui_plugin`.
- **Web & Capacitor (`web/src/services/nexconn.ts`)**:
  - `@nexconn/chat`: `NCEngine`, `CommunitySubChannel`, `DirectChannel`, `OpenChannel`, `SendTextMessageParams`, `SendReferenceMessageParams`, `Helper.createSendImageMessageParams` / `createSendFileMessageParams`, `MessageHandler`, `ChannelHandler`, `ConnectionStatusHandler`.
  - `@nexconn/call`: `NCCallEngine.install`, `NCCallEngine.initialize`, `startCall` (`SINGLE` & `MULTI`), `acceptCall`, `joinCall`, `inviteToCall`, `endCall`, `setLocalVideoView`, `setRemoteVideoView`, `enableMicrophone`, `enableCamera`.

### Gaming & Live Streams Track
1. **Squad Chat Room (`#squad-chat-room`)**: 4-slot squad lobby banner, game & map selector, Ready Up toggle, 1-click Squad Voice Huddle, and an interactive **Tactical Mini-Map Ping** radar.
2. **In-Match Quick Chat**: Fast tactical callout bar & 4-category wheel (*Tactical*, *Squad Comms*, *Hype*, *Status*), map zone tags, and `Alt+1`–`Alt+5` desktop hotkeys.
3. **Spectator Chat Overlay (`#valorant-finals-live`)**: Interactive 60fps tactical esports broadcast canvas (plus WebRTC screen/camera & YouTube/Twitch/MP4 embeds on Web), layered with a translucent **Spectator HUD Chat Overlay**, flying **Danmaku / Bullet Chat**, floating **Hype emoji bursts**, and `OpenChannel` spectator chat.

---

## Running Locally

### 1. Start the Backend Server
```bash
cd server
npm install
npm run dev
```
The server starts on `http://localhost:3001`.
You can optionally set `NEXCONN_APP_KEY` and `NEXCONN_APP_SECRET` in `server/.env` (see `server/.env.example`), or enter them at any time inside the in-app **Nexconn SDK** tab/console.

### 2. Run the Website
```bash
cd web
npm install
npm run dev
```
Open `http://localhost:5173` and click **Enter Arena** under **Instant Squad Entry**.

### 3. Run the Flutter Android / iOS App (`flutter_app/`)
> Requires Flutter SDK `>=3.29.2` (Dart `^3.7.2`), Android Studio / Xcode.
```bash
cd flutter_app
flutter pub get
flutter run
```
If Android/iOS platform build files need regeneration from your local Flutter toolchain:
```bash
flutter create --platforms=android,ios .
```
*(Android emulator connects automatically to `http://10.0.2.2:3001`; physical devices can set your LAN IP `http://<YOUR_PC_IP>:3001` on the login screen.)*

### 4. Alternative Ready-to-Build Capacitor Android / iOS Projects (`web/android`, `web/ios`)
```bash
cd web
npm run build
npx cap sync
npx cap open android   # or: npx cap open ios
```

---

## 🌐 Live Free Cloud Hosting (Render / Railway)

You can host Nexcord completely free online directly from your GitHub repository so your friends anywhere in the world can open it on their phones and laptops:

### 1-Click Free Hosting on Render.com:
1. Go to [Render.com](https://render.com) and sign in with your GitHub account.
2. Click **New +** $\rightarrow$ **Web Service**.
3. Select your repository: **`Piyush7251/nexcord`**.
4. Configure:
   * **Runtime:** `Node`
   * **Build Command:** `npm run build`
   * **Start Command:** `npm start`
   * **Plan:** `Free`
5. In **Environment Variables**, add:
   * `NEXCONN_APP_KEY` = `n19jmcy5nw3q9`
   * `NEXCONN_APP_SECRET` = `eVEaFOyCuiwv7`
   * `NEXCONN_API_HOST` = `api.sg-light-api.com`
   * `NEXCONN_API_HOST_BACKUP` = `api-b.sg-light-api.com`
   * `NEXCONN_AREA_CODE` = `2`
   * `FAST2SMS_API_KEY` = `your_fast2sms_key` *(optional)*
   * `SMS_CLOUD_WEBHOOK_URL` = `https://api.sms-gate.app/3rdparty/v1/message` *(optional)*
   * `SMS_CLOUD_WEBHOOK_AUTH` = `Basic VTBXSlctOnBldGZqZDhkbzdlYnJr` *(optional)*
6. Click **Deploy Web Service**! Render will build and give you a free permanent HTTPS link (e.g. `https://nexcord.onrender.com`) that you can send to your friends.
