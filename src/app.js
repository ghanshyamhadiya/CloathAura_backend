import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';
import userRoutes from './routes/user.routes.js';
import cookieParser from 'cookie-parser';
import productRoutes from './routes/product.routes.js';
import cartWhislistRoutes from './routes/wishlist.cart.routes.js';
import reviewRoutes from './routes/review.routes.js';
import orderRoutes from './routes/order.routes.js';
import couponRoutes from './routes/coupon.routes.js';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import { socketAuth } from './middleware/auth.js';
import { verifyToken } from './utils/jwt.js';
import User from './models/user.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== 'production') dotenv.config();

const CLIENT_URL = 'https://cloth-aura.vercel.app';
const CLIENT_URL2 = process.env.CORS_URL2 || 'http://localhost:5173';

const app = express();

const corsOptions = {
  origin: [CLIENT_URL, CLIENT_URL2],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '40kb' }));
app.use(express.urlencoded({ limit: '40kb', extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'view'));
app.use(express.static(path.join(__dirname, 'public')));
app.set('port', process.env.PORT || 8000);

const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, CLIENT_URL2],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
});

app.use((req, res, next) => { req.io = io; next(); });

io.use(socketAuth);

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id} auth=${!!socket.user}`);

  if (socket.user) {
    const uid = socket.userId;
    socket.join(`user:${uid}`);
    socket.join(`role:${socket.userRole}`);
  }

  socket.on('auth:authenticate', async (data) => {
    try {
      const token = data?.token;
      if (!token) {
        socket.emit('auth:error', { message: 'No token provided', code: 'NO_TOKEN' });
        return;
      }
      const decoded = verifyToken(token, 'access');
      const user = await User.findById(decoded.id).select('-password -refreshToken').lean();
      if (!user) {
        socket.emit('auth:error', { message: 'User not found', code: 'USER_NOT_FOUND' });
        return;
      }
      socket.user = { ...user, _id: user._id.toString(), id: user._id.toString() };
      socket.userId = socket.user.id;
      socket.userRole = socket.user.role;
      socket.join(`user:${socket.userId}`);
      socket.join(`role:${socket.userRole}`);
      socket.emit('auth:success', { message: 'Authentication successful', user: socket.user });
      console.log(`User authenticated on socket ${socket.id}: ${socket.user.username}`);
    } catch (err) {
      console.error('auth:authenticate error:', err);
      const code = err.message === 'Token has expired' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      socket.emit('auth:error', { message: 'Authentication failed', code });
    }
  });

  socket.on('join:room', (data) => {
    const room = data?.room;
    if (room && typeof room === 'string') {
      socket.join(room);
      socket.emit('room:joined', { room });
    }
  });

  socket.on('leave:room', (data) => {
    const room = data?.room;
    if (room && typeof room === 'string') {
      socket.leave(room);
      socket.emit('room:left', { room });
    }
  });

  socket.on('user:status', (data) => {
    const status = data?.status;
    if (!socket.userId) return socket.emit('auth:error', { message: 'Not authenticated', code: 'NO_AUTH' });
    socket.to(`user:${socket.userId}`).emit('user:statusUpdate', {
      userId: socket.userId,
      status,
      timestamp: new Date(),
    });
  });

  socket.on('cart:update', (data) => {
    if (!socket.userId) return socket.emit('auth:error', { message: 'Not authenticated', code: 'NO_AUTH' });
    socket.to(`user:${socket.userId}`).emit('cart:updated', { ...data, timestamp: new Date() });
  });

  socket.on('wishlist:update', (data) => {
    if (!socket.userId) return socket.emit('auth:error', { message: 'Not authenticated', code: 'NO_AUTH' });
    socket.to(`user:${socket.userId}`).emit('wishlist:updated', { ...data, timestamp: new Date() });
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} user=${socket.user?.username ?? 'unauth'} reason=${reason}`);
    if (socket.userId) {
      socket.to(`user:${socket.userId}`).emit('user:sessionDisconnected', {
        sessionId: socket.id,
        timestamp: new Date(),
        reason,
      });
    }
  });

  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.user?.username ?? socket.id}:`, error);
    try { socket.emit('error', { message: 'A socket error occurred', timestamp: new Date() }); } catch(e) {}
  });

  socket.emit('connection:established', {
    message: 'Connected successfully',
    userId: socket.userId || null,
    socketId: socket.id,
    timestamp: new Date(),
  });
});

// routes and health endpoint - unchanged
app.get('/api/health', (req, res) => res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() }));
app.use('/api', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api', cartWhislistRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);

app.get('/add', (req, res) => res.render('product'));
app.get('/update/:id', (req, res) => res.render('updateProduct', { productId: req.params.id }));
app.get('/products', (req, res) => res.render('AddedProduct'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log('Connected to MongoDB');
    server.listen(app.get('port'), () => {
      console.log(`Server running on port ${app.get('port')}`);
      io.emit('backendUp', { status: 'OK' });
    });
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

start();
