const express = require("express")
const http=require("http")
const { Server } = require('socket.io');

const app=express()
const httpServer=http.createServer(app)
const PORT=process.env.PORT || 8000
const io = new Server(httpServer);

app.get("/health",(req,res)=>{
    res.send({
        status:"ok",
        code:200,
        message:"health OK "
    })
})
io.on("connection",(socket)=>{
    console.log("new. client connected",socket.id)
})

httpServer.listen(PORT,()=>{
    console.log("server is running on",PORT)
})