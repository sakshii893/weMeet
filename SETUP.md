# LetsMeet - React + Socket.io Setup

## Project Structure
```
letsMeet/
├── backend/
│   ├── .env              (Environment variables)
│   ├── server.js         (Express + Socket.io server)
│   └── package.json      (Backend dependencies)
│
└── frontend/
    ├── src/
    │   ├── App.jsx       (React component with Socket.io client)
    │   ├── main.jsx
    │   ├── App.css
    │   └── index.css
    └── package.json      (Frontend dependencies)
```

## Installation & Setup

### Backend Setup
```bash
cd backend
npm install
```

**Backend Dependencies:**
- `express` - Web framework
- `socket.io` - WebSocket library for real-time communication
- `dotenv` - Environment variable management
- `nodemon` - Auto-restart server on file changes (dev)

### Frontend Setup
```bash
cd frontend
npm install
```

**Frontend Dependencies:**
- `react` - UI library
- `socket.io-client` - Socket.io client for React
- `vite` - Development server and bundler

## Running the Application

### Terminal 1 - Backend Server
```bash
cd backend
npm run dev
```
Server will start on `http://localhost:9000`

### Terminal 2 - Frontend Development Server
```bash
cd frontend
npm run dev
```
Frontend will start on `http://localhost:5173`

## Features

### Socket.io Communication (Sender/Receiver)

**Backend (`backend/server.js`):**
- Listens for `"sender"` events from clients
- Forwards messages to target client using `"receiver"` event
- Uses Socket.io's `to()` method to send to specific client by ID

**Frontend (`frontend/src/App.jsx`):**
- Connects to Socket.io server on component mount
- Displays own Socket ID
- Can send messages to other clients by entering their Socket ID
- Receives messages from other clients

### How to Use
1. Start both backend and frontend servers
2. Open `http://localhost:5173` in two different browser windows/tabs
3. Copy the Socket ID from one window
4. Paste it in the "enter target id" field in the other window
5. Type a message and click "send message"
6. Message appears in the receiving window

## Environment Configuration

**Backend (.env file):**
```
PORT=9000
```

**Socket.io CORS Settings:**
- Origin: `http://localhost:5173` (frontend URL)
- Methods: GET, POST

## Git Configuration

**Author:** sakshii893 sakshi pawar
**Email:** sakshi@example.com

Configure with:
```bash
git config user.name "sakshii893 sakshi pawar"
git config user.email "sakshi@example.com"
```

## Recent Fixes
- ✅ Fixed typo: `targertID` → `targetID` in backend and frontend
- ✅ Fixed typo: `serTargetId` → `setTargetId` in React state
- ✅ Configured git author to "sakshii893 sakshi pawar"
- ✅ Added proper Socket.io sender/receiver functionality
- ✅ All dependencies installed and verified

## Next Steps (Optional Enhancements)
- Add message history/conversation log
- Add typing indicators
- Add user presence/online status
- Add message timestamps
- Add room/group chat functionality
- Deploy to production server

## Health Check
To verify the backend is running:
```bash
curl http://localhost:9000/health
```

Response:
```json
{
  "status": "ok",
  "code": 200,
  "message": "health OK"
}
```
