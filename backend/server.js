const express = require("express")
const http = require("http")
const { Server } = require('socket.io');
const axios = require('axios');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const app = express()
const httpServer = http.createServer(app)
const PORT = process.env.PORT || 9000

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || "http://localhost:5173",
        "http://localhost:5174",
        /^http:\/\/192\.168\.\d+\.\d+:5173$/,  // Allow any local network IP
        /^http:\/\/10\.\d+\.\d+\.\d+:5173$/     // Allow 10.x.x.x network
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

const io = new Server(httpServer, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || "http://localhost:5173",
            "http://localhost:5174",
            /^http:\/\/192\.168\.\d+\.\d+:5173$/,
            /^http:\/\/10\.\d+\.\d+\.\d+:5173$/
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// ============ ONLINE USERS TRACKING ============

// In-memory store for fast retrieval
const onlineUsers = new Map(); // socketId -> user data
const waitingQueue = new Set(); // socketIds waiting for match

// Helper function to calculate interest match score
function calculateMatchScore(user1Interests, user2Interests) {
    if (!user1Interests || !user2Interests) return 0;
    const common = user1Interests.filter(i => user2Interests.includes(i));
    return common.length;
}

// Find best match for a user
function findBestMatch(currentSocketId) {
    const currentUser = onlineUsers.get(currentSocketId);
    if (!currentUser) return null;

    let bestMatch = null;
    let bestScore = -1;

    for (const socketId of waitingQueue) {
        if (socketId === currentSocketId) continue;
        
        const candidate = onlineUsers.get(socketId);
        if (!candidate) continue;

        const score = calculateMatchScore(currentUser.interests, candidate.interests);
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = socketId;
        }
    }

    // If no interest match, return random user
    if (!bestMatch && waitingQueue.size > 1) {
        const available = Array.from(waitingQueue).filter(id => id !== currentSocketId);
        if (available.length > 0) {
            bestMatch = available[Math.floor(Math.random() * available.length)];
        }
    }

    return bestMatch;
}

// ============ AUTHENTICATION ROUTES ============

app.get("/health", (req, res) => {
    res.send({
        status: "ok",
        code: 200,
        message: "health OK"
    })
})

app.get("/api/user", async (req, res) => {
    if (req.session.user) {
        try {
            const user = await User.findOne({ githubId: req.session.user.id });
            
            if (user) {
                res.json({
                    authenticated: true,
                    user: {
                        id: user.githubId,
                        username: user.username,
                        name: user.name,
                        avatar: user.avatar,
                        email: user.email,
                        interests: user.interests,
                        profileCompleted: user.profileCompleted
                    }
                });
            } else {
                res.json({
                    authenticated: false,
                    user: null
                });
            }
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(500).json({ error: 'Failed to fetch user data' });
        }
    } else {
        res.json({
            authenticated: false,
            user: null
        });
    }
});

