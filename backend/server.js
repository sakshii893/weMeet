const express = require("express")
const http=require("http")
const { Server } = require('socket.io');

const app=express()
const httpServer=http.createServer(app)
const PORT=process.env.PORT || 9000
const io = new Server(httpServer,{
    cors:{
        origin:["http://localhost:5173","http://localhost:5174"],
        methods:["GET","POST"]
    }
});

app.get("/health",(req,res)=>{
    res.send({
        status:"ok",
        code:200,
        message:"health OK "
    })
})
io.on("connection",(socket)=>{
    console.log("new client connected",socket.id)
    socket.on("sender",(senderData)=>{
        const {targetID,message} = senderData
        console.log(targetID,message)

        
        io.to(targetID).emit("receiver",{
            sender:socket.id,
            message:message
        })
    })
})

httpServer.listen(PORT,()=>{
    console.log("server is running on",PORT)
})