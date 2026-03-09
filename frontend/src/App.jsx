import { useState } from "react";
import { io } from "socket.io-client";
import "./App.css";
import { useEffect } from "react";
const socket = io("http://localhost:9000");

function App() {
  const [socketID, setSocketID] = useState("");
  const [targetId,serTargetId]=useState("")
  const [message,setMessage]=useState()
  const sendMessage=()=>{
    console.log("ruko bhej raha ....")
    socket.emit("sender",{
      targertID:targetId,
      message:message
    })


  }
  
  useEffect(() => {
    socket.on("connect", () => {
      console.log(socket.id); // x8WIv7-mJelg7on_ALbx
      setSocketID(socket.id);

    });
    socket.on("receiver",(receiverData)=>{
      const {sender,message}=receiverData
        setMessage(message)
    })
  }, []);

  return (
    <>
      <h1>{socketID} </h1>

      <div className="inputclass">
        <input
        value={targetId}
          className="targetclass"
          type="text"
          placeholder="enter target id"
          onChange={(e)=>serTargetId(e.target.value)}
        />
        <input
        value={message}
          className="messageclass"
          type="text"
          placeholder="enter the. message."
          onChange={(e)=>setMessage(e.target.value)}
        />
        <button onClick={sendMessage} className="sendmessageclass">send message</button>
        <div>
          {message}
        </div>
      </div>
    </>
  );
}

export default App;
