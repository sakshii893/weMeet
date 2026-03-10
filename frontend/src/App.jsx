import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import "./App.css";

// Connect to backend socket server
const socket = io("http://localhost:9000");

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
  
  // Video element refs
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  
  // WebRTC refs
  const peerConnection = useRef(null);
  const localStream = useRef(null);
  const dataChannel = useRef(null);

  // Send message via Socket.io (fallback) or WebRTC DataChannel
  const sendMessage = () => {
    if (!message) return;

    const newMessage = {
      sender: socketID,
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
  const createPeerConnection = () => {
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
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate");
        socket.emit("ice-candidate", {
          targetID: targetId,
          candidate: event.candidate
        });
      }
    };

    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      setConnectionStatus(pc.connectionState);
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
  const startCall = async () => {
    if (!targetId) {
      alert("Please enter target socket ID");
      return;
    }

    console.log("Starting call to", targetId);
    setConnectionStatus("Connecting...");

    // Create peer connection
    peerConnection.current = createPeerConnection();

    // Create DataChannel (caller creates it)
    const channel = peerConnection.current.createDataChannel("chat");
    setupDataChannel(channel);

    // Create and send offer
    try {
      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.emit("offer", {
        targetID: targetId,
        offer: offer
      });

      console.log("Offer sent");
    } catch (error) {
      console.error("Error creating offer:", error);
      setConnectionStatus("Error");
    }
  };

  useEffect(() => {
    // When socket connects
    socket.on("connect", () => {
      setSocketID(socket.id);
      console.log("Connected with socket ID:", socket.id);
    });

    // Receive message from Socket.io (fallback)
    socket.on("receiver", (receiverData) => {
      setAllMessage((prev) => [...prev, receiverData]);
    });

    // Handle incoming WebRTC offer (callee side)
    socket.on("offer", async (data) => {
      console.log("Received offer from", data.sender);
      setConnectionStatus("Incoming call...");
      setTargetId(data.sender);

      // Create peer connection
      peerConnection.current = createPeerConnection();

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

        console.log("Answer sent");
      } catch (error) {
        console.error("Error handling offer:", error);
        setConnectionStatus("Error");
      }
    });

    // Handle incoming WebRTC answer (caller side)
    socket.on("answer", async (data) => {
      console.log("Received answer from", data.sender);

      try {
        await peerConnection.current.setRemoteDescription(
          new RTCSessionDescription(data.answer)
        );
        console.log("Answer processed");
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    });

    // Handle incoming ICE candidates
    socket.on("ice-candidate", async (data) => {
      console.log("Received ICE candidate from", data.sender);

      try {
        if (peerConnection.current) {
          await peerConnection.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        }
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    });

    // Start camera
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        
        localStream.current = stream;
        
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
        }
        
        console.log("Camera started");
      } catch (error) {
        console.error("Camera access denied", error);
        alert("Camera/microphone access is required for video chat");
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

      if (localStream.current) {
        localStream.current.getTracks().forEach(track => track.stop());
      }

      if (peerConnection.current) {
        peerConnection.current.close();
      }
    };
  }, []);

  return (
    <div className="outer">

      {/* CHAT SECTION */}

      <div className="chat">

        <div className="chatHeader">
          <p>Your ID:</p>
          <span>{socketID}</span>
          <p style={{ marginTop: "10px", fontSize: "12px" }}>
            Status: {connectionStatus}
          </p>
        </div>

        <div className="chatsection">

          {allMessage.map((msg, index) => (
            <div
              key={index}
              className={
                msg.sender === socketID ? "myMessage" : "otherMessage"
              }
            >
              {msg.message}
            </div>
          ))}

        </div>

        <div className="input">

          <input
            value={targetId}
            type="text"
            placeholder="Target socket id"
            onChange={(e) => setTargetId(e.target.value)}
          />

          <button onClick={startCall}>
            Connect
          </button>

          <input
            value={message}
            type="text"
            placeholder="Message"
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          />

          <button onClick={sendMessage}>
            Send
          </button>

        </div>

      </div>

      {/* VIDEO SECTION */}

      <div className="video">

        <video
          id="localVideo"
          ref={localVideo}
          autoPlay
          muted
          className="videoBox"
        />

        <video
          id="remoteVideo"
          ref={remoteVideo}
          autoPlay
          className="videoBox"
        />

      </div>

    </div>
  );
}

export default App;
