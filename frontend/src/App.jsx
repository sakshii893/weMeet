import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";
import Login from "./Login";
import InterestsSetup from "./InterestsSetup";

// Connect to backend socket server
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:9000";

const socket = io(BACKEND_URL, {
  withCredentials: true
});

// WebRTC configuration with STUN server for NAT traversal
const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

function App() {
  const [socketID, setSocketID] = useState("");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [allMessage, setAllMessage] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState("Disconnected");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [peerData, setPeerData] = useState(null);
  const [onlineCount, setOnlineCount] = useState({ count: 0, waiting: 0 });
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  
  // Video element refs
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  
  // WebRTC refs
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const dataChannel = useRef(null);
  const currentTargetId = useRef(""); // Store target ID in ref for ICE candidates

  // Send message via Socket.io (fallback) or WebRTC DataChannel
  const sendMessage = () => {
    if (!message) return;

    const newMessage = {
      sender: user?.username || socketID,
      message: message
    };

    // Show message locally
    setAllMessage((prev) => [...prev, newMessage]);

    // If DataChannel is open, use it (P2P), otherwise use Socket.io
    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(JSON.stringify(newMessage));
    } else {
      // Fallback to Socket.io
      socket.emit("sender", {
        targetID: targetId,
        message: message
      });
    }

    setMessage("");
  };

  // Initialize WebRTC peer connection
  const createPeerConnection = (targetSocketId) => {
    const pc = new RTCPeerConnection(rtcConfig);

    // Add local stream tracks to peer connection
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current);
      });
    }

    // Handle incoming remote stream
    pc.ontrack = (event) => {
      console.log("Received remote track");
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
        // Force play on mobile
        remoteVideo.current.play().catch(e => console.log("Play error:", e));
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate to", targetSocketId);
        socket.emit("ice-candidate", {
          targetID: targetSocketId,
          candidate: event.candidate
        });
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      setConnectionStatus(pc.connectionState);
      
      if (pc.connectionState === "connected") {
        setConnectionStatus("Connected");
      }
    };

    return pc;
  };

  // Create WebRTC DataChannel for P2P messaging
  const setupDataChannel = (channel) => {
    channel.onopen = () => {
      console.log("DataChannel opened");
      setConnectionStatus("Connected (P2P)");
    };

    channel.onclose = () => {
      console.log("DataChannel closed");
    };

    channel.onmessage = (event) => {
      const receivedMessage = JSON.parse(event.data);
      setAllMessage((prev) => [...prev, receivedMessage]);
    };

    dataChannel.current = channel;
  };

  // Initiate WebRTC connection (caller side)
  const startCall = async (targetSocketId, isInitiator = true) => {
    if (!isInitiator) return; // Only initiator creates offer
    
    console.log("Starting call to", targetSocketId);
    setConnectionStatus("Connecting...");
    
    // Store target ID
    currentTargetId.current = targetSocketId;

    // Create peer connection with target ID
    peerConnection.current = createPeerConnection(targetSocketId);

    // Create DataChannel (caller creates it)
    const channel = peerConnection.current.createDataChannel("chat");
    setupDataChannel(channel);

    // Create and send offer
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.emit("offer", {
        targetID: targetSocketId,
        offer: offer
      });

      console.log("Offer sent to", targetSocketId);
    } catch (error) {
      console.error("Error creating offer:", error);
      setConnectionStatus("Error");
    }
  };

  // Find random peer
  const findRandomPeer = () => {
    setSearching(true);
    setConnectionStatus("Searching...");
    setPeerData(null);
    setAllMessage([]);
    
    // Close existing connection if any
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    socket.emit("find-peer");
  };

  // Cancel search
  const cancelSearch = () => {
    setSearching(false);
    setConnectionStatus("Disconnected");
    socket.emit("cancel-search");
  };

  // Next peer (disconnect and find new)
  const nextPeer = () => {
    // Notify backend about call end
    socket.emit("end-call");
    
    // Close current connection
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    // Clear remote video
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
    
    setTargetId("");
    setPeerData(null);
    setAllMessage([]);
    setConnectionStatus("Disconnected");
    
    // Find new peer automatically
    findRandomPeer();
  };

  // End call completely
  const endCall = () => {
    // Notify backend about call end
    socket.emit("end-call");
    
    // Close current connection
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    // Clear remote video
    if (remoteVideo.current) {
      remoteVideo.current.srcObject = null;
    }
    
    setTargetId("");
    setPeerData(null);
    setAllMessage([]);
    setConnectionStatus("Disconnected");
    setSearching(false);
  };

  // Toggle microphone
  const toggleMic = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  // Toggle camera
  const toggleCamera = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const handleLogout = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:9000';
      await fetch(`${backendUrl}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
      setUser(null);
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:9000';
        console.log('Checking auth with backend:', backendUrl);
        
        const response = await fetch(`${backendUrl}/api/user`, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
        const data = await response.json();
        
        console.log('Auth check response:', data);
        
        if (data.authenticated) {
          setUser(data.user);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setLoading(false);
      }
    };

    // Longer delay to ensure cookies are set
    const timer = setTimeout(() => {
      checkAuth();
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) return;

    // Notify server that user is online
    socket.emit("user-online", user);

    // When socket connects
    socket.on("connect", () => {
      setSocketID(socket.id);
      console.log("Connected with socket ID:", socket.id);
      
      // Re-notify server after reconnection
      socket.emit("user-online", user);
    });

    // Online users count update
    socket.on("online-count", (data) => {
      setOnlineCount(data);
    });

    // Peer matched
    socket.on("peer-matched", (data) => {
      console.log("Peer matched:", data);
      setSearching(false);
      setTargetId(data.peerId);
      setPeerData(data.peerData);
      setConnectionStatus("Peer Found! Connecting...");
      
      // Only initiator starts call
      if (data.isInitiator) {
        setTimeout(() => {
          startCall(data.peerId, true);
        }, 500);
      }
    });

    // Waiting for peer
    socket.on("waiting-for-peer", () => {
      console.log("Waiting for peer...");
      setConnectionStatus("Waiting for peer...");
    });

    // Peer disconnected
    socket.on("peer-disconnected", () => {
      console.log("Peer disconnected");
      
      // Close connection
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
      
      // Clear remote video
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = null;
      }
      
      // Reset state
      setTargetId("");
      setPeerData(null);
      setConnectionStatus("Peer disconnected");
      setSearching(false);
      
      // Show notification
      alert("Peer disconnected from the call");
    });

    // Receive message from Socket.io (fallback)
    socket.on("receiver", (receiverData) => {
      setAllMessage((prev) => [...prev, receiverData]);
    });

    // Handle incoming WebRTC offer (callee side)
    socket.on("offer", async (data) => {
      console.log("Received offer from", data.sender);
      setConnectionStatus("Incoming call...");
      
      // Store target ID
      currentTargetId.current = data.sender;
      
      // Close existing connection if any
      if (peerConnection.current) {
        peerConnection.current.close();
      }

      // Create peer connection with sender ID
      peerConnection.current = createPeerConnection(data.sender);

      // Handle DataChannel created by caller
      peerConnection.current.ondatachannel = (event) => {
        console.log("DataChannel received");
        setupDataChannel(event.channel);
      };

      try {
        // Set remote description (offer)
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.offer)
        );

        // Create and send answer
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);

        socket.emit("answer", {
          targetID: data.sender,
          answer: answer
        });

        console.log("Answer sent to", data.sender);
      } catch (error) {
        console.error("Error handling offer:", error);
        setConnectionStatus("Error");
      }
    });

    // Handle incoming WebRTC answer (caller side)
    socket.on("answer", async (data) => {
      console.log("Received answer from", data.sender);

      try {
        if (peerConnection.current && peerConnection.current.signalingState !== "stable") {
          await peerConnection.current.setRemoteDescription(
            new RTCSessionDescription(data.answer)
          );
          console.log("Answer processed");
        }
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    });

    // Handle incoming ICE candidates
    socket.on("ice-candidate", async (data) => {
      console.log("Received ICE candidate from", data.sender);

      try {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
          console.log("ICE candidate added successfully");
        } else {
          console.log("Waiting for remote description before adding ICE candidate");
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    });

    // Start camera only once
    const startCamera = async () => {
      try {
        // Mobile-friendly constraints
        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user" // Front camera on mobile
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        localStream.current = stream;
        
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
        }
        
        console.log("Camera started");
      } catch (error) {
        console.error("Camera access denied", error);
        
        // Fallback: Try with basic constraints
        try {
          const basicStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          });
          
          localStream.current = basicStream;
          
          if (localVideo.current) {
            localVideo.current.srcObject = basicStream;
          }
          
          console.log("Camera started with basic constraints");
        } catch (fallbackError) {
          alert("Camera/microphone access is required for video chat");
        }
      }
    };

    startCamera();

    // Cleanup on unmount
    return () => {
      socket.off("receiver");
      socket.off("connect");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
      socket.off("peer-matched");
      socket.off("waiting-for-peer");
      socket.off("peer-disconnected");
      socket.off("online-count");

      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }

      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, [user]);

  // Show loading screen
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#272626',
        color: 'white',
        fontSize: '24px'
      }}>
        Loading...
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login onLoginSuccess={(userData) => setUser(userData)} />;
  }

  // Show interests setup if profile not completed
  if (!user.profileCompleted) {
    return <InterestsSetup user={user} onComplete={(updatedUser) => setUser(updatedUser)} />;
  }

  return (
    <div className="outer">

      {/* CHAT SECTION */}

      <div className="chat">

        <div className="chatHeader">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
              {user.avatar && (
                <img 
                  src={user.avatar} 
                  alt="avatar" 
                  style={{ width: '30px', height: '30px', borderRadius: '50%' }}
                />
              )}
              <span style={{ color: '#00ff9d', fontWeight: 'bold' }}>
                {user.username}
              </span>
            </div>
            <p style={{ fontSize: '11px', margin: 0, color: '#aaa' }}>
              Online: {onlineCount.count} | Waiting: {onlineCount.waiting}
            </p>
          </div>
          <button 
            onClick={handleLogout}
            style={{
              padding: '5px 10px',
              background: '#ff4444',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Logout
          </button>
        </div>

        {peerData && (
          <div style={{
            padding: '10px',
            background: '#444',
            borderBottom: '1px solid #777',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <img 
              src={peerData.avatar} 
              alt="peer" 
              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ color: '#00ff9d', fontWeight: 'bold' }}>
                {peerData.username}
              </div>
              <div style={{ fontSize: '11px', color: '#aaa' }}>
                {peerData.interests.slice(0, 3).join(', ')}
              </div>
            </div>
          </div>
        )}

        <div style={{
          padding: '10px',
          background: '#444',
          borderBottom: '1px solid #777',
          fontSize: '12px',
          color: '#ccc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Status: {connectionStatus}</span>
          {!searching && !targetId && (
            <button 
              onClick={findRandomPeer}
              style={{
                padding: '8px 16px',
                background: '#4CAF50',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🎲 Find Random Peer
            </button>
          )}
          {searching && (
            <button 
              onClick={cancelSearch}
              style={{
                padding: '8px 16px',
                background: '#ff4444',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
          )}
          {targetId && (
            <button 
              onClick={nextPeer}
              style={{
                padding: '8px 16px',
                background: '#2196F3',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              ⏭️ Next
            </button>
          )}
        </div>

        <div className="chatsection">

          {allMessage.map((msg, index) => (
            <div
              key={index}
              className={
                msg.sender === user.username || msg.sender === socketID ? "myMessage" : "otherMessage"
              }
            >
              <div style={{ fontSize: '10px', opacity: 0.7, marginBottom: '2px' }}>
                {msg.sender}
              </div>
              {msg.message}
            </div>
          ))}

        </div>

        <div className="input">

          <input
            value={message}
            type="text"
            placeholder="Type a message..."
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            disabled={!targetId}
            style={{ flex: 1 }}
          />

          <button onClick={sendMessage} disabled={!targetId}>
            Send
          </button>

        </div>

      </div>

      {/* VIDEO SECTION */}

      <div className="video">

        {/* Remote video - Full screen background */}
        <video
          id="remoteVideo"
          ref={remoteVideo}
          autoPlay
          playsInline
        />

        {/* Local video - Picture in picture (bottom right) */}
        <video
          id="localVideo"
          ref={localVideo}
          autoPlay
          muted
          playsInline
        />

        {/* Video Controls - Only show when connected */}
        {targetId && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '15px',
            background: 'rgba(0, 0, 0, 0.7)',
            padding: '15px 25px',
            borderRadius: '50px',
            zIndex: 20
          }}>
            
            {/* Mic Toggle */}
            <button
              onClick={toggleMic}
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                border: 'none',
                background: isMicOn ? '#4CAF50' : '#f44336',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s'
              }}
              title={isMicOn ? 'Mute Mic' : 'Unmute Mic'}
            >
              {isMicOn ? '🎤' : '🔇'}
            </button>

            {/* Camera Toggle */}
            <button
              onClick={toggleCamera}
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                border: 'none',
                background: isCameraOn ? '#4CAF50' : '#f44336',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s'
              }}
              title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
            >
              {isCameraOn ? '📹' : '📷'}
            </button>

            {/* Skip to Next */}
            <button
              onClick={nextPeer}
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                border: 'none',
                background: '#2196F3',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s'
              }}
              title="Skip to Next Peer"
            >
              ⏭️
            </button>

            {/* End Call */}
            <button
              onClick={endCall}
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '50%',
                border: 'none',
                background: '#f44336',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s'
              }}
              title="End Call"
            >
              📞
            </button>

          </div>
        )}

        {!targetId && !searching && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'white',
            background: 'rgba(0,0,0,0.7)',
            padding: '40px',
            borderRadius: '20px'
          }}>
            <h2 style={{ marginBottom: '20px' }}>Welcome to P2P Video Chat!</h2>
            <p style={{ marginBottom: '30px', color: '#ccc' }}>
              Click "Find Random Peer" to start chatting
            </p>
            <button 
              onClick={findRandomPeer}
              style={{
                padding: '15px 30px',
                background: '#4CAF50',
                border: 'none',
                borderRadius: '8px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '18px',
                fontWeight: 'bold'
              }}
            >
              🎲 Find Random Peer
            </button>
          </div>
        )}

        {searching && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: 'white',
            background: 'rgba(0,0,0,0.7)',
            padding: '40px',
            borderRadius: '20px'
          }}>
            <div className="spinner" style={{
              width: '50px',
              height: '50px',
              border: '5px solid #f3f3f3',
              borderTop: '5px solid #4CAF50',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 20px'
            }}></div>
            <h3>Searching for a peer...</h3>
            <p style={{ color: '#ccc' }}>Matching based on your interests</p>
          </div>
        )}

      </div>

    </div>
  );
}

export default App;
