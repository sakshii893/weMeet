import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import "./App.css";

// connect to backend socket server
const socket = io("http://localhost:9000");

function App() {
  const [socketID, setSocketID] = useState("");
  const [targetId, setTargetId] = useState("");
  const [message, setMessage] = useState("");
  const [allMessage, setAllMessage] = useState([]);

  // send message to another socket
  const sendMessage = () => {

    if(!message) return;

    const newMessage = {
      sender: socketID,
      message: message
    };

    // show message locally
    setAllMessage((prev) => [...prev, newMessage]);

    // send to server
    socket.emit("sender", {
      targetID: targetId,
      message: message
    });

    setMessage("");
  };

  useEffect(() => {

    // when socket connects
    socket.on("connect", () => {
      setSocketID(socket.id);
    });

    // receive message from server
    socket.on("receiver", (receiverData) => {
      setAllMessage((prev) => [...prev, receiverData]);
    });

    return () => {
      socket.off("receiver");
      socket.off("connect");
    };

  }, []);

  return (
    <div className="outer">

      {/* CHAT SECTION */}

      <div className="chat">

        <div className="chatHeader">
          <p>Your ID:</p>
          <span>{socketID}</span>
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

          <input
            value={message}
            type="text"
            placeholder="Message"
            onChange={(e) => setMessage(e.target.value)}
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
          autoPlay
          muted
          className="videoBox"
        />

        <video
          id="remoteVideo"
          autoPlay
          className="videoBox"
        />

      </div>

    </div>
  );
}

export default App;