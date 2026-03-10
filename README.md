# Omegle-Style P2P Video Chat

A minimal WebRTC-based peer-to-peer video chat application with real-time messaging.

## Features

- **P2P Video Streaming**: Direct browser-to-browser video connection using WebRTC
- **Real-time Chat**: Text messaging via WebRTC DataChannel (P2P) with Socket.io fallback
- **Simple Signaling**: Socket.io server handles WebRTC signaling (offer/answer/ICE)
- **No Video Storage**: All video streams are peer-to-peer, nothing stored on server

## Architecture

- **Frontend**: React + Vite + Socket.io-client
- **Backend**: Node.js + Express + Socket.io
- **P2P**: WebRTC (RTCPeerConnection + DataChannel)
- **Signaling**: Socket.io (only for connection setup)

## How to Run

### 1. Start Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on `http://localhost:9000`

### 2. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

## How to Use

1. Open two browser tabs (or different browsers)
2. Both tabs will show their unique Socket ID
3. Copy the Socket ID from Tab 1
4. In Tab 2, paste the Socket ID and click "Connect"
5. WebRTC connection will establish automatically
6. Both users can now see each other's video and chat via P2P DataChannel

## WebRTC Flow

```
User A                    Signaling Server              User B
  |                              |                         |
  |------ Socket Connect ------->|<----- Socket Connect ---|
  |                              |                         |
  |------ Create Offer --------->|                         |
  |                              |------ Forward Offer --->|
  |                              |                         |
  |                              |<----- Create Answer ----|
  |<----- Forward Answer --------|                         |
  |                              |                         |
  |<===== ICE Candidates Exchange (via server) ==========>|
  |                              |                         |
  |<============ Direct P2P Connection Established =======>|
  |                              |                         |
  |<============ Video + DataChannel (P2P) ===============>|
```

## Key Components

### Backend (server.js)
- Forwards WebRTC signaling messages (offer, answer, ICE candidates)
- Does NOT handle video/audio data (that's P2P)

### Frontend (App.jsx)
- `createPeerConnection()`: Sets up RTCPeerConnection with STUN server
- `startCall()`: Initiates connection (creates offer)
- `setupDataChannel()`: Handles P2P text messaging
- Socket.io listeners: Handle incoming offer/answer/ICE candidates

## Technologies

- **WebRTC**: Browser API for P2P communication
- **STUN Server**: Google's public STUN for NAT traversal
- **Socket.io**: WebSocket library for signaling
- **React**: UI framework
- **Express**: Backend server

## Notes

- Camera/microphone permission required
- Works best on same network or with STUN server
- For production, add TURN server for better connectivity
- Messages use DataChannel when P2P connected, Socket.io as fallback