app.get("/auth/github", (req, res) => {
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email`;
    res.redirect(githubAuthUrl);
});

app.get("/auth/github/callback", async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.redirect(`${process.env.FRONTEND_URL}?error=no_code`);
    }

    try {
        const tokenResponse = await axios.post(
            'https://github.com/login/oauth/access_token',
            {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code: code
            },
            {
                headers: {
                    Accept: 'application/json'
                }
            }
        );

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            return res.redirect(`${process.env.FRONTEND_URL}?error=no_token`);
        }

        const userResponse = await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        const userData = userResponse.data;

        let user = await User.findOne({ githubId: userData.id });

        if (!user) {
            user = new User({
                githubId: userData.id,
                username: userData.login,
                name: userData.name || userData.login,
                avatar: userData.avatar_url,
                email: userData.email,
                interests: [],
                profileCompleted: false
            });
            await user.save();
            console.log('New user created:', user.username);
        } else {
            user.lastLogin = new Date();
            await user.save();
            console.log('User logged in:', user.username);
        }

        req.session.user = {
            id: user.githubId,
            username: user.username,
            name: user.name,
            avatar: user.avatar,
            email: user.email
        };

        res.redirect(`${process.env.FRONTEND_URL}?auth=success`);

    } catch (error) {
        console.error('GitHub OAuth Error:', error.message);
        res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
    }
});

app.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

// ============ USER PROFILE ROUTES ============

app.post("/api/user/interests", async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const { interests } = req.body;

        const user = await User.findOne({ githubId: req.session.user.id });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.interests = interests;
        user.profileCompleted = true;
        await user.save();

        res.json({
            success: true,
            user: {
                id: user.githubId,
                username: user.username,
                name: user.name,
                avatar: user.avatar,
                email: user.email,
                interests: user.interests,
                profileCompleted: user.profileCompleted
            }
        });
    } catch (error) {
        console.error('Error updating interests:', error);
        res.status(500).json({ error: 'Failed to update interests' });
    }
});

// Get online users count
app.get("/api/online-users", (req, res) => {
    res.json({
        count: onlineUsers.size,
        waiting: waitingQueue.size
    });
});

// ============ SOCKET.IO EVENTS ============

io.on("connection", (socket) => {
    console.log("New client connected:", socket.id);

    // User joins with their data
    socket.on("user-online", async (userData) => {
        console.log("User online:", userData.username, socket.id);
        
        // Store user in online users map
        onlineUsers.set(socket.id, {
            socketId: socket.id,
            githubId: userData.id,
            username: userData.username,
            name: userData.name,
            avatar: userData.avatar,
            interests: userData.interests || []
        });

        // Broadcast online count to all users
        io.emit("online-count", {
            count: onlineUsers.size,
            waiting: waitingQueue.size
        });
    });

    // User wants to find a random peer
    socket.on("find-peer", () => {
        console.log("Finding peer for:", socket.id);

        // Add to waiting queue
        waitingQueue.add(socket.id);

        // Try to find a match
        const matchSocketId = findBestMatch(socket.id);

        if (matchSocketId) {
            // Remove both from waiting queue
            waitingQueue.delete(socket.id);
            waitingQueue.delete(matchSocketId);

            const user1 = onlineUsers.get(socket.id);
            const user2 = onlineUsers.get(matchSocketId);

            console.log(`Matched: ${user1.username} <-> ${user2.username}`);

            // Decide who is initiator (lower socket ID initiates)
            const isUser1Initiator = socket.id < matchSocketId;

            // Send match notification to both users
            socket.emit("peer-matched", {
                peerId: matchSocketId,
                peerData: {
                    username: user2.username,
                    name: user2.name,
                    avatar: user2.avatar,
                    interests: user2.interests
                },
                isInitiator: isUser1Initiator
            });

            io.to(matchSocketId).emit("peer-matched", {
                peerId: socket.id,
                peerData: {
                    username: user1.username,
                    name: user1.name,
                    avatar: user1.avatar,
                    interests: user1.interests
                },
                isInitiator: !isUser1Initiator
            });

            // Broadcast updated waiting count
            io.emit("online-count", {
                count: onlineUsers.size,
                waiting: waitingQueue.size
            });
        } else {
            // No match found, user is in waiting queue
            socket.emit("waiting-for-peer");
            
            io.emit("online-count", {
                count: onlineUsers.size,
                waiting: waitingQueue.size
            });
        }
    });

    // User cancels search
    socket.on("cancel-search", () => {
        waitingQueue.delete(socket.id);
        
        io.emit("online-count", {
            count: onlineUsers.size,
            waiting: waitingQueue.size
        });
    });

    // Handle text chat messages
    socket.on("sender", (senderData) => {
        const { targetID, message } = senderData;
        
        io.to(targetID).emit("receiver", {
            sender: socket.id,
            message: message
        });
    });

    // WebRTC Signaling: Forward offer to target peer
    socket.on("offer", (data) => {
        console.log("Forwarding offer from", socket.id, "to", data.targetID);
        io.to(data.targetID).emit("offer", {
            offer: data.offer,
            sender: socket.id
        });
    });

    // WebRTC Signaling: Forward answer to target peer
    socket.on("answer", (data) => {
        console.log("Forwarding answer from", socket.id, "to", data.targetID);
        io.to(data.targetID).emit("answer", {
            answer: data.answer,
            sender: socket.id
        });
    });

    // WebRTC Signaling: Forward ICE candidates to target peer
    socket.on("ice-candidate", (data) => {
        console.log("Forwarding ICE candidate from", socket.id, "to", data.targetID);
        io.to(data.targetID).emit("ice-candidate", {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    // User disconnects
    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);
        
        // Remove from online users and waiting queue
        onlineUsers.delete(socket.id);
        waitingQueue.delete(socket.id);

        // Broadcast updated count
        io.emit("online-count", {
            count: onlineUsers.size,
            waiting: waitingQueue.size
        });
    });
});

httpServer.listen(PORT, () => {
    console.log("Server is running on port", PORT);
});
