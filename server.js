require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');

// const connectDB = require('./src/config/db');
// const authRoutes = require('./src/routes/auth');
// const scooterRoutes = require('./src/routes/scooters');
// const rentalRoutes = require('./src/routes/rentals');
// const adminRoutes = require('./src/routes/admin');

const app = express();
app.use(cors());
app.use(express.json());

// // routes
// app.use('/api/auth', authRoutes);
// app.use('/api/scooters', scooterRoutes);
// app.use('/api/rentals', rentalRoutes);
// app.use('/api/admin', adminRoutes);

app.get('/', (req,res)=> res.send('Scooter Rental API running'));

// create http server and attach socket.io
// const server = http.createServer(app);
// const { Server } = require('socket.io');
// const io = new Server(server, {
//   cors: { origin: '*' }
// });

// Simple socket events: clients (scooter mobile or admin) connect & send location updates
// io.on('connection', socket => {
//   console.log('socket connected', socket.id);

//   socket.on('joinRoom', (room) => {
//     socket.join(room);
//   });

//   // scooter location update: { scooterId, coords: [lng,lat], battery }
//   socket.on('locationUpdate', async (data) => {
//     // broadcast to admin room
//     io.to('admin').emit('scooterLocation', data);
//     // Optionally you can persist this to DB by calling your model here (avoid heavy ops)
//   });

//   socket.on('disconnect', () => {
//     // console.log('disconnected', socket.id);
//   });
// });

// const PORT = process.env.PORT || 5000;
// async function start(){
//   await connectDB(process.env.MONGO_URI);
//   server.listen(PORT, ()=> console.log('Server listening on port', PORT));
// }
// start();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

// module.exports = { app, io };
