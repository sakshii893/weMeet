const express = require("express")
const http = require("http")
const { Server } = require('socket.io');
const axios = require('axios');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
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
        "https://devmeet-wine.vercel.app",  // New production frontend
        "https://we-meet-chi.vercel.app",  // Old production frontend
        "http://localhost:5173",
        "http://localhost:5174",
        `http://${process.env.LOCAL_IP || '192.168.10.187'}:5173`,  // Mobile access
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
    name: 'sessionId',  // Custom cookie name
    cookie: {
        secure: false,  // Allow HTTP for local testing
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',  // Allow cross-origin on same network
        path: '/'
    }
}));

const io = new Server(httpServer, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || "http://localhost:5173",
            "https://devmeet-wine.vercel.app",  // New production frontend
            "https://we-meet-chi.vercel.app",  // Old production frontend
            "http://localhost:5173",
            "http://localhost:5174",
            `http://${process.env.LOCAL_IP || '192.168.10.187'}:5173`,  // Mobile access
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
const activePairs = new Map(); // socketId -> connected peer socketId

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

// Simple Registration
app.post("/auth/register", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Registration attempt:', username);

        // Validation
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Check if user exists
        const existingUser = await User.findOne({ username });

        if (existingUser) {
            console.log('Username already taken:', username);
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            username,
            password: hashedPassword,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
            interests: [],
            profileCompleted: false
        });

        await user.save();
        
        console.log('User registered:', username);

        // Set session
        req.session.user = {
            id: user._id,
            username: user.username,
            avatar: user.avatar
        };
        
        // Save session explicitly
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session error' });
            }
            
            console.log('Session saved for:', username, 'Session ID:', req.sessionID);
            
            res.json({
                success: true,
                user: {
                    id: user._id,
                    username: user.username,
                    avatar: user.avatar,
                    interests: user.interests,
                    profileCompleted: user.profileCompleted
                }
            });
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Simple Login
app.post("/auth/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Login attempt:', username);

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        // Find user
        const user = await User.findOne({ username });

        if (!user || !user.password) {
            console.log('User not found:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            console.log('Invalid password for:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Set session
        req.session.user = {
            id: user._id,
            username: user.username,
            avatar: user.avatar
        };

        // Save session explicitly
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: 'Session error' });
            }
            
            console.log('Session saved for:', username, 'Session ID:', req.sessionID);
            
            res.json({
                success: true,
                user: {
                    id: user._id,
                    username: user.username,
                    avatar: user.avatar,
                    interests: user.interests,
                    profileCompleted: user.profileCompleted
                }
            });
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get("/api/user", async (req, res) => {
    console.log('Auth check - Session ID:', req.sessionID, 'User:', req.session.user?.username);
    
    if (req.session.user) {
        try {
            const user = await User.findById(req.session.user.id);
            
            if (user) {
                console.log('User found:', user.username);
                res.json({
                    authenticated: true,
                    user: {
                        id: user._id,
                        username: user.username,
                        avatar: user.avatar,
                        interests: user.interests,
                        profileCompleted: user.profileCompleted
                    }
                });
            } else {
                console.log('User not found in DB');
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
        console.log('No session user');
        res.json({
            authenticated: false,
            user: null
        });
    }
});

// GitHub OAuth (commented out for now)
/*
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
*/

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
    try {
        const { interests, userId } = req.body;
        
        console.log('Updating interests for user:', userId);

        // Find user by ID from request body (not session)
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.interests = interests;
        user.profileCompleted = true;
        await user.save();
        
        console.log('Interests updated for:', user.username);

        res.json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                avatar: user.avatar,
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
            userId: userData.id,
            username: userData.username,
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

        // Check if user is online
        if (!onlineUsers.has(socket.id)) {
            console.log("User not found in online users:", socket.id);
            socket.emit("error", { message: "Please refresh and try again" });
            return;
        }

        // Add to waiting queue
        waitingQueue.add(socket.id);

        // Try to find a match
        const matchSocketId = findBestMatch(socket.id);

        if (matchSocketId) {
            // Verify both users still exist
            const user1 = onlineUsers.get(socket.id);
            const user2 = onlineUsers.get(matchSocketId);

            if (!user1 || !user2) {
                console.log("One or both users not found, retrying...");
                waitingQueue.delete(matchSocketId);
                socket.emit("waiting-for-peer");
                return;
            }

            // Remove both from waiting queue
            waitingQueue.delete(socket.id);
            waitingQueue.delete(matchSocketId);

            // Store active pair
            activePairs.set(socket.id, matchSocketId);
            activePairs.set(matchSocketId, socket.id);

            console.log(`Matched: ${user1.username} <-> ${user2.username}`);

            // Decide who is initiator (lower socket ID initiates)
            const isUser1Initiator = socket.id < matchSocketId;

            // Send match notification to both users
            socket.emit("peer-matched", {
                peerId: matchSocketId,
                peerData: {
                    username: user2.username,
                    avatar: user2.avatar,
                    interests: user2.interests
                },
                isInitiator: isUser1Initiator
            });

            io.to(matchSocketId).emit("peer-matched", {
                peerId: socket.id,
                peerData: {
                    username: user1.username,
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

    // User ends call or skips to next
    socket.on("end-call", () => {
        const peerId = activePairs.get(socket.id);
        
        if (peerId) {
            // Notify peer that call ended
            io.to(peerId).emit("peer-disconnected");
            
            // Remove pair
            activePairs.delete(socket.id);
            activePairs.delete(peerId);
            
            console.log("Call ended between", socket.id, "and", peerId);
        }
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
        
        // Notify peer if in active call
        const peerId = activePairs.get(socket.id);
        if (peerId) {
            io.to(peerId).emit("peer-disconnected");
            activePairs.delete(peerId);
            activePairs.delete(socket.id);
            console.log("Notified peer", peerId, "about disconnect");
        }
        
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
